/*
 * 서버와의 실시간 연결 (Socket.IO).
 * - 서버가 여러 대여도 되도록 websocket 전송만 쓴다.
 * - 끊기면 자동으로 다시 연결한다. 다시 연결되면 화면은 방 상태를 새로 받는다 (1단계부터).
 * - 토큰이 거절되면 게스트 세션을 새로 받아 다시 연결한다.
 * - 로그인·로그아웃하면 바뀐 사람(토큰)으로 다시 연결한다.
 */
import { io, type Socket } from 'socket.io-client';
import {
  clearSession,
  getMemberSession,
  getSession,
  onSessionChange,
  requestGuestSession,
  type SessionUser,
} from '../api/session';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

type Listener = (status: ConnectionStatus) => void;

/** 브라우저 시계 − 서버 시계 (ms). 음악 동기화에 쓴다 */
let clockOffsetMs = 0;
export const serverNow = () => Date.now() - clockOffsetMs;

let socket: Socket | null = null;
let status: ConnectionStatus = 'connecting';
let user: SessionUser | null = null;
const listeners = new Set<Listener>();

function setStatus(next: ConnectionStatus) {
  status = next;
  listeners.forEach((l) => l(next));
}

function syncClock(s: Socket) {
  const sentAt = Date.now();
  s.emit('time:sync', (res: { data?: { serverTime: string } }) => {
    if (!res.data) return;
    const receivedAt = Date.now();
    const serverTime = Date.parse(res.data.serverTime) + (receivedAt - sentAt) / 2;
    clockOffsetMs = receivedAt - serverTime;
  });
}

export async function connect(): Promise<Socket> {
  if (socket) return socket;
  let session;
  try {
    session = await getSession();
  } catch {
    setStatus('offline');
    throw new Error('서버에 연결하지 못했어요');
  }
  user = session.user;

  const s = io({
    transports: ['websocket'],
    auth: { token: session.token },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  socket = s;

  s.on('connect', () => {
    setStatus('connected');
    syncClock(s);
  });
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

onSessionChange(async () => {
  if (!socket) return;
  try {
    const session = await getSession();
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
