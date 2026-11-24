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
            전북대학교 휴식 라운지
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
        {rooms === null ? (
          <p className="building-empty-text">불 켜진 방을 찾고 있어요…</p>
        ) : publicRooms.length === 0 ? (
          <div className="building-empty">
            <div className="window-grid">
              {Array.from({ length: 8 }, (_, i) => (
                <DarkWindow key={i} />
              ))}
            </div>
            <p className="building-empty-text">아직 불 켜진 방이 없어요. 첫 방을 열어볼까요?</p>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              방 만들기
            </button>
          </div>
        ) : (
          <>
            <div className="building-toolbar">
              <label className="filter-toggle">
                <input type="checkbox" checked={onlyEnterable} onChange={(e) => setOnlyEnterable(e.target.checked)} />
                입장 가능한 방만 보기
              </label>
            </div>
            {visible.length === 0 ? (
              <p className="building-empty-text">지금 들어갈 수 있는 방이 없어요. 새 방을 열어볼까요?</p>
            ) : (
              <ul className="window-grid">
                {visible.map((room) => (
                  <li key={room.id}>
                    <WindowCard room={room} onOpen={(from) => tryEnter(room, from)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
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
