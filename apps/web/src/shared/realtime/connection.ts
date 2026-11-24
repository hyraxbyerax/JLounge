/*
 * 서버와의 실시간 연결 (Socket.IO).
 * - 서버가 여러 대여도 되도록 websocket 전송만 쓴다.
 * - 끊기면 자동으로 다시 연결한다. 다시 연결되면 onConnect 로 알려서 방 상태·놓친 채팅을 다시 받게 한다.
 * - 토큰이 거절되면 게스트 세션을 새로 받아 다시 연결한다.
 * - 로그인·로그아웃하면 바뀐 사람(토큰)으로 다시 연결한다.
 */
import type { AckResult, ClientToServerEvents, ServerToClientEvents } from '@lounge/shared';
import { io, type Socket } from 'socket.io-client';
import { ApiError } from '../api/ApiError';
import {
  clearSession,
  getMemberSession,
  getSession,
  onSessionChange,
  requestGuestSession,
  type SessionUser,
} from '../api/session';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';
export type LoungeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type Listener = (status: ConnectionStatus) => void;

/** 서버가 이 시간 안에 답하지 않으면 실패로 본다 */
const REQUEST_TIMEOUT_MS = 8_000;

/** 브라우저 시계 − 서버 시계 (ms). 음악 동기화에 쓴다 */
let clockOffsetMs = 0;
export const serverNow = () => Date.now() - clockOffsetMs;

let socketPromise: Promise<LoungeSocket> | null = null;
let socket: LoungeSocket | null = null;
let status: ConnectionStatus = 'connecting';
let user: SessionUser | null = null;
const listeners = new Set<Listener>();
const connectListeners = new Set<(s: LoungeSocket) => void>();

function setStatus(next: ConnectionStatus) {
  status = next;
  listeners.forEach((l) => l(next));
}

/** 시계 차이 한 번 재기: 왕복 시간이 짧을수록 정확하다 */
function sampleClock(s: LoungeSocket): Promise<{ rtt: number; offset: number } | null> {
  return new Promise((resolve) => {
    const sentAt = Date.now();
    s.timeout(5_000).emit('time:sync', (err, res) => {
      if (err || !('data' in res)) return resolve(null);
      const receivedAt = Date.now();
      const rtt = receivedAt - sentAt;
      resolve({ rtt, offset: receivedAt - (Date.parse(res.data.serverTime) + rtt / 2) });
    });
  });
}

/** 여러 번 재서 왕복이 가장 짧았던 값을 쓴다 (페이지를 불러오는 중처럼 바쁠 때 한 번 잰 값은 틀리기 쉽다) */
async function syncClock(s: LoungeSocket) {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < 5; i++) {
    const sample = await sampleClock(s);
    if (sample && (!best || sample.rtt < best.rtt)) best = sample;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (best) clockOffsetMs = best.offset;
}

const CLOCK_RESYNC_MS = 60_000;

async function open(): Promise<LoungeSocket> {
  let session;
  try {
    session = await getSession();
  } catch {
    setStatus('offline');
    socketPromise = null;
    throw new ApiError('OFFLINE', '서버에 연결하지 못했어요. 잠시 뒤 다시 시도해주세요');
  }
  user = session.user;

  const s: LoungeSocket = io({
    transports: ['websocket'],
    auth: { token: session.token },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  socket = s;

  s.on('connect', () => {
    setStatus('connected');
    void syncClock(s);
    connectListeners.forEach((l) => l(s));
  });
  // 컴퓨터 시계가 조금씩 어긋나므로 가끔 다시 잰다
  window.setInterval(() => {
    if (s.connected) void syncClock(s);
  }, CLOCK_RESYNC_MS);
  s.on('disconnect', (reason) => {
    // 서버가 끊은 경우(io server disconnect)에는 자동 재접속이 안 되므로 직접 다시 연결
    if (reason === 'io server disconnect') s.connect();
    setStatus('reconnecting');
  });
  s.on('connect_error', async (err) => {
    setStatus(status === 'connected' || status === 'reconnecting' ? 'reconnecting' : 'offline');
    if (err.message === 'UNAUTHORIZED') {
      const wasMember = getMemberSession() !== null;
      clearSession();
      // 회원 토큰이 만료된 경우: 로그아웃 알림(onSessionChange)이 새 게스트로 다시 연결한다
      if (wasMember) return;
      try {
        const fresh = await requestGuestSession();
        user = fresh.user;
        s.auth = { token: fresh.token };
        s.connect();
      } catch {
        // 서버가 아직 안 떠 있으면 다음 자동 재시도에 맡긴다
      }
    }
  });

  return s;
}

export function connect(): Promise<LoungeSocket> {
  socketPromise ??= open();
  return socketPromise;
}

/** 연결될 때마다(처음·다시 연결) 불린다. 이미 연결돼 있으면 바로 한 번 부른다 */
export function onConnect(listener: (s: LoungeSocket) => void): () => void {
  connectListeners.add(listener);
  if (socket?.connected) listener(socket);
  return () => connectListeners.delete(listener);
}

type EventArgs<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]> extends [...infer A, unknown] ? A : never;
type EventData<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]> extends [...unknown[], (res: AckResult<infer T>) => void] ? T : never;

/** 서버에 요청하고 응답을 기다린다. 실패하면 ApiError (message 는 화면에 그대로 보여줄 수 있는 문장) */
export async function request<E extends keyof ClientToServerEvents>(
  event: E,
  ...args: EventArgs<E>
): Promise<EventData<E>> {
  const s = await connect();
  let res: AckResult<EventData<E>>;
  try {
    res = await (s.timeout(REQUEST_TIMEOUT_MS).emitWithAck as (...a: unknown[]) => Promise<typeof res>)(event, ...args);
  } catch {
    throw new ApiError('TIMEOUT', '서버가 답하지 않아요. 잠시 뒤 다시 시도해주세요');
  }
  if ('error' in res) throw new ApiError(res.error.code, res.error.message);
  return res.data;
}

/** 게스트였다가 로그인했을 때 그 게스트의 토큰 (방에서 같은 자리를 이어받는 데 한 번 쓴다) */
let formerGuestToken: string | null = null;
export function takeFormerGuestToken(): string | null {
  const token = formerGuestToken;
  formerGuestToken = null;
  return token;
}

onSessionChange(async () => {
  if (!socket) return;
  try {
    const previous = socket.auth as { token?: string };
    const session = await getSession();
    if (user?.isGuest && !session.user.isGuest && previous.token) formerGuestToken = previous.token;
    user = session.user;
    socket.auth = { token: session.token };
    socket.disconnect().connect();
  } catch {
    // 서버가 아직 안 떠 있으면 다음 자동 재시도에 맡긴다
  }
});

export function getStatus(): ConnectionStatus {
  return status;
}

export function getUser(): SessionUser | null {
  return user;
}

export function onStatusChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
