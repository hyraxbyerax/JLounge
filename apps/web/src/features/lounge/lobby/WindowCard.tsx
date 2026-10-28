import { useRef } from 'react';
import { LockIcon } from '../../../shared/ui/icons';
import { brightness, windowState, type RoomInfo } from '../model/room';

type Props = {
  room: RoomInfo;
  /** 창문 위치를 넘겨서 확대 전환의 시작점으로 쓴다 */
  onOpen: (from: DOMRect | undefined) => void;
};

const STATE_LABEL = {
  open: null,
  game: null,
  full: '가득 찼어요',
  locked: '잠긴 방',
} as const;

export function WindowCard({ room, onOpen }: Props) {
  const windowRef = useRef<HTMLSpanElement>(null);
  const state = windowState(room);
  const stateLabel = STATE_LABEL[state];

  return (
    <button
      type="button"
      className={`window-card is-${state}`}
      onClick={() => onOpen(windowRef.current?.getBoundingClientRect())}
    >
      <span ref={windowRef} className={`window lit-${brightness(room)}`} aria-hidden="true">
        <span className="window-glass" />
        {state === 'locked' && (
          <span className="window-lock">
            <LockIcon />
          </span>
        )}
      </span>

      <span className="window-name sign">{room.name}</span>
      <span className="window-meta">
        <span className="window-count">
          {room.members}/{room.maxMembers}
          {stateLabel && <span className="window-state"> · {stateLabel}</span>}
          {room.password !== null && <span className="window-state"> · 비밀번호</span>}
        </span>
        {state === 'game' ? (
          <span className="window-game">
            <span className="window-game-dot" aria-hidden="true" />
            {room.game} 진행 중
          </span>
        ) : (
          room.nowPlaying &&
          state !== 'locked' && <span className="window-song">♪ {room.nowPlaying}</span>
        )}
      </span>
    </button>
  );
}

/** 방이 없을 때 보여줄 불 꺼진 창문 */
export function DarkWindow() {
  return (
    <span className="window-card is-dark" aria-hidden="true">
      <span className="window">
        <span className="window-glass" />
      </span>
    </span>
  );
}
