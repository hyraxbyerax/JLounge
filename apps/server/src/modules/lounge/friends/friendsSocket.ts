/*
 * 친구 소켓 이벤트 (회원만): 접속 중 신호, 친구 초대.
 * - 신호를 받으면 지금 있는 방·활동을 Redis에 두고, 바뀌었으면 친구들에게 내 공개 범위로 걸러 알린다
 * - 초대는 Redis에 10분짜리 초대장을 두고 친구에게 알린다. 초대장이 있으면 비밀번호 없이 들어오고,
 *   잠긴 방은 방장이 보낸 초대장만 통한다 (rooms/handlers.ts 의 room:join)
 */
import { gameName, targetUserInput, type GameType } from '@lounge/shared';
import type { Pool } from 'pg';
import { AppError } from '../../../shared/http/errors.ts';
import { validate } from '../../../shared/http/validate.ts';
import type { Logger } from '../../../shared/logger.ts';
import type { RedisConnections } from '../../../shared/redis.ts';
import { userChannel, type IoServer, type IoSocket } from '../../../shared/realtime/socket.ts';
import { socketRoomId } from '../rooms/channels.ts';
import type { RoomHandlers } from '../rooms/handlers.ts';
import type { RoomStore } from '../rooms/roomStore.ts';
import { filterPresence, type ActivityStore, type RawPresence } from './activity.ts';
import * as repo from './friendsRepo.ts';

/** 초대장 유효 시간 */
export const INVITE_TTL_SEC = 10 * 60;
export const inviteKey = (roomId: string, userId: string) => `room:${roomId}:invite:${userId}`;
export type Invitation = { inviterId: string; byHost: boolean };

const fail = (code: string, message: string) => new AppError(code, message);

type Deps = {
  io: IoServer;
  db: Pool;
  redis: RedisConnections['client'];
  activity: ActivityStore;
  roomStore: RoomStore;
  rooms: RoomHandlers;
  logger: Logger;
};

export function createFriendsSocket({ io, db, redis, activity, roomStore, rooms, logger }: Deps) {
  async function currentActivity(socket: IoSocket): Promise<RawPresence> {
    const roomId = socketRoomId(socket);
    if (!roomId) return { roomCode: null, roomName: null, activity: null };
    const [view, game] = await Promise.all([roomStore.view(roomId), redis.get(`room:${roomId}:game`)]);
    const playing = game ? (JSON.parse(game) as { state: { type: GameType; phase: string } }).state : null;
    return {
      roomCode: view?.code ?? null,
      roomName: view?.name ?? null,
      activity: playing?.phase === 'playing' ? `${gameName(playing.type)} 중` : view ? '라운지에서 쉬는 중' : null,
    };
  }

  /** 내 상태가 바뀌면 친구들에게 (내 공개 범위로 거른 것을) 알린다 */
  async function tellFriends(userId: string, raw: RawPresence | null) {
    const [friends, visibility] = await Promise.all([repo.friendIds(db, userId), repo.visibilities(db, [userId])]);
    const presence = filterPresence(raw, visibility.get(userId) ?? 'all');
    for (const friendId of friends) io.to(userChannel(friendId)).emit('presence:update', { userId, presence });
  }

  function register(socket: IoSocket) {
    const me = () => socket.data.user;

    socket.on('presence:heartbeat', () => {
      if (me().isGuest) return;
      void (async () => {
        const raw = await currentActivity(socket);
        if (await activity.beat(me().userId, raw)) await tellFriends(me().userId, raw);
      })().catch((err: unknown) => logger.warn('접속 신호 처리 실패', { err }));
    });

    socket.on('friend:invite', (input, ack) =>
      rooms.respond(socket, 'friend:invite', ack, async () => {
        if (me().isGuest) throw fail('LOGIN_REQUIRED', '로그인한 학생만 친구를 초대할 수 있어요');
        const roomId = await rooms.requireRoom(socket);
        const { userId } = validate(targetUserInput, input);
        if ((await repo.relation(db, me().userId, userId)) !== 'friend') {
          throw fail('FRIEND_NOT_FRIEND', '친구만 초대할 수 있어요');
        }
        const view = await roomStore.view(roomId);
        if (!view) throw fail('ROOM_NOT_FOUND', '방이 없어졌어요');
        if (view.members.some((m) => m.userId === userId)) throw fail('FRIEND_ALREADY_HERE', '이미 이 방에 있어요');
        // 초대는 방장만 (2026-11-25 사용자 결정)
        const byHost = view.hostId === me().userId;
        if (!byHost) throw fail('INVITE_HOST_ONLY', '초대는 방장만 할 수 있어요');
        const [online] = (await activity.get([userId])).values();
        if (!online) throw fail('FRIEND_OFFLINE', '친구가 지금 접속해 있지 않아요');

        const invitation: Invitation = { inviterId: me().userId, byHost };
        await redis.set(inviteKey(roomId, userId), JSON.stringify(invitation), { EX: INVITE_TTL_SEC });
        io.to(userChannel(userId)).emit('friend:invited', {
          from: { userId: me().userId, nickname: me().nickname },
          room: { code: view.code, name: view.name },
        });
        return null;
      }),
    );

    // 로그아웃·탭 닫기: 다른 탭이 없으면 바로 오프라인으로 (없으면 60초 뒤 저절로)
    socket.on('disconnect', () => {
      if (me().isGuest) return;
      void io
        .in(userChannel(me().userId))
        .fetchSockets()
        .then(async (sockets) => {
          if (sockets.length > 0) return;
          await activity.clear(me().userId);
          await tellFriends(me().userId, null);
        })
        .catch((err: unknown) => logger.warn('오프라인 처리 실패', { err }));
    });
  }

  return { register, tellFriends };
}
