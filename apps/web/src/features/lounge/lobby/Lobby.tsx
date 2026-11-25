import { useState, type FormEvent } from 'react';
import { isEnterable, sortRooms, windowState, type RoomInfo, type RoomSettings } from '../model/room';
import { RoomSettingsDialog } from '../room/RoomSettingsDialog';
import { DarkWindow, WindowCard } from './WindowCard';
import './lobby.css';

type Props = {
  /** 서버가 보낸 공개방 목록. 아직 못 받았으면 null */
  rooms: RoomInfo[] | null;
  /** 새 방 이름 기본값 */
  defaultRoomName: string;
  onEnter: (room: RoomInfo, from?: DOMRect) => void;
  onCode: (code: string) => void;
  onCreate: (settings: RoomSettings) => Promise<void>;
  onHome: () => void;
  onSchedule: () => void;
  /** 친구 창 (로그인한 회원만) */
  onFriends?: () => void;
  notify: (message: string) => void;
};

/** 건물 창문: 한 줄에 6개, 적어도 2줄 */
const PER_ROW = 6;
const MIN_WINDOWS = 12;

/** 방 창문 뒤에 채울 불 꺼진 창문 수 (줄이 딱 맞게) */
function darkSlots(lit: number): number {
  const total = Math.max(MIN_WINDOWS, Math.ceil(lit / PER_ROW) * PER_ROW);
  return total - lit;
}

export function Lobby({
  rooms,
  defaultRoomName,
  onEnter,
  onCode,
  onCreate,
  onHome,
  onSchedule,
  onFriends,
  notify,
}: Props) {
  const [onlyEnterable, setOnlyEnterable] = useState(false);
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);

  // 로비에는 공개방만 온다 (서버가 비공개방은 보내지 않는다)
  const publicRooms = rooms ?? [];
  const visible = sortRooms(publicRooms).filter((r) => !onlyEnterable || isEnterable(r));

  // 잠금·정원은 서버가 최종 확인하지만, 창문에 보이는 상태로 바로 안내한다
  function tryEnter(room: RoomInfo, from?: DOMRect) {
    const state = windowState(room);
    if (state === 'locked') return notify('방장이 입장을 잠근 방이에요');
    if (state === 'full') return notify('방이 가득 찼어요');
    onEnter(room, from);
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(trimmed)) return notify('방 코드는 6자리예요. 다시 확인해주세요');
    onCode(trimmed);
  }

  return (
    <div className="lobby soft-light">
      <header className="lobby-header">
        <h1 className="lobby-title sign">
          <button type="button" className="title-link" onClick={onHome}>
            JLounge
          </button>
        </h1>
        <div className="lobby-actions">
          <form className="code-form" onSubmit={submitCode}>
            <label className="sr-only" htmlFor="room-code">
              방 코드
            </label>
            <input
              id="room-code"
              className="input code-input"
              placeholder="방 코드 6자리"
              maxLength={6}
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button type="submit" className="btn">
              들어가기
            </button>
          </form>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            방 만들기
          </button>
          {onFriends && (
            <button type="button" className="btn btn-ghost" onClick={onFriends}>
              친구
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onSchedule}>
            캠퍼스 플래너
          </button>
        </div>
      </header>

      <main className="building">
        <div className="building-toolbar">
          <p className="building-note">
            {rooms === null
              ? '불 켜진 방을 찾고 있어요…'
              : publicRooms.length === 0
                ? '아직 불 켜진 방이 없어요. [방 만들기]로 첫 방을 열어볼까요?'
                : visible.length === 0
                  ? '지금 들어갈 수 있는 방이 없어요. 새 방을 열어볼까요?'
                  : null}
          </p>
          {publicRooms.length > 0 && (
            <label className="filter-toggle">
              <input type="checkbox" checked={onlyEnterable} onChange={(e) => setOnlyEnterable(e.target.checked)} />
              입장 가능한 방만 보기
            </label>
          )}
        </div>
        {/* 한 줄에 6개씩, 적어도 두 줄(12칸)을 건물 위아래 꽉 차게. 방이 없는 칸은 불 꺼진 창문 */}
        <ul className="window-grid">
          {visible.map((room) => (
            <li key={room.id}>
              <WindowCard room={room} onOpen={(from) => tryEnter(room, from)} />
            </li>
          ))}
          {Array.from({ length: darkSlots(visible.length) }, (_, i) => (
            <li key={`dark-${i}`}>
              <DarkWindow />
            </li>
          ))}
        </ul>
      </main>

      {creating && (
        <RoomSettingsDialog
          mode="create"
          defaultName={defaultRoomName}
          onClose={() => setCreating(false)}
          onSubmit={async (settings) => {
            await onCreate(settings);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
