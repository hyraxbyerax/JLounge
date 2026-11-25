/*
 * 친구 API (/api/lounge/friends/*, 로그인한 회원만).
 * 요청이 오면 상대에게 바로 알리고(접속 중이면), 아니면 다음에 목록을 열 때 보인다.
 */
import {
  DM_RATE,
  dmSendInput,
  FRIEND_REQUESTS_PER_DAY,
  friendRequestInput,
  OFFLINE,
  type DirectMessage,
  type FriendEntry,
  type FriendsOverview,
} from '@lounge/shared';
import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthProvider } from '../../../shared/auth/AuthProvider.ts';
import { currentUser, requireAuth, requireMember } from '../../../shared/auth/middleware.ts';
import { AppError } from '../../../shared/http/errors.ts';
import { validate } from '../../../shared/http/validate.ts';
import type { Counter } from '../../../shared/rateLimit.ts';
import { filterPresence, type ActivityStore } from './activity.ts';
import * as dm from './dmRepo.ts';
import * as repo from './friendsRepo.ts';

export type Notify = {
  request: (to: string, from: { userId: string; nickname: string }) => void;
  changed: (to: string) => void;
  /** 1:1 메시지를 받는 사람과 보낸 사람(다른 탭)에게 */
  dm: (message: DirectMessage) => void;
};

type Deps = { auth: AuthProvider; db: Pool; activity: ActivityStore; counter: Counter; notify: Notify };

const userParam = z.object({ userId: z.string().min(1).max(100) });
const beforeQuery = z.object({
  before: z
    .string()
    .regex(/^\d{1,18}$/)
    .optional(),
});

const REQUEST_ERRORS: Partial<Record<repo.RequestResult, [string, string]>> = {
  'already-friend': ['FRIEND_ALREADY', '이미 친구예요'],
  'already-requested': ['FRIEND_REQUESTED', '이미 친구 요청을 보냈어요'],
  blocked: ['FRIEND_YOU_BLOCKED', '차단한 사람이에요. 차단을 풀고 다시 요청해주세요'],
  // 상대가 나를 차단한 경우에는 차단 사실을 알리지 않는다
  'blocked-by': ['FRIEND_UNAVAILABLE', '친구 요청을 보낼 수 없어요'],
};

/** 친구 목록 + 각 친구의 상태 (친구가 정한 공개 범위로 거름) */
export async function overview(db: Pool, activity: ActivityStore, me: string): Promise<FriendsOverview> {
  const lists = await repo.lists(db, me);
  const ids = lists.friends.map((f) => f.userId);
  const [raw, visibility, unread] = await Promise.all([
    activity.get(ids),
    repo.visibilities(db, ids),
    dm.unreadCounts(db, me),
  ]);
  const friends: FriendEntry[] = lists.friends.map((f) => ({
    ...f,
    presence: visibility.has(f.userId) ? filterPresence(raw.get(f.userId) ?? null, visibility.get(f.userId)!) : OFFLINE,
    unread: unread.get(f.userId) ?? 0,
  }));
  // 접속 중인 친구가 먼저
  friends.sort((a, b) => Number(b.presence.online) - Number(a.presence.online));
  return { ...lists, friends };
}

