import { useCallback, useEffect, useState } from 'react';
import { Lobby } from './features/lounge/lobby/Lobby';
import { PasswordDialog } from './features/lounge/lobby/PasswordDialog';
import { WindowZoom } from './features/lounge/lobby/WindowZoom';
import type { RoomInfo, RoomSettings } from './features/lounge/model/room';
import {
  clearExitReason,
  createRoom,
  joinRoom,
  leaveRoom,
  useLounge,
  watchLobby,
} from './features/lounge/net/loungeClient';
import { Room } from './features/lounge/room/Room';
import { PlannerApp } from './features/schedule/PlannerApp';
import { ApiError, errorMessage } from './shared/api/ApiError';
import { LoginPage } from './shared/auth/LoginPage';
import { prefersReducedMotion } from './shared/hooks/useMediaQuery';
import { ConnectionBanner } from './shared/realtime/ConnectionBanner';
import { useConnection } from './shared/realtime/useConnection';
import { useMe } from './shared/realtime/useMe';
import { HomePage } from './shared/home/HomePage';
import { Toast, useNotice } from './shared/ui/Toast';

// 화면 전환은 라우터 없이 상태로 한다. 방 안에 있을 때만 주소를 /room/{코드} 로 바꾼다 (초대 링크와 같은 모양)
type Screen =
  { name: 'home' } | { name: 'login' } | { name: 'lobby' } | { name: 'room'; created: boolean } | { name: 'schedule' };

const ROOM_PATH = /^\/room\/([A-Za-z0-9]{6})\/?$/;

/** 비밀번호를 물어보는 중인 방 */
type PasswordAsk = { code: string; name?: string; from?: DOMRect };

export function App() {
  const connection = useConnection();
  const me = useMe();
  const lounge = useLounge();
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [zoom, setZoom] = useState<{ from: DOMRect; created: boolean } | null>(null);
  const [passwordAsk, setPasswordAsk] = useState<PasswordAsk | null>(null);
  const [notice, notify] = useNotice();

  const toLobby = useCallback(() => setScreen({ name: 'lobby' }), []);
  const toHome = () => setScreen({ name: 'home' });

  // 로비를 보는 동안만 방 목록을 실시간으로 받는다
  const onLobby = screen.name === 'lobby';
  useEffect(() => (onLobby ? watchLobby() : undefined), [onLobby]);

  /** 방에 들어간 뒤: 주소를 /room/{코드} 로, 창문을 눌렀으면 확대 전환 */
  const afterJoin = useCallback((code: string, created: boolean, from?: DOMRect) => {
    window.history.pushState(null, '', `/room/${code}`);
    if (from && !prefersReducedMotion()) setZoom({ from, created });
    else setScreen({ name: 'room', created });
  }, []);

  /** 코드로 들어가기. 비밀번호가 필요하면 물어본다 */
  const enter = useCallback(
    async (code: string, ask: Omit<PasswordAsk, 'code'> = {}) => {
      try {
        const session = await joinRoom(code);
        afterJoin(session.view.code, false, ask.from);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PASSWORD_REQUIRED') setPasswordAsk({ code, ...ask });
        else notify(errorMessage(err));
      }
    },
    [afterJoin, notify],
  );

  // 초대 링크(/room/{코드})로 들어왔으면 바로 그 방으로
  useEffect(() => {
    const match = ROOM_PATH.exec(window.location.pathname);
    if (!match) return;
    setScreen({ name: 'lobby' });
    window.history.replaceState(null, '', '/');
    void enter(match[1]!.toUpperCase());
  }, [enter]);

  // 브라우저 뒤로 가기로 방 주소를 벗어나면 방에서 나간다
  useEffect(() => {
    const onPop = () => {
      if (screen.name === 'room' && !ROOM_PATH.test(window.location.pathname)) {
        void leaveRoom();
        toLobby();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [screen.name, toLobby]);

  // 강퇴당했거나 방이 사라졌으면 로비로 돌아가 이유를 보여준다
  useEffect(() => {
    if (!lounge.exitReason) return;
    notify(lounge.exitReason);
    clearExitReason();
    window.history.replaceState(null, '', '/');
    toLobby();
  }, [lounge.exitReason, notify, toLobby]);

  async function create(settings: RoomSettings) {
    const session = await createRoom({ ...settings, password: settings.password ?? null });
    afterJoin(session.view.code, true);
  }

  function leave() {
    void leaveRoom();
    window.history.replaceState(null, '', '/');
    toLobby();
  }

  function finishZoom() {
    if (!zoom) return;
    setScreen({ name: 'room', created: zoom.created });
    setZoom(null);
  }

  const inRoom = screen.name === 'room' && lounge.session && me;

  return (
    <>
      <ConnectionBanner status={connection} />
      {screen.name === 'home' && (
        <HomePage
          onLounge={toLobby}
          onSchedule={() => setScreen({ name: 'schedule' })}
          onLogin={() => setScreen({ name: 'login' })}
        />
      )}
      {screen.name === 'login' && <LoginPage onDone={toHome} onBack={toHome} />}
      {(screen.name === 'lobby' || (screen.name === 'room' && !inRoom)) && (
        <Lobby
          rooms={lounge.lobby}
          defaultRoomName={`${me?.nickname ?? '나'}의 방`}
          onEnter={(room: RoomInfo, from?: DOMRect) => void enter(room.code, { name: room.name, from })}
          onCode={(code) => void enter(code)}
          onCreate={create}
          onHome={toHome}
          onSchedule={() => setScreen({ name: 'schedule' })}
          notify={notify}
        />
      )}
      {inRoom && (
        <Room
          key={lounge.session!.view.id}
          session={lounge.session!}
          me={{ id: me.userId, nickname: me.nickname }}
          created={screen.created}
          onLeave={leave}
        />
      )}
      {screen.name === 'schedule' && <PlannerApp onBack={toHome} />}
      {zoom && <WindowZoom from={zoom.from} onDone={finishZoom} />}
      {passwordAsk && (
        <PasswordDialog
          roomName={passwordAsk.name}
          onClose={() => setPasswordAsk(null)}
          onSubmit={async (password) => {
            const session = await joinRoom(passwordAsk.code, password);
            setPasswordAsk(null);
            afterJoin(session.view.code, false, passwordAsk.from);
          }}
        />
      )}
      <Toast message={notice} />
    </>
  );
}
