import { useState, type FormEvent } from 'react';
import { isEnterable, windowState, type RoomInfo, type RoomSettings } from '../model/room';
import { orderRooms, pageCount, pageView } from './building';
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
  /** 왼쪽 위 JLounge 간판을 누르면 첫 화면으로 (라운지·플래너는 첫 화면에서만 고른다) */
  onHome: () => void;
  /** 친구 창 (로그인한 회원만) */
  onFriends?: () => void;
  notify: (message: string) => void;
};

export function Lobby({ rooms, defaultRoomName, onEnter, onCode, onCreate, onHome, onFriends, notify }: Props) {
  const [onlyEnterable, setOnlyEnterable] = useState(false);
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);

  // 로비에는 공개방만 온다 (서버가 비공개방은 보내지 않는다)
  const publicRooms = rooms ?? [];
  // 먼저 만든 방부터 아래층 왼쪽에. 한 페이지 12개(3개 층 × 4), 넘으면 페이지가 하나 늘어난다
  const visible = orderRooms(publicRooms.filter((r) => !onlyEnterable || isEnterable(r)));
  const [page, setPage] = useState(0);
  const pages = pageCount(visible.length);
  const current = Math.min(page, pages - 1);
  const view = pageView(visible, current);

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
        <h1 className="lobby-title">
          <button type="button" className="title-link jlounge-logo is-small" onClick={onHome} title="첫 화면으로">
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
        </div>
      </header>

      <main className="building">
        <div className="building-toolbar">
          <p className="building-note">
            {rooms === null
              ? '방을 찾고 있어요…'
              : publicRooms.length > 0 && visible.length === 0
                ? '지금 들어갈 수 있는 방이 없어요'
                : null}
          </p>
          {publicRooms.length > 0 && (
            <label className="filter-toggle">
              <input type="checkbox" checked={onlyEnterable} onChange={(e) => setOnlyEnterable(e.target.checked)} />
              입장 가능한 방만 보기
            </label>
          )}
          {/* 오른쪽 위 페이지: 12개까지 1 / 1, 13번째 방부터 페이지가 하나 늘어난다 */}
          <nav className="building-pager" aria-label="페이지">
            <button
              type="button"
              className="btn btn-ghost pager-btn"
              aria-label="이전 페이지"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              ◀
            </button>
            <span className="pager-now">
              {current + 1} / {pages}
            </span>
            <button
              type="button"
              className="btn btn-ghost pager-btn"
              aria-label="다음 페이지"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              ▶
            </button>
          </nav>
        </div>
        {/* 복도 3줄 × 문 4개. 방은 아래 복도 왼쪽부터, 방이 없는 칸은 불 꺼진 문 (층·호실 번호는 따로 적지 않는다) */}
        <div className="floors window-grid">
          {view.floors.map((f) => (
            <section key={f.floor} className="floor">
              <ul className="floor-rooms">
                {f.rooms.map((room, i) => (
                  <li key={room?.id ?? `empty-${f.floor}-${i}`}>
                    {room ? <WindowCard room={room} onOpen={(from) => tryEnter(room, from)} /> : <DarkWindow />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
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
