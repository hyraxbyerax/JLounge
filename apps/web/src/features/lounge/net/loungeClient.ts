/*
 * 라운지 서버와 주고받는 것을 한곳에 모은다 (로비 목록, 지금 들어가 있는 방).
 * 서버가 보낸 이벤트는 화면이 아직 안 그려졌어도 여기 쌓아 두므로 놓치지 않는다.
 * 연결이 끊겼다 돌아오면 로비는 다시 구독하고, 방은 놓친 채팅부터 다시 받는다.
 */
import type {
  GameSnapshot,
  GameType,
  MusicCommandInput,
  MusicState,
  RoomCreateInput,
  RoomJoined,
  RoomSummary,
  RoomUpdateInput,
  RoomView,
  ServerChatMessage,
  Stroke,
  UserBrief,
  WordTopic,
} from '@lounge/shared';
import { useSyncExternalStore } from 'react';
import { errorMessage } from '../../../shared/api/ApiError';
import {
  connect,
  onConnect,
  request,
  takeFormerGuestToken,
  type LoungeSocket,
} from '../../../shared/realtime/connection';

export type RoomSession = {
  view: RoomView;
  /** 지금 곡·대기큐 (서버가 바뀔 때마다 전체를 보낸다) */
  music: MusicState;
  /** 열려 있는 게임 (없으면 null) */
  game: GameSnapshot | null;
  messages: ServerChatMessage[];
  /** 받은 채팅 중 마지막 번호 (다시 연결할 때 이 다음부터 받는다) */
  lastSeq: number;
};

type State = {
  lobby: RoomSummary[] | null;
  session: RoomSession | null;
  /** 방에서 밀려났을 때 이유 (강퇴, 방이 사라짐 등). 화면이 보여준 뒤 지운다 */
  exitReason: string | null;
  /** 친구가 보낸 방 초대 (화면 위에 알림으로) */
  invitation: { from: UserBrief; room: { code: string; name: string } } | null;
  /** 친구 요청 같은 짧은 알림 */
  friendNotice: string | null;
};

let state: State = { lobby: null, session: null, exitReason: null, invitation: null, friendNotice: null };
let watchingLobby = 0;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = () => state;

export function useLounge(): State {
  return useSyncExternalStore(subscribe, getState);
}

function startSession(joined: RoomJoined): RoomSession {
  const session = { view: joined.room, music: joined.music, game: joined.game, messages: [], lastSeq: 0 };
  set({ session, exitReason: null });
  appendMessages(joined.messages);
  return state.session!;
}

function appendMessages(messages: ServerChatMessage[]) {
  const session = state.session;
  if (!session || messages.length === 0) return;
  const fresh = messages.filter((m) => m.seq > session.lastSeq);
  if (fresh.length === 0) return;
  set({
    session: {
      ...session,
      messages: [...session.messages, ...fresh].slice(-300),
      lastSeq: fresh.at(-1)!.seq,
    },
  });
}

/* 서버 이벤트 */

let wired = false;
async function wire() {
  if (wired) return;
  wired = true;
  const socket: LoungeSocket = await connect();

  socket.on('lobby:rooms', (rooms) => set({ lobby: rooms }));
  socket.on('room:state', (view) => {
    if (state.session?.view.id === view.id) set({ session: { ...state.session, view } });
  });
  socket.on('chat:message', ({ roomId, ...message }) => {
    if (state.session?.view.id === roomId) appendMessages([message]);
  });
  socket.on('music:state', ({ roomId, ...music }) => {
    if (state.session?.view.id === roomId) set({ session: { ...state.session, music } });
  });
  // 게임: 상태(모두), 나에게만 보이는 제시어, 그림
  const updateGame = (roomId: string, change: (game: GameSnapshot | null) => GameSnapshot | null) => {
    if (state.session?.view.id === roomId) set({ session: { ...state.session, game: change(state.session.game) } });
  };
  socket.on('game:state', ({ roomId, view }) =>
    updateGame(roomId, (game) =>
      view ? { view, private: game?.private ?? null, strokes: game?.strokes ?? [] } : null,
    ),
  );
  socket.on('game:private', ({ roomId, private: secret }) =>
    updateGame(roomId, (game) => (game ? { ...game, private: secret } : game)),
  );
  socket.on('game:stroke', ({ roomId, stroke }) =>
    updateGame(roomId, (game) => (game ? { ...game, strokes: [...game.strokes, stroke] } : game)),
  );
  socket.on('game:strokes', ({ roomId, strokes }) =>
    updateGame(roomId, (game) => (game ? { ...game, strokes } : game)),
  );
  socket.on('room:kicked', ({ roomId }) => {
    if (state.session?.view.id === roomId) set({ session: null, exitReason: '방장이 나를 방에서 내보냈어요' });
  });
  socket.on('friend:invited', (invitation) => set({ invitation }));
  socket.on('friend:request', ({ from }) => set({ friendNotice: `${from.nickname}님이 친구 요청을 보냈어요` }));

  // 다시 연결되면: 로비는 다시 구독, 방은 놓친 채팅부터 다시 받는다
  let first = true;
  onConnect(() => {
    if (first) {
      first = false;
      return;
    }
    if (watchingLobby > 0) void refreshLobby();
    const session = state.session;
    if (!session) return;
    // 게스트였다가 로그인해서 다시 연결된 거라면 그 자리를 이어받는다
    const fromGuest = takeFormerGuestToken() ?? undefined;
    request('room:join', { code: session.view.code, since: session.lastSeq, fromGuest }).then(
      (joined) => {
        if (state.session?.view.id !== joined.room.id) return;
        set({ session: { ...state.session, view: joined.room, music: joined.music, game: joined.game } });
        appendMessages(joined.messages);
      },
      (err: unknown) => set({ session: null, exitReason: `방에 다시 들어가지 못했어요. ${errorMessage(err)}` }),
    );
  });
}

