/*
 * 방 안 상태(채팅·음악). 지금은 화면 안에서만 바뀐다.
 * 서버를 붙이면 같은 규칙(1인 3곡, 중복 금지, 방장 명령어)을 서버에서 판정한다.
 */
import { ME, type ChatMessage, type QueuedSong, type Song } from './room';

export type RoomState = {
  now: QueuedSong | null;
  paused: boolean;
  queue: QueuedSong[];
  messages: ChatMessage[];
};

/** 다른 사람(가상 사람 포함)이나 게임이 채팅에 올리는 메시지 */
export type PostedMessage =
  | { kind: 'user'; userId: string; nickname: string; text: string }
  | { kind: 'system'; text: string }
  | { kind: 'private'; text: string };

export type RoomAction =
  | { type: 'send'; text: string; isHost: boolean }
  | { type: 'post'; message: PostedMessage }
  | { type: 'request'; song: Song }
  | { type: 'cancel'; entryId: string }
  /** 곡이 끝남 / 재생할 수 없는 영상. 지금 곡이 아직 그 곡일 때만 다음 곡으로 (중복 전환 방지) */
  | { type: 'ended'; entryId: string }
  | { type: 'failed'; entryId: string };

export const MAX_SONGS_PER_USER = 3;

/** 채팅을 보내면 이 시간 동안 다음 채팅을 보낼 수 없다 (도배·캐치마인드 연타 방지). 명령어(/)는 예외 */
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
const MAX_MESSAGES = 200;

export const HOST_COMMANDS = [
  { name: '/skip', usage: '/skip', description: '지금 곡을 끝내고 다음 곡으로' },
  { name: '/pause', usage: '/pause', description: '일시정지' },
  { name: '/resume', usage: '/resume', description: '멈춘 곳부터 다시 재생' },
  { name: '/stop', usage: '/stop', description: '지금 곡 끝내기, 자동 재생 멈춤' },
  { name: '/remove', usage: '/remove {번호}', description: '대기큐에서 빼기' },
  { name: '/move', usage: '/move {번호} {위치}', description: '대기큐 순서 바꾸기' },
  { name: '/clear', usage: '/clear', description: '대기큐 비우기' },
] as const;

// 파일을 다시 불러와도(개발 중 화면 갱신 등) 이미 있는 메시지와 ID가 겹치지 않게 앞에 무작위 글자를 붙인다
const idPrefix = Math.random().toString(36).slice(2, 8);
let seq = 0;
const nextId = () => `${idPrefix}-${++seq}`;
const nowIso = () => new Date().toISOString();

const system = (text: string): ChatMessage => ({ id: nextId(), kind: 'system', text, sentAt: nowIso() });
const notice = (text: string): ChatMessage => ({ id: nextId(), kind: 'private', text, sentAt: nowIso() });

function toMessage(posted: PostedMessage): ChatMessage {
  return { ...posted, id: nextId(), sentAt: nowIso() };
}

function withMessages(state: RoomState, ...messages: ChatMessage[]): RoomState {
  return { ...state, messages: [...state.messages, ...messages].slice(-MAX_MESSAGES) };
}

/** 방에 남아 있는 음악 상태 (사람이 나가도 방과 함께 유지된다) */
export type MusicSnapshot = Pick<RoomState, 'now' | 'paused' | 'queue'>;

export const EMPTY_MUSIC: MusicSnapshot = { now: null, paused: false, queue: [] };

export function createRoomState(
  music: MusicSnapshot = EMPTY_MUSIC,
  intro = '방을 만들었어요. 초대 링크로 친구를 불러보세요',
): RoomState {
  return { ...music, messages: [system(intro)] };
}

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'send': {
      const text = action.text.trim();
      if (!text) return state;
      if (text.startsWith('/')) return runCommand(state, text, action.isHost);
      return withMessages(state, toMessage({ kind: 'user', userId: ME.id, nickname: ME.nickname, text }));
    }
    case 'post':
      return withMessages(state, toMessage(action.message));
    case 'request':
      return requestSong(state, action.song);
    case 'ended':
    case 'failed': {
      if (state.now?.entryId !== action.entryId) return state;
      const [next, ...rest] = state.queue;
      const reason = action.type === 'failed' ? `'${state.now.title}'은(는) 재생할 수 없어서 넘어가요. ` : '';
      return withMessages(
        { ...state, now: next ?? null, queue: rest, paused: false },
        system(next ? `${reason}다음 곡: ${next.title}` : `${reason}대기큐의 곡을 다 들었어요`),
      );
    }
    case 'cancel': {
      const target = state.queue.find((e) => e.entryId === action.entryId);
      if (!target || target.requesterId !== ME.id) {
        return withMessages(state, notice('본인이 신청한 곡만 취소할 수 있어요'));
      }
      return withMessages(
        { ...state, queue: state.queue.filter((e) => e.entryId !== action.entryId) },
        notice(`'${target.title}' 신청을 취소했어요`),
      );
    }
  }
}

