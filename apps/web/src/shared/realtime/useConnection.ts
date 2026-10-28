import { useEffect, useSyncExternalStore } from 'react';
import { connect, getStatus, onStatusChange, type ConnectionStatus } from './connection';

const RETRY_MS = 3000;

/** 앱이 켜지면 서버에 연결하고, 연결 상태를 돌려준다. 서버가 아직 없으면 잠시 뒤 다시 시도 */
export function useConnection(): ConnectionStatus {
  useEffect(() => {
    let timer = 0;
    let stopped = false;
    const attempt = () => {
      connect().catch(() => {
        if (!stopped) timer = window.setTimeout(attempt, RETRY_MS);
      });
    };
    attempt();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  return useSyncExternalStore(onStatusChange, getStatus);
}
