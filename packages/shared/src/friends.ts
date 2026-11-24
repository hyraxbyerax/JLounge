/*
 * 친구와 활동 상태 (명세 9장, 로그인한 회원만).
 * 활동 상태는 서버가 각자의 공개 범위(all / online / hidden)에 맞춰 걸러서 보낸다.
 */
import { z } from 'zod';

/** 하루에 보낼 수 있는 친구 요청 수 (2026-11-25 정함) */
export const FRIEND_REQUESTS_PER_DAY = 20;
/** 브라우저가 "접속 중" 신호를 보내는 주기와, 신호가 끊긴 뒤 오프라인으로 보이기까지 */
export const PRESENCE_HEARTBEAT_MS = 20_000;
export const PRESENCE_TTL_SEC = 60;

export type PresenceVisibility = 'all' | 'online' | 'hidden';

export const VISIBILITY_LABEL: Record<PresenceVisibility, string> = {
  all: '전체 공개 (접속 여부 + 있는 방·하는 활동)',
  online: '접속 여부만',
  hidden: '숨김 (오프라인으로 보여요)',
};

/** 친구에게 보이는 내 상태 (공개 범위로 걸러진 것) */
export type FriendPresence = {
  online: boolean;
  /** 공개 범위가 all 일 때만: 있는 방 (따라가기에 쓴다) */
  room: { code: string; name: string } | null;
  /** 공개 범위가 all 일 때만: 하는 활동 (예: 캐치마인드 중) */
  activity: string | null;
};

export const OFFLINE: FriendPresence = { online: false, room: null, activity: null };

export type UserBrief = { userId: string; nickname: string };
export type FriendEntry = UserBrief & { presence: FriendPresence };

export type FriendsOverview = {
  friends: FriendEntry[];
  incoming: UserBrief[];
  outgoing: UserBrief[];
  blocked: UserBrief[];
};

export const friendRequestInput = z
  .object({
    userId: z.string().min(1).max(100).optional(),
    nickname: z.string().trim().min(1, '닉네임을 입력해주세요').max(20).optional(),
    friendCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{8}$/, '친구 코드는 8자리예요')
      .optional(),
  })
  .refine((v) => v.userId || v.nickname || v.friendCode, { message: '닉네임이나 친구 코드를 입력해주세요' });
export type FriendRequestInput = z.input<typeof friendRequestInput>;
