import { useCallback, useEffect, useRef, useState } from 'react';

/** 화면 아래에 잠깐 떴다 사라지는 안내 문구 */
export function useNotice(duration = 2800): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback(
    (next: string) => {
      setMessage(next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(null), duration);
    },
    [duration],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return [message, show];
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div className="toast" role="status" aria-live="polite">
      {message && (
        <span key={message} className="toast-body">
          {message}
        </span>
      )}
    </div>
  );
}
