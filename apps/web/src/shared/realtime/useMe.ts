import { useSyncExternalStore } from 'react';
import type { SessionUser } from '../api/session';
import { getUser, onStatusChange } from './connection';

/** 지금 접속한 사람 (게스트 또는 회원). 연결 전에는 null. 로그인·로그아웃으로 다시 연결되면 바뀐다 */
export function useMe(): SessionUser | null {
  return useSyncExternalStore(onStatusChange, getUser);
}