async function refreshLobby() {
  set({ lobby: await request('lobby:watch') });
}

/** 로비 보기. 돌려준 함수로 그만 본다 */
export function watchLobby(): () => void {
  watchingLobby += 1;
  void wire()
    .then(refreshLobby)
    .catch(() => set({ lobby: state.lobby ?? [] }));
  return () => {
    watchingLobby -= 1;
    if (watchingLobby === 0) void connect().then((s) => s.emit('lobby:unwatch'));
  };
}

/* 방 */

export async function createRoom(input: RoomCreateInput): Promise<RoomSession> {
  await wire();
  return startSession(await request('room:create', input));
}

/** invite: 친구 초대를 받아 들어갈 때 (비밀번호를 묻지 않는다) */
export async function joinRoom(code: string, password?: string, invite = false): Promise<RoomSession> {
  await wire();
  return startSession(await request('room:join', { code, password, invite: invite || undefined }));
}

export async function leaveRoom(): Promise<void> {
  set({ session: null });
  await request('room:leave').catch(() => undefined);
}

/** 화면이 이유를 보여준 뒤 지운다 */
export function clearExitReason() {
  set({ exitReason: null });
}

export const sendChat = (text: string) => request('chat:send', { text });
export const updateRoom = (input: RoomUpdateInput) => request('room:update', input);
export const kickMember = (userId: string) => request('room:kick', { userId });
export const transferHost = (userId: string) => request('room:transfer', { userId });
export const callBot = () => request('room:bot');

/* 음악 */

export const requestSong = (videoId: string) => request('music:request', { videoId });
export const cancelSong = (entryId: string) => request('music:cancel', { entryId });
export const musicCommand = (input: MusicCommandInput) => request('music:command', input);
export const seekMusic = (positionSec: number) => request('music:seek', { positionSec });
/** 이 브라우저에서 재생할 수 없는 영상이었다 (서버가 지금 곡이 아직 그 곡이면 넘긴다) */
export function reportUnplayable(entryId: string) {
  void connect().then((s) => s.emit('music:failed', { entryId }));
}

/* 게임 */

export const selectGame = (type: GameType) => request('game:select', { type });
export const startGame = () => request('game:start');
export const setGameTopic = (topic: WordTopic) => request('game:topic', { topic });
export const quitGame = () => request('game:quit');
export const undoStroke = () => request('game:undo');
export const clearStrokes = () => request('game:clear');

/** 내가 그린 한 획: 내 화면에는 바로 붙이고 서버로 보낸다 (서버가 다른 사람에게 전한다) */
export function sendStroke(stroke: Stroke) {
  const session = state.session;
  if (session?.game)
    set({ session: { ...session, game: { ...session.game, strokes: [...session.game.strokes, stroke] } } });
  return request('game:stroke', stroke);
}

/* 친구 */

/** 앱이 켜지면 알림(친구 초대·요청)을 받을 수 있게 연결해 둔다 */
export function startLounge() {
  void wire().catch(() => undefined);
}

export const clearInvitation = () => set({ invitation: null });
export const clearFriendNotice = () => set({ friendNotice: null });
export const inviteFriend = (userId: string) => request('friend:invite', { userId });

/** 회원만: 접속 중 신호 (있는 방·활동은 서버가 소켓을 보고 정한다) */
export function sendHeartbeat() {
  void connect().then((s) => s.emit('presence:heartbeat'));
}
