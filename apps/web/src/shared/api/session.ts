/*
 * 접속한 사람(세션). 처음 들어오면 서버에서 게스트 토큰을 받는다.
 * 게스트는 "접속 종료 시 소멸"이라 탭마다 따로인 sessionStorage에 둔다.
 */

export type SessionUser = { userId: string; nickname: string; isGuest: boolean };
export type Session = { token: string; user: SessionUser };

type ApiResponse<T> = { data: T } | { error: { code: string; message: string } };

const STORAGE_KEY = 'lounge.session';

function readStored(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function requestGuestSession(): Promise<Session> {
  const res = await fetch('/api/users/guest', { method: 'POST' });
  const body = (await res.json()) as ApiResponse<Session>;
  if ('error' in body) throw new Error(body.error.message);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(body.data));
  return body.data;
}

/** 저장된 세션이 있으면 그대로, 없으면 새 게스트 세션 */
export async function getSession(): Promise<Session> {
  return readStored() ?? requestGuestSession();
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
