import { useCallback, useEffect, useRef } from 'react';

/** 화면이 사라질 때 한꺼번에 취소되는 setTimeout */
export function useTimeouts(): (fn: () => void, ms: number) => void {
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const set = timers.current;
    return () => {
      set.forEach((id) => window.clearTimeout(id));
      set.clear();
    };
  }, []);

  return useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);
}
