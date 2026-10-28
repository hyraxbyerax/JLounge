/*
 * 라운지 방 관련 타입과 규칙.
 * 지금은 서버 없이 화면 안에서만 쓰고, 서버가 생기면 같은 모양으로 API·소켓에서 받는다.
 */

export type RoomSettings = {
  name: string;
  isPublic: boolean;
  /** 서버가 생기면 해시로만 저장한다. 지금은 화면 안에서만 비교한다. */
  password: string | null;
  locked: boolean;
  maxMembers: number;
};

export type RoomInfo = RoomSettings & {
  id: string;
  code: string;
  members: number;
  game: string | null;
  nowPlaying: string | null;
};

export type Member = {
  id: string;
  nickname: string;
  isHost: boolean;
  isFriend: boolean;
  /** 연습 상대(가상 사람) */
  isBot?: boolean;
};

export type Song = {
  videoId: string;
  title: string;
  durationSec: number;
};

export type QueuedSong = Song & {
  entryId: string;
  requesterId: string;
  requesterNickname: string;
};

export type ChatMessage =
  | { id: string; kind: 'user'; userId: string; nickname: string; text: string; sentAt: string }
  | { id: string; kind: 'system'; text: string; sentAt: string }
  /** 명령어 결과·오류처럼 나에게만 보이는 안내 */
  | { id: string; kind: 'private'; text: string; sentAt: string };

/** 지금 화면을 쓰는 사람. 인증이 붙으면 서버가 발급한 ID·닉네임으로 바뀐다. */
export const ME = { id: 'me', nickname: '전북곰' } as const;

export const ROOM_NAME_MAX = 20;
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 12;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createRoomCode(random: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join('');
}

export function createRoom(settings: RoomSettings): RoomInfo {
  const code = createRoomCode();
  return { ...settings, id: `room-${code}`, code, members: 1, game: null, nowPlaying: null };
}

/* 참가자 — 배열 순서가 들어온 순서다 (Redis에서는 입장 시각을 점수로 한 Sorted Set) */

/** 맨 뒤에 들어온다. 빈 방이면 방장 */
export function joinMembers(members: Member[], member: Member): Member[] {
  const others = members.filter((m) => m.id !== member.id);
  return [...others, { ...member, isHost: others.length === 0 }];
}

/** 나간다. 방장이 나가면 가장 오래 있던 사람이 방장. 아무도 안 남으면 null (방 삭제) */
export function leaveMembers(members: Member[], userId: string): Member[] | null {
  const leaving = members.find((m) => m.id === userId);
  const rest = members.filter((m) => m.id !== userId);
  if (rest.length === 0) return null;
  if (!leaving?.isHost) return rest;
  return rest.map((m, i) => ({ ...m, isHost: i === 0 }));
}

export function transferHost(members: Member[], toId: string): Member[] {
  if (!members.some((m) => m.id === toId)) return members;
  return members.map((m) => ({ ...m, isHost: m.id === toId }));
}

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
