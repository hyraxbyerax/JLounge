/*
 * 접속한 사람(세션).
 * - 게스트: 처음 들어오면 서버에서 게스트 토큰을 받는다. "접속 종료 시 소멸"이라 탭마다 따로인 sessionStorage에 둔다.
 * - 회원: 이메일로 로그인하면 localStorage에 두어 새로고침·재방문에도 유지한다. 회원이 있으면 게스트보다 먼저 쓴다.
 * 나중에 Cognito로 바꾸면 signIn 이 Cognito를 부르고, 나머지(세션 저장·구독)는 그대로 쓴다.
 */
import { ApiError, type ApiResponse } from './ApiError';

export type SessionUser = { userId: string; nickname: string; isGuest: boolean; email?: string | null };
export type Session = { token: string; user: SessionUser };

const GUEST_KEY = 'lounge.session';
const MEMBER_KEY = 'lounge.member';

// 저장소는 막혀 있거나 비어 있을 수 있으므로 항상 try/catch 로 감싼다
function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // 저장할 수 없으면 새로고침 때 다시 로그인하면 된다
  }
}

const local = () => localStorage;
const tab = () => sessionStorage;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** 로그인·로그아웃(다른 탭에서 한 것 포함)이 일어나면 알려준다 */
export function onSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === MEMBER_KEY) notify();
  });
}

let cached: { raw: string | null; session: Session | null } = { raw: null, session: null };

/** 로그인한 회원 세션. 없으면 null (같은 값이면 같은 객체를 돌려준다) */
export function getMemberSession(): Session | null {
  const raw = read(local, MEMBER_KEY);
  if (raw !== cached.raw) cached = { raw, session: parse(raw) };
  return cached.session;
}

function parse(raw: string | null): Session | null {
  try {
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

const readGuest = (): Session | null => parse(read(tab, GUEST_KEY));

async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json()) as ApiResponse<T>;
  if ('error' in body) throw new ApiError(body.error.code, body.error.message, res.status, body.error.fields);
  return body.data;
}

export async function requestGuestSession(): Promise<Session> {
  const session = await unwrap<Session>(await fetch('/api/users/guest', { method: 'POST' }));
  write(tab, GUEST_KEY, JSON.stringify(session));
  return session;
}

/** 회원이면 회원 세션, 아니면 저장된 게스트 세션, 없으면 새 게스트 세션 */
export async function getSession(): Promise<Session> {
  return getMemberSession() ?? readGuest() ?? requestGuestSession();
}

/** 토큰이 거절됐을 때: 저장된 세션을 모두 지운다 (회원이었다면 로그아웃된다) */
export function clearSession(): void {
  const wasMember = getMemberSession() !== null;
  write(tab, GUEST_KEY, null);
  write(local, MEMBER_KEY, null);
  if (wasMember) notify();
}

export type SignInInput =
  | { mode: 'login'; email: string; password: string }
  | { mode: 'signup'; email: string; password: string; nickname: string };

/** 이메일 로그인·회원가입. 실패하면 ApiError (fields 에 칸별 오류) */
export async function signIn({ mode, ...body }: SignInInput): Promise<SessionUser> {
  const session = await unwrap<Session>(
    await fetch(`/api/users/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  write(local, MEMBER_KEY, JSON.stringify(session));
  write(tab, GUEST_KEY, null);
  notify();
  return session.user;
}

/** 로그아웃: 회원 세션을 지운다. 다음 요청부터 새 게스트 세션을 받는다 */
export function signOut(): void {
  write(local, MEMBER_KEY, null);
  notify();
}
