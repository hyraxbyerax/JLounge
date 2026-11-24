import { useEffect, useState } from 'react';
import { serverNow } from '../../../shared/realtime/connection';

/** 라운드 남은 초. 끝나는 시각(서버 시각 ms)만 받고, 화면이 0.25초마다 센다 */
export function useRemainingSec(endsAt: number | null): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (endsAt === null) return;
    const id = window.setInterval(() => setNow(serverNow()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
}
