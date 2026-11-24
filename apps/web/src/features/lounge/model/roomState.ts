/*
 * 방 안 화면 상태(채팅 목록)와 채팅 입력 규칙.
 * 채팅은 서버가 보낸 것(receive)과 나에게만 보이는 안내·게임 메시지(post)를 한 목록에 모은다.
 * 음악 신청·대기큐·방장 명령어의 판정은 서버가 한다 (여기서는 명령어 글자를 풀어 서버에 보낼 모양으로만 바꾼다).
 */
import type { MusicCommandName, ServerChatMessage } from '@lounge/shared';
import type { ChatMessage, Me } from './room';

export type RoomState = {
  me: Me;
  messages: ChatMessage[];
};

/** 게임·연습 상대가 내 화면 채팅에 올리는 메시지 */
export type PostedMessage =
  | { kind: 'user'; userId: string; nickname: string; text: string }
  | { kind: 'system'; text: string }
  | { kind: 'private'; text: string };

export type RoomAction =
  /** 서버를 거친 채팅·시스템 메시지 */
  { type: 'receive'; messages: ServerChatMessage[] } | { type: 'post'; message: PostedMessage };

/** 캐치마인드 라운드 진행 중에만: 채팅을 보내면 이 시간 동안 다음 채팅을 보낼 수 없다 (정답 연타·도배 방지). 명령어(/)는 예외 */
export const CHAT_COOLDOWN_MS = 3000;

/** 다음 채팅까지 남은 시간(ms). 0이면 바로 보낼 수 있다 */
export function chatCooldownLeft(lastSentAt: number | null, now: number): number {
  if (lastSentAt === null) return 0;
  return Math.max(0, lastSentAt + CHAT_COOLDOWN_MS - now);
}

/** 이 메시지가 채팅 제한을 받는지 (명령어는 채팅에 남지 않으므로 제한하지 않는다) */
export function countsAsChat(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.startsWith('/');
}

/** 입력창 위 희노애락 이모지. 두 번 눌러 하나만 보낸다 (글과 섞지 않는다) */
export const QUICK_EMOJIS = [
  { emoji: '😄', label: '기쁨' },
  { emoji: '😠', label: '화남' },
  { emoji: '😢', label: '슬픔' },
  { emoji: '🤣', label: '즐거움' },
] as const;

/** 이모지 버튼으로 보낸 메시지인지 (화면에서 크게 보여준다) */
export function isQuickEmoji(text: string): boolean {
  return QUICK_EMOJIS.some((q) => q.emoji === text);
}
const MAX_MESSAGES = 300;

export const HOST_COMMANDS = [
  { name: '/skip', usage: '/skip', description: '지금 곡을 끝내고 다음 곡으로' },
  { name: '/pause', usage: '/pause', description: '일시정지' },
  { name: '/resume', usage: '/resume', description: '멈춘 곳부터 다시 재생' },
  { name: '/stop', usage: '/stop', description: '지금 곡 끝내기, 자동 재생 멈춤' },
  { name: '/remove', usage: '/remove {번호}', description: '대기큐에서 빼기' },
  { name: '/move', usage: '/move {번호} {위치}', description: '대기큐 순서 바꾸기' },
  { name: '/clear', usage: '/clear', description: '대기큐 비우기' },
  { name: '/endgame', usage: '/endgame', description: '진행 중인 게임 강제 종료' },
] as const;

export type ParsedCommand =
  | { kind: 'music'; name: MusicCommandName; args: number[] }
  | { kind: 'endgame' }
  /** 잘못 쓴 명령어: 나에게만 보여줄 안내 */
  | { kind: 'invalid'; message: string };

/** "/move 3 1" 같은 채팅 명령어를 서버에 보낼 모양으로. 권한은 서버가 확인한다 */
export function parseCommand(text: string): ParsedCommand {
  const [name = '', ...rest] = text.trim().split(/\s+/);
  const command = HOST_COMMANDS.find((c) => c.name === name);
  if (!command) {
    return {
      kind: 'invalid',
      message: `모르는 명령어예요. 쓸 수 있는 명령어: ${HOST_COMMANDS.map((c) => c.name).join(' ')}`,
    };
  }
  if (command.name === '/endgame') return { kind: 'endgame' };
  const args = rest.map(Number);
  const need = command.name === '/move' ? 2 : command.name === '/remove' ? 1 : 0;
  if (args.length < need || args.slice(0, need).some((n) => !Number.isInteger(n))) {
    return {
      kind: 'invalid',
      message: `이렇게 써주세요: ${command.usage.replace('{번호}', '2').replace('{위치}', '1')}`,
    };
  }
  return { kind: 'music', name: command.name.slice(1) as MusicCommandName, args: args.slice(0, need) };
}

// 파일을 다시 불러와도(개발 중 화면 갱신 등) 이미 있는 메시지와 ID가 겹치지 않게 앞에 무작위 글자를 붙인다
const idPrefix = Math.random().toString(36).slice(2, 8);
let seq = 0;
const nextId = () => `${idPrefix}-${++seq}`;
const nowIso = () => new Date().toISOString();

function withMessages(state: RoomState, ...messages: ChatMessage[]): RoomState {
  return { ...state, messages: [...state.messages, ...messages].slice(-MAX_MESSAGES) };
}

/** intro: 방을 처음 만들었을 때만 나에게 보여줄 안내 */
export function createRoomState(me: Me, intro?: string): RoomState {
  return { me, messages: intro ? [{ id: nextId(), kind: 'system', text: intro, sentAt: nowIso() }] : [] };
}

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'receive': {
      const known = new Set(state.messages.map((m) => m.id));
      const fresh: ChatMessage[] = action.messages.filter((m) => !known.has(m.id)).map(({ seq: _seq, ...m }) => m);
      return fresh.length > 0 ? withMessages(state, ...fresh) : state;
    }
    case 'post':
      return withMessages(state, { ...action.message, id: nextId(), sentAt: nowIso() });
  }
}