export function friendsRouter({ auth, db, activity, counter, notify }: Deps): Router {
  const router = Router();
  router.use(requireAuth(auth), requireMember);

  router.get('/', async (_req, res) => {
    res.json({ data: await overview(db, activity, currentUser(res).userId) });
  });

  router.post('/requests', async (req, res) => {
    const me = currentUser(res);
    const input = validate(friendRequestInput, req.body);

    let targetId = input.userId;
    if (!targetId) {
      const found = await repo.findTargets(db, { nickname: input.nickname, friendCode: input.friendCode });
      if (found.length === 0) {
        throw new AppError('FRIEND_NOT_FOUND', '그런 회원이 없어요. 닉네임이나 친구 코드를 다시 확인해주세요', 404);
      }
      if (found.length > 1) {
        throw new AppError('FRIEND_AMBIGUOUS', '같은 닉네임이 여러 명이에요. 친구 코드로 요청해주세요');
      }
      targetId = found[0]!.userId;
    }
    if (targetId === me.userId) throw new AppError('FRIEND_SELF', '나에게는 친구 요청을 보낼 수 없어요');
    if (targetId.startsWith('guest_') || targetId === 'bot') {
      throw new AppError('FRIEND_GUEST', '로그인한 사람에게만 친구 요청을 보낼 수 있어요');
    }

    const used = await counter.hit(`user:${me.userId}:friendreq`, 24 * 60 * 60);
    if (used > FRIEND_REQUESTS_PER_DAY) {
      throw new AppError('FRIEND_LIMIT', `친구 요청은 하루에 ${FRIEND_REQUESTS_PER_DAY}번까지 보낼 수 있어요`, 429);
    }

    let result: repo.RequestResult;
    try {
      result = await repo.sendRequest(db, me.userId, targetId);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // 없는 회원(23503) / 두 사람이 동시에 요청(23505)
      if (code === '23503') throw new AppError('FRIEND_NOT_FOUND', '그런 회원이 없어요', 404);
      if (code === '23505') result = await repo.sendRequest(db, me.userId, targetId);
      else throw err;
    }
    const error = REQUEST_ERRORS[result];
    if (error) throw new AppError(error[0], error[1]);

    if (result === 'accepted') {
      notify.changed(targetId);
      res.json({ data: { result, message: '서로 요청해서 바로 친구가 됐어요' } });
      return;
    }
    notify.request(targetId, { userId: me.userId, nickname: me.nickname });
    res.status(201).json({ data: { result, message: '친구 요청을 보냈어요' } });
  });

  router.post('/:userId/accept', async (req, res) => {
    const me = currentUser(res).userId;
    const { userId } = validate(userParam, req.params);
    if (!(await repo.accept(db, me, userId))) throw new AppError('FRIEND_NO_REQUEST', '받은 친구 요청이 없어요', 404);
    notify.changed(userId);
    res.json({ data: { message: '친구가 됐어요' } });
  });

  // 친구 끊기 · 보낸 요청 취소 · 받은 요청 거절
  router.delete('/:userId', async (req, res) => {
    const me = currentUser(res).userId;
    const { userId } = validate(userParam, req.params);
    await repo.remove(db, me, userId);
    notify.changed(userId);
    res.status(204).end();
  });

  router.post('/:userId/block', async (req, res) => {
    const me = currentUser(res).userId;
    const { userId } = validate(userParam, req.params);
    if (userId === me) throw new AppError('FRIEND_SELF', '나를 차단할 수는 없어요');
    try {
      await repo.block(db, me, userId);
    } catch (err) {
      if ((err as { code?: string }).code === '23503')
        throw new AppError('FRIEND_NOT_FOUND', '그런 회원이 없어요', 404);
      throw err;
    }
    notify.changed(userId);
    res.json({ data: { message: '차단했어요. 서로 친구 요청을 보낼 수 없어요' } });
  });

  router.delete('/:userId/block', async (req, res) => {
    const me = currentUser(res).userId;
    const { userId } = validate(userParam, req.params);
    await repo.unblock(db, me, userId);
    res.status(204).end();
  });

  /* 친구끼리 1:1 대화 */

  async function requireFriend(me: string, other: string) {
    if ((await repo.relation(db, me, other)) !== 'friend') {
      throw new AppError('DM_NOT_FRIEND', '친구에게만 메시지를 보낼 수 있어요', 403);
    }
  }

  router.get('/:userId/messages', async (req, res) => {
    const me = currentUser(res).userId;
    const { userId } = validate(userParam, req.params);
    const { before } = validate(beforeQuery, req.query);
    await requireFriend(me, userId);
    res.json({ data: await dm.history(db, me, userId, before) });
  });

  router.post('/:userId/messages', async (req, res) => {
    const me = currentUser(res).userId;
    const { userId } = validate(userParam, req.params);
    const { text } = validate(dmSendInput, req.body);
    await requireFriend(me, userId);
    if ((await counter.hit(`user:${me}:dmrate`, DM_RATE.windowSec)) > DM_RATE.limit) {
      throw new AppError('DM_TOO_FAST', '메시지를 너무 빨리 보내고 있어요. 잠시 후에 보내주세요', 429);
    }
    const message = await dm.send(db, me, userId, text);
    notify.dm(message);
    res.status(201).json({ data: message });
  });

  router.post('/:userId/read', async (req, res) => {
    const me = currentUser(res).userId;
    const { userId } = validate(userParam, req.params);
    await dm.markRead(db, me, userId);
    res.status(204).end();
  });

  return router;
}
