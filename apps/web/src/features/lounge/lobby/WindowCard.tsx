import { useRef } from 'react';
import { LockIcon } from '../../../shared/ui/icons';
import { brightness, windowState, type RoomInfo } from '../model/room';

type Props = {
  room: RoomInfo;
  /** 문 위 호실 명판 (예: 201호) */
  label: string;
  /** 창문 위치를 넘겨서 확대 전환의 시작점으로 쓴다 */
  onOpen: (from: DOMRect | undefined) => void;
};

const STATE_LABEL = {
  open: null,
  game: null,
  full: '가득 찼어요',
  locked: '잠긴 방',
} as const;

/** 방 하나 = 강의실 문 하나 (호실 명판 + 유리창에 불) */
export function WindowCard({ room, label, onOpen }: Props) {
  const windowRef = useRef<HTMLSpanElement>(null);
  const state = windowState(room);
  const stateLabel = STATE_LABEL[state];

  return (
    <button
      type="button"
      className={`window-card is-${state}`}
      onClick={() => onOpen(windowRef.current?.getBoundingClientRect())}
    >
      <span className="room-plate" aria-hidden="true">
        {label}
      </span>
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
          {room.hasPassword && <span className="window-state"> · 비밀번호</span>}
        </span>
        {state === 'game' ? (
          <span className="window-game">
            <span className="window-game-dot" aria-hidden="true" />
            {room.game} 진행 중
          </span>
        ) : (
          room.nowPlaying && state !== 'locked' && <span className="window-song">♪ {room.nowPlaying}</span>
        )}
      </span>
    </button>
  );
}

/** 방이 없는 빈 호실: 불 꺼진 강의실 문 (아래 이름·인원 자리는 비워 두어 켜진 문과 크기를 맞춘다) */
export function DarkWindow({ label }: { label: string }) {
  return (
    <span className="window-card is-dark" aria-hidden="true">
      <span className="room-plate">{label}</span>
      <span className="window">
        <span className="window-glass" />
      </span>
      <span className="window-name sign window-blank">&nbsp;</span>
      <span className="window-meta window-blank">
        <span className="window-count">&nbsp;</span>
      </span>
    </span>
  );
}