function requestSong(state: RoomState, song: Song): RoomState {
  const isDuplicate = [state.now, ...state.queue].some((e) => e?.videoId === song.videoId);
  if (isDuplicate) return withMessages(state, notice('이미 신청된 곡이에요'));

  const mine = state.queue.filter((e) => e.requesterId === ME.id).length;
  if (mine >= MAX_SONGS_PER_USER) {
    return withMessages(state, notice(`대기큐에는 한 사람당 ${MAX_SONGS_PER_USER}곡까지 신청할 수 있어요`));
  }

  const next: QueuedSong = { ...song, entryId: nextId(), requesterId: ME.id, requesterNickname: ME.nickname };
  if (!state.now) {
    return withMessages({ ...state, now: next, paused: false }, system(`지금 재생: ${song.title}`));
  }
  return withMessages(
    { ...state, queue: [...state.queue, next] },
    notice(`신청했어요. 대기 ${state.queue.length + 1}번째예요`),
  );
}

/** "/remove 2" 같은 1부터 시작하는 번호를 배열 위치로 바꾼다. 범위를 벗어나면 null */
function toIndex(raw: string | undefined, length: number): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= length ? n - 1 : null;
}

function runCommand(state: RoomState, text: string, isHost: boolean): RoomState {
  const [name, ...args] = text.split(/\s+/);
  const command = HOST_COMMANDS.find((c) => c.name === name);
  if (!command) {
    return withMessages(
      state,
      notice(`모르는 명령어예요. 쓸 수 있는 명령어: ${HOST_COMMANDS.map((c) => c.name).join(' ')}`),
    );
  }
  if (!isHost) return withMessages(state, notice('방장만 쓸 수 있는 명령어예요'));

  const { queue } = state;
  switch (command.name) {
    case '/skip': {
      const [next, ...rest] = queue;
      return withMessages(
        { ...state, now: next ?? null, queue: rest, paused: false },
        system(next ? `다음 곡: ${next.title}` : '방장이 곡을 넘겼어요. 다음 곡이 없어요'),
      );
    }
    case '/pause':
      if (!state.now || state.paused) return withMessages(state, notice('일시정지할 곡이 없어요'));
      return withMessages({ ...state, paused: true }, system('방장이 음악을 일시정지했어요'));
    case '/resume':
      if (!state.now || !state.paused) return withMessages(state, notice('다시 재생할 곡이 없어요'));
      return withMessages({ ...state, paused: false }, system('음악을 다시 재생해요'));
    case '/stop':
      if (!state.now) return withMessages(state, notice('재생 중인 곡이 없어요'));
      return withMessages({ ...state, now: null, paused: false }, system('방장이 음악을 멈췄어요'));
    case '/remove': {
      const i = toIndex(args[0], queue.length);
      if (i === null) return withMessages(state, notice(rangeHint(queue.length, '/remove 2')));
      const removed = queue[i]!;
      return withMessages(
        { ...state, queue: queue.filter((_, j) => j !== i) },
        notice(`'${removed.title}'을(를) 대기큐에서 뺐어요`),
      );
    }
    case '/move': {
      const from = toIndex(args[0], queue.length);
      const to = toIndex(args[1], queue.length);
      if (from === null || to === null) return withMessages(state, notice(rangeHint(queue.length, '/move 3 1')));
      const next = [...queue];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return withMessages({ ...state, queue: next }, notice(`'${moved!.title}'을(를) ${to + 1}번으로 옮겼어요`));
    }
    case '/clear':
      if (queue.length === 0) return withMessages(state, notice('대기큐가 이미 비어 있어요'));
      return withMessages({ ...state, queue: [] }, system('방장이 대기큐를 비웠어요'));
  }
}

function rangeHint(length: number, example: string): string {
  if (length === 0) return '대기큐가 비어 있어요';
  return `대기큐 번호를 확인해주세요 (1~${length}). 예: ${example}`;
}
