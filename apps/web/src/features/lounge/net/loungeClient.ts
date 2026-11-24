/*
 * 라운지 서버와 주고받는 것을 한곳에 모은다 (로비 목록, 지금 들어가 있는 방).
 * 서버가 보낸 이벤트는 화면이 아직 안 그려졌어도 여기 쌓아 두므로 놓치지 않는다.
 * 연결이 끊겼다 돌아오면 로비는 다시 구독하고, 방은 놓친 채팅부터 다시 받는다.
 */
import type {
  RoomCreateInput,
  RoomJoined,
  RoomSummary,
  RoomUpdateInput,
  RoomView,
  ServerChatMessage,
} from '@lounge/shared';
import { useSyncExternalStore } from 'react';
import { errorMessage } from '../../../shared/api/ApiError';
import { connect, onConnect, request, type LoungeSocket } from '../../../shared/realtime/connection';

export type RoomSession = {
  view: RoomView;
  messages: ServerChatMessage[];
  /** 받은 채팅 중 마지막 번호 (다시 연결할 때 이 다음부터 받는다) */
  lastSeq: number;
};

type State = {
  lobby: RoomSummary[] | null;
  session: RoomSession | null;
  /** 방에서 밀려났을 때 이유 (강퇴, 방이 사라짐 등). 화면이 보여준 뒤 지운다 */
  exitReason: string | null;
};

let state: State = { lobby: null, session: null, exitReason: null };
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
  const session = { view: joined.room, messages: [], lastSeq: 0 };
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
  socket.on('room:kicked', ({ roomId }) => {
    if (state.session?.view.id === roomId) set({ session: null, exitReason: '방장이 나를 방에서 내보냈어요' });
  });

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
    request('room:join', { code: session.view.code, since: session.lastSeq }).then(
      (joined) => {
        if (state.session?.view.id !== joined.room.id) return;
        set({ session: { ...state.session, view: joined.room } });
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

export async function joinRoom(code: string, password?: string): Promise<RoomSession> {
  await wire();
  return startSession(await request('room:join', { code, password }));
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
