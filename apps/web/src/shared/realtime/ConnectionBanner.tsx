import type { ConnectionStatus } from './connection';

const MESSAGES: Record<ConnectionStatus, string | null> = {
  connecting: null,
  connected: null,
  reconnecting: '연결이 잠깐 끊겼어요. 다시 연결하는 중이에요',
  offline: '서버에 연결하지 못했어요. 잠시 뒤 다시 시도할게요',
};

/** 연결이 정상이 아닐 때만 화면 위에 짧게 알려준다 */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const message = MESSAGES[status];
  return (
    <div className="connection-banner-slot" role="status" aria-live="polite">
      {message && <p className="connection-banner">{message}</p>}
    </div>
  );
}
