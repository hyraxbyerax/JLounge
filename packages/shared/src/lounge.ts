/*
 * 라운지 방·채팅의 공통 규칙과 모양. 화면은 미리 안내하는 데, 서버는 최종 판정에 같은 스키마를 쓴다.
 */
import { z } from 'zod';
import type { Stroke } from './games/drawing.ts';
import type { GamePrivate, GameView } from './games/index.ts';
import type { MusicState } from './music.ts';

export const ROOM_NAME_MAX = 20;
export const ROOM_PASSWORD_MAX = 30;
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 12;
export const ROOM_CODE_LENGTH = 6;
export const CHAT_MAX = 200;
/** 도배 방지: 한 사람당 CHAT_BURST_WINDOW_SEC 초에 CHAT_BURST_LIMIT 개까지 */
export const CHAT_BURST_LIMIT = 5;
export const CHAT_BURST_WINDOW_SEC = 5;
/** 비밀번호를 이만큼 틀리면 그 방 입장 시도를 잠근다 */
export const PASSWORD_MAX_TRIES = 5;
export const PASSWORD_LOCK_SEC = 10 * 60;

const roomName = z
  .string({ error: '방 이름을 입력해주세요' })
  .trim()
  .min(1, '방 이름을 입력해주세요')
  .max(ROOM_NAME_MAX, `방 이름은 ${ROOM_NAME_MAX}자까지예요`);

const roomPassword = z
  .string()
  .min(1, '비밀번호를 입력해주세요')
  .max(ROOM_PASSWORD_MAX, `비밀번호는 ${ROOM_PASSWORD_MAX}자까지예요`);

const maxMembers = z
  .number({ error: `최대 인원은 ${MIN_MEMBERS}~${MAX_MEMBERS}명으로 정해주세요` })
  .int(`최대 인원은 ${MIN_MEMBERS}~${MAX_MEMBERS}명으로 정해주세요`)
  .min(MIN_MEMBERS, `최대 인원은 ${MIN_MEMBERS}~${MAX_MEMBERS}명으로 정해주세요`)
  .max(MAX_MEMBERS, `최대 인원은 ${MIN_MEMBERS}~${MAX_MEMBERS}명으로 정해주세요`);

export const roomCreateInput = z.object({
  name: roomName,
  isPublic: z.boolean(),
  /** null 이면 비밀번호 없음 */
  password: roomPassword.nullable(),
  locked: z.boolean(),
  maxMembers,
});
export type RoomCreateInput = z.infer<typeof roomCreateInput>;

export const roomUpdateInput = roomCreateInput.extend({
  /** 없으면 그대로, null 이면 비밀번호 없애기, 문자열이면 새 비밀번호 */
  password: roomPassword.nullable().optional(),
});
export type RoomUpdateInput = z.infer<typeof roomUpdateInput>;

export const roomCodeSchema = z
  .string({ error: '방 코드를 입력해주세요' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, '방 코드는 6자리예요. 다시 확인해주세요');

export const roomJoinInput = z.object({
  code: roomCodeSchema,
  password: z.string().max(ROOM_PASSWORD_MAX).optional(),
  /** 다시 연결할 때: 이 번호 다음의 채팅만 받는다 */
  since: z.number().int().min(0).optional(),
});
export type RoomJoinInput = z.infer<typeof roomJoinInput>;

export const targetUserInput = z.object({ userId: z.string().min(1).max(100) });

export const chatSendInput = z.object({
  text: z
    .string({ error: '메시지를 입력해주세요' })
    .trim()
    .min(1, '메시지를 입력해주세요')
    .max(CHAT_MAX, `메시지는 ${CHAT_MAX}자까지예요`),
});

/** 방 안의 참가자 (들어온 순서대로) */
export type RoomMember = {
  userId: string;
  nickname: string;
  isGuest: boolean;
  /** 연습 상대(가상 사람) */
  isBot: boolean;
};

/** 방 안에서 보는 방 정보 (비밀번호 해시는 보내지 않는다) */
export type RoomView = {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  hasPassword: boolean;
  locked: boolean;
  maxMembers: number;
  hostId: string;
  members: RoomMember[];
};

/** 로비 창문 하나 (공개방만) */
export type RoomSummary = {
  id: string;
  code: string;
  name: string;
  hasPassword: boolean;
  locked: boolean;
  members: number;
  maxMembers: number;
  /** 진행 중인 게임 (3단계에서 채운다) */
  game: string | null;
  /** 재생 중인 곡 제목 (2단계에서 채운다) */
  nowPlaying: string | null;
};

/** 서버를 거친 채팅. seq 는 방마다 1부터 늘어나는 번호 (놓친 메시지 다시 받기에 쓴다) */
export type ServerChatMessage =
  | { id: string; seq: number; kind: 'user'; userId: string; nickname: string; text: string; sentAt: string }
  | { id: string; seq: number; kind: 'system'; text: string; sentAt: string };

/** 방에 들어갔을 때 받는 것 */
export type RoomJoined = {
  room: RoomView;
  /** 들어온 뒤(다시 연결이면 since 다음)의 채팅 */
  messages: ServerChatMessage[];
  music: MusicState;
  /** 열려 있는 게임 (없으면 null) */
  game: GameSnapshot | null;
};

/** 게임 화면을 그리는 데 필요한 것 전부: 모두에게 보이는 상태, 나에게만 보이는 것, 지금 라운드 그림 */
export type GameSnapshot = { view: GameView; private: GamePrivate; strokes: Stroke[] };
