/*
 * 로그인한 회원만 쓰는 HTTP API 호출 (친구 등). 회원 토큰을 붙이고 { data } / { error } 를 풀어준다.
 * 토큰이 만료됐으면(401) 로그아웃시킨다 → 화면이 로그인 버튼으로 바뀐다.
 */
import { ApiError, type ApiResponse } from './ApiError';
import { getMemberSession, signOut } from './session';

export async function memberRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getMemberSession()?.token;
  if (!token) throw new ApiError('LOGIN_REQUIRED', '로그인한 학생만 쓸 수 있어요', 401);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', '서버에 연결하지 못했어요. 잠시 뒤 다시 시도해주세요');
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json || 'error' in json) {
    if (res.status === 401) signOut();
    const err = json && 'error' in json ? json.error : undefined;
    throw new ApiError(
      err?.code ?? 'UNKNOWN',
      err?.message ?? '잠깐 문제가 생겼어요. 다시 시도해주세요',
      res.status,
      err?.fields,
    );
  }
  return json.data;
}
