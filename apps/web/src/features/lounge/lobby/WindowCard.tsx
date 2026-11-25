import { useRef } from 'react';
import { LockIcon } from '../../../shared/ui/icons';
import { brightness, windowState, type RoomInfo } from '../model/room';

type Props = {
  room: RoomInfo;
  /** 문 위치를 넘겨서 확대 전환의 시작점으로 쓴다 */
  onOpen: (from: DOMRect | undefined) => void;
};

const STATE_LABEL = {
  open: null,
  game: null,
  full: '가득',
  locked: '잠김',
} as const;

/**
 * 방 하나 = 강의실 하나: 왼쪽에 문(불 켜진 방은 번쩍번쩍), 오른쪽 벽에 명판 (방 이름 · 인원).
 */
export function WindowCard({ room, onOpen }: Props) {
  const windowRef = useRef<HTMLSpanElement>(null);
  const state = windowState(room);
  const stateLabel = STATE_LABEL[state];

  return (
    <button
      type="button"
      className={`window-card is-${state}`}
      title={`${room.name}${room.nowPlaying ? ` · ♪ ${room.nowPlaying}` : ''}`}
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
      <span className="room-text">
        <span className="room-plate window-name">{room.name}</span>
        <span className="window-meta">
          <span className="window-count">
            {room.members}/{room.maxMembers}
            {stateLabel && <span className="window-state"> · {stateLabel}</span>}
            {room.hasPassword && <span className="window-state"> · 🔑</span>}
          </span>
          {state === 'game' && (
            <span className="window-game">
              <span className="window-game-dot" aria-hidden="true" />
              {room.game}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/** 방이 없는 칸: 불 꺼진 강의실 문 */
export function DarkWindow() {
  return (
    <span className="window-card is-dark" aria-hidden="true">
      <span className="window">
        <span className="window-glass" />
      </span>
      <span className="room-text">
        <span className="window-name is-empty-name">빈 강의실</span>
      </span>
    </span>
  );
}
