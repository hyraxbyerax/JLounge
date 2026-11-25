import { useRef } from 'react';
import { LockIcon } from '../../../shared/ui/icons';
import { brightness, windowState, type RoomInfo } from '../model/room';

type Props = {
  room: RoomInfo;
  /** 호실 명판 (예: 101호) */
  label: string;
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
 * 방 하나 = 강의실 하나: 왼쪽에 문(유리창에 불), 오른쪽에 진짜 강의실처럼 명판 (호실 · 방 이름 · 인원).
 * 층이 낮아도 문이 층 높이를 다 쓰도록 글자는 문 옆에 둔다.
 */
export function WindowCard({ room, label, onOpen }: Props) {
  const windowRef = useRef<HTMLSpanElement>(null);
  const state = windowState(room);
  const stateLabel = STATE_LABEL[state];

  return (
    <button
      type="button"
      className={`window-card is-${state}`}
      title={`${label} ${room.name}${room.nowPlaying ? ` · ♪ ${room.nowPlaying}` : ''}`}
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
        <span className="room-plate">{label}</span>
        <span className="window-name sign">{room.name}</span>
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

/** 방이 없는 빈 호실: 불 꺼진 강의실 문 + 호실 명판만 */
export function DarkWindow({ label }: { label: string }) {
  return (
    <span className="window-card is-dark" aria-hidden="true">
      <span className="window">
        <span className="window-glass" />
      </span>
      <span className="room-text">
        <span className="room-plate">{label}</span>
        <span className="window-name sign is-empty-name">빈 강의실</span>
      </span>
    </span>
  );
}
