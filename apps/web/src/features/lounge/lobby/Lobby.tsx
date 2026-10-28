import { useState, type FormEvent } from 'react';
import { Toast, useNotice } from '../../../shared/ui/Toast';
import { isEnterable, sortRooms, windowState, type RoomInfo, type RoomSettings } from '../model/room';
import { RoomSettingsDialog } from '../room/RoomSettingsDialog';
import { PasswordDialog } from './PasswordDialog';
import { DarkWindow, WindowCard } from './WindowCard';
import './lobby.css';

type Props = {
  rooms: RoomInfo[];
  onEnter: (room: RoomInfo, from?: DOMRect) => void;
  onCreate: (settings: RoomSettings) => void;
  onHome: () => void;
  onSchedule: () => void;
};

export function Lobby({ rooms, onEnter, onCreate, onHome, onSchedule }: Props) {
  const [onlyEnterable, setOnlyEnterable] = useState(false);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<{ room: RoomInfo; from?: DOMRect } | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, showNotice] = useNotice();

  // 로비에는 공개방만. 비공개방은 방 코드·초대 링크로만 들어온다
  const publicRooms = rooms.filter((r) => r.isPublic);
  const visible = sortRooms(publicRooms).filter((r) => !onlyEnterable || isEnterable(r));

  function tryEnter(room: RoomInfo, from?: DOMRect) {
    const state = windowState(room);
    if (state === 'locked') return showNotice('방장이 입장을 잠근 방이에요');
    if (state === 'full') return showNotice('방이 가득 찼어요');
    if (room.password !== null) return setPending({ room, from });
    onEnter(room, from);
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    const room = rooms.find((r) => r.code === code.trim().toUpperCase());
    if (!room) return showNotice('그런 방 코드가 없어요. 6자리 코드를 다시 확인해주세요');
    tryEnter(room);
  }

  return (
    <div className="lobby night-sky">
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
          <button type="button" className="btn btn-ghost" onClick={onSchedule}>
            스케줄 관리
          </button>
        </div>
      </header>

      <main className="building">
        {publicRooms.length === 0 ? (
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

      <Toast message={notice} />
      {pending && (
        <PasswordDialog
          room={pending.room}
          onClose={() => setPending(null)}
          onSuccess={() => {
            onEnter(pending.room, pending.from);
            setPending(null);
          }}
        />
      )}
      {creating && (
        <RoomSettingsDialog
          mode="create"
          onClose={() => setCreating(false)}
          onSubmit={(settings) => {
            setCreating(false);
            onCreate(settings);
          }}
        />
      )}
    </div>
  );
}
