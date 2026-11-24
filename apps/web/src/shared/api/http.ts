/*
 * 서버 HTTP API 호출. 세션 토큰을 붙이고, 응답 형식 { data } / { error } 를 풀어준다.
 */
import { ApiError, type ApiResponse } from './ApiError';
import { clearSession, getSession, requestGuestSession } from './session';

export { ApiError } from './ApiError';

async function request<T>(path: string, token: string): Promise<{ status: number; body: ApiResponse<T> }> {
  const res = await fetch(path, { headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, body: (await res.json()) as ApiResponse<T> };
}

export async function apiGet<T>(path: string): Promise<T> {
  let session = await getSession();
  let res = await request<T>(path, session.token);
  // 토큰이 만료됐으면 게스트 세션을 새로 받아 한 번 더
  if (res.status === 401) {
    clearSession();
    session = await requestGuestSession();
    res = await request<T>(path, session.token);
  }
  if ('error' in res.body) {
    throw new ApiError(res.body.error.code, res.body.error.message, res.status, res.body.error.fields);
  }
  return res.body.data;
}
