/*
 * 라운지 방 관련 화면 쪽 타입과 규칙.
 * 참가자·방장·입장 조건은 서버가 정하고(@lounge/shared 의 모양으로 받는다), 여기에는 화면에서 쓰는 것만 둔다.
 */
import type { RoomMember, RoomSummary, RoomView } from '@lounge/shared';

export { MAX_MEMBERS, MIN_MEMBERS, ROOM_NAME_MAX } from '@lounge/shared';

/** 방 만들기·설정 창에서 고르는 값. 비밀번호는 바꿀 때만 (undefined 면 그대로) */
export type RoomSettings = {
  name: string;
  isPublic: boolean;
  password: string | null | undefined;
  locked: boolean;
  maxMembers: number;
};

/** 로비 창문 하나 */
export type RoomInfo = RoomSummary;

export type Member = {
  id: string;
  nickname: string;
  isHost: boolean;
  isFriend: boolean;
  /** 게스트 (친구 요청을 보낼 수 없다) */
  isGuest?: boolean;
  /** 연습 상대(가상 사람) */
  isBot?: boolean;
};

/** friendIds: 내 친구 (참가자 목록에 친구 표시) */
export function toMembers(view: RoomView, friendIds: ReadonlySet<string> = new Set()): Member[] {
  return view.members.map((m: RoomMember) => ({
    id: m.userId,
    nickname: m.nickname,
    isHost: m.userId === view.hostId,
    isFriend: friendIds.has(m.userId),
    isGuest: m.isGuest,
    isBot: m.isBot,
  }));
}

export type Song = {
  videoId: string;
  title: string;
  durationSec: number;
};

export type ChatMessage =
  | { id: string; kind: 'user'; userId: string; nickname: string; text: string; sentAt: string }
  | { id: string; kind: 'system'; text: string; sentAt: string }
  /** 명령어 결과·오류처럼 나에게만 보이는 안내 */
  | { id: string; kind: 'private'; text: string; sentAt: string };

/** 지금 화면을 쓰는 사람 */
export type Me = { id: string; nickname: string };

/* 로비 창문 상태 */

export type WindowState = 'open' | 'game' | 'full' | 'locked';

export function windowState(room: RoomInfo): WindowState {
  if (room.locked) return 'locked';
  if (room.members >= room.maxMembers) return 'full';
  if (room.game) return 'game';
  return 'open';
}

/** 인원이 많을수록 창문이 더 밝다 (3단계) */
export function brightness(room: RoomInfo): 1 | 2 | 3 {
  const ratio = room.members / room.maxMembers;
  if (ratio >= 0.67) return 3;
  if (ratio >= 0.34) return 2;
  return 1;
}

export function isEnterable(room: RoomInfo): boolean {
  const state = windowState(room);
  return state === 'open' || state === 'game';
}

/** 입장 가능한 방 → 가득 찬 방 → 잠긴 방 순 */
export function sortRooms(rooms: RoomInfo[]): RoomInfo[] {
  const rank: Record<WindowState, number> = { open: 0, game: 0, full: 1, locked: 2 };
  return [...rooms].sort((a, b) => rank[windowState(a)] - rank[windowState(b)]);
}
