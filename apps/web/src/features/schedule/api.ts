/*
 * 캠퍼스 플래너 서버 API (/api/schedule/*). 팀원 api.ts 와 같은 함수를 그대로 두고,
 * 주소·응답 형식({ data })·토큰(사이트 공용 로그인)만 라운지 쪽에 맞췄다.
 */
import { ApiError, type ApiResponse } from '../../shared/api/ApiError';
import { getMemberSession, signOut } from '../../shared/api/session';
import type { Schedule, ScheduleInput, TimetableEntry, TimetableInput } from './types';

export { ApiError, errorMessage } from '../../shared/api/ApiError';

/** 개발: Vite 프록시 → Express. 배포: CloudFront 가 /api/* 를 ALB 로 보낸다. */
export const API_BASE = '/api/schedule';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getMemberSession()?.token;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !data || 'error' in data) {
    const err = data && 'error' in data ? data.error : undefined;
    // 로그인이 만료되면 로그아웃 → 화면이 로그인 창으로 바뀐다
    if (res.status === 401 && token) signOut();
    throw new ApiError(err?.code ?? 'UNKNOWN', err?.message ?? '요청을 처리하지 못했습니다.', res.status, err?.fields);
  }
  return data.data;
}

export const api = {
  serverInfo: () => request<{ instance: string }>('GET', '/server-info'),

  listSchedules: () => request<Schedule[]>('GET', '/items'),
  createSchedule: (b: ScheduleInput) => request<Schedule>('POST', '/items', b),
  updateSchedule: (id: number, b: ScheduleInput) => request<Schedule>('PUT', `/items/${id}`, b),
  setDone: (id: number, isDone: boolean) => request<Schedule>('PATCH', `/items/${id}/done`, { isDone }),
  deleteSchedule: (id: number) => request<void>('DELETE', `/items/${id}`),

  listTimetable: () => request<TimetableEntry[]>('GET', '/timetable'),
  createTimetable: (b: TimetableInput) => request<TimetableEntry>('POST', '/timetable', b),
  updateTimetable: (id: number, b: TimetableInput) => request<TimetableEntry>('PUT', `/timetable/${id}`, b),
  deleteTimetable: (id: number) => request<void>('DELETE', `/timetable/${id}`),
};
