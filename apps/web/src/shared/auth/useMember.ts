import { useSyncExternalStore } from 'react';
import { getMemberSession, onSessionChange, type SessionUser } from '../api/session';

/** 로그인한 회원. 게스트면 null. 로그인·로그아웃하면 다시 그린다 */
export function useMember(): SessionUser | null {
  return useSyncExternalStore(onSessionChange, getMemberSession)?.user ?? null;
}
