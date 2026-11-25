import { useCallback, useEffect, useRef, useState } from 'react';
import { Lobby } from './features/lounge/lobby/Lobby';
import { PasswordDialog } from './features/lounge/lobby/PasswordDialog';
import { WindowZoom } from './features/lounge/lobby/WindowZoom';
import type { RoomInfo, RoomSettings } from './features/lounge/model/room';
import { FriendsRail, FriendsSidebar } from './features/lounge/friends/FriendsSidebar';
import { useFriends } from './features/lounge/friends/useFriends';
import {
  clearExitReason,
  clearFriendNotice,
  clearInvitation,
  createRoom,
  inviteFriend,
  joinRoom,
  leaveRoom,
  sendHeartbeat,
  startLounge,
  useLounge,
  watchLobby,
} from './features/lounge/net/loungeClient';
import { Room } from './features/lounge/room/Room';
import { PlannerApp } from './features/schedule/PlannerApp';
import { ApiError, errorMessage } from './shared/api/ApiError';
import { LoginDialog, LoginPage } from './shared/auth/LoginPage';
import { useMember } from './shared/auth/useMember';
import { prefersReducedMotion, useMediaQuery } from './shared/hooks/useMediaQuery';
import { connect } from './shared/realtime/connection';
import { ConnectionBanner } from './shared/realtime/ConnectionBanner';
import { useConnection } from './shared/realtime/useConnection';
import { useMe } from './shared/realtime/useMe';
import { HomePage } from './shared/home/HomePage';
import { PRESENCE_HEARTBEAT_MS, type DirectMessage, type FriendEntry } from '@lounge/shared';
import { Toast, useNotice } from './shared/ui/Toast';

// 화면 전환은 라우터 없이 상태로 한다. 방 안에 있을 때만 주소를 /room/{코드} 로 바꾼다 (초대 링크와 같은 모양)
type Screen =
  { name: 'home' } | { name: 'login' } | { name: 'lobby' } | { name: 'room'; created: boolean } | { name: 'schedule' };

const ROOM_PATH = /^\/room\/([A-Za-z0-9]{6})\/?$/;

/** 비밀번호를 물어보는 중인 방 */
type PasswordAsk = { code: string; name?: string; from?: DOMRect };

/** 친구 현황판을 접어 뒀는지 (브라우저마다 기억) */
const FOLD_KEY = 'lounge.friendsFolded';
function readFolded(): boolean {
  try {
    return localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    return false;
  }
}

export function App() {
  const connection = useConnection();
  const me = useMe();
  const lounge = useLounge();
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [zoom, setZoom] = useState<{ from: DOMRect; created: boolean } | null>(null);
  const [passwordAsk, setPasswordAsk] = useState<PasswordAsk | null>(null);
  const [notice, notify] = useNotice();
  const member = useMember();
  // 친구 현황판: 넓은 화면은 오른쪽에 늘 펼침(접을 수 있음), 좁은 화면은 [친구]로 여는 서랍
  const docked = useMediaQuery('(min-width: 1100px)');
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsFolded, setFriendsFolded] = useState(() => readFolded());
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  // 방 안 오른쪽 칸: 방 채팅 / 친구
  const [roomSideTab, setRoomSideTab] = useState<'chat' | 'friends'>('chat');
  const { overview: friends } = useFriends();

  const foldFriends = (folded: boolean) => {
    setFriendsFolded(folded);
    try {
      localStorage.setItem(FOLD_KEY, folded ? '1' : '0');
    } catch {
      // 저장이 막혀 있으면 이번 접속 동안만
    }
  };

  // 앱이 켜지면 친구 초대·요청 알림을 받을 수 있게 연결해 둔다
  useEffect(() => startLounge(), []);

  // 1:1 메시지 알림: 그 대화를 보고 있지 않으면 짧게 알려준다
  // (알림 판단에 쓰는 최신 값은 ref 로 읽는다. 듣기는 회원마다 한 번만 건다)
  const inRoomNow = screen.name === 'room' && Boolean(lounge.session);
  const panelVisible = docked ? (inRoomNow ? roomSideTab === 'friends' : !friendsFolded) : friendsOpen;
  const latest = useRef({ friends, panelVisible, openChat });
  latest.current = { friends, panelVisible, openChat };
  const memberId = member?.userId ?? null;
  useEffect(() => {
    if (!memberId) return;
    let stopped = false;
    let detach = () => {};
    void connect().then((socket) => {
      if (stopped) return;
      const onMessage = (m: DirectMessage) => {
        const now = latest.current;
        if (m.to !== memberId || (now.panelVisible && now.openChat === m.from)) return;
        const name = now.friends?.friends.find((f) => f.userId === m.from)?.nickname ?? '친구';
        notify(`💬 ${name}: ${m.text.length > 40 ? `${m.text.slice(0, 40)}…` : m.text}`);
      };
      socket.on('dm:message', onMessage);
      detach = () => socket.off('dm:message', onMessage);
    });
    return () => {
      stopped = true;
      detach();
    };
  }, [memberId, notify]);

  // 회원이면 접속 중 신호를 보낸다 (20초마다, 방·게임이 바뀔 때마다)
  const roomKey = `${lounge.session?.view.id ?? ''}:${lounge.session?.game?.view.phase ?? ''}`;
  useEffect(() => {
    if (!member) return;
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [member, roomKey]);

  // 친구 요청 알림
  useEffect(() => {
    if (!lounge.friendNotice) return;
    notify(lounge.friendNotice);
    clearFriendNotice();
  }, [lounge.friendNotice, notify]);

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

  /** 친구 초대를 받아 들어가기 (비밀번호를 묻지 않는다) */
  async function acceptInvitation() {
    const invitation = lounge.invitation;
    clearInvitation();
    if (!invitation) return;
    try {
      const session = await joinRoom(invitation.room.code, undefined, true);
      afterJoin(session.view.code, false);
    } catch (err) {
      notify(errorMessage(err));
    }
  }

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

  // 친구 현황판에서 할 수 있는 일 (어느 모양이든 같다)
  const panelActions = {
    currentRoomCode: inRoom ? lounge.session!.view.code : null,
    onInvite: async (friend: FriendEntry) => {
      await inviteFriend(friend.userId);
    },
    onFollow: (friend: FriendEntry) => {
      setFriendsOpen(false);
      if (friend.presence.room) void enter(friend.presence.room.code, { name: friend.presence.room.name });
    },
    openChat,
    onOpenChat: setOpenChat,
    onLogin: () => setLoginOpen(true),
  };
  // 넓은 화면에서는 현황판이 늘 보이므로 화면의 [친구] 버튼은 좁은 화면에서만
  const openDrawer = member && !docked ? () => setFriendsOpen(true) : undefined;
  // 캠퍼스 플래너는 자기 오른쪽 칸에, 방 안은 오른쪽 [방 채팅 | 친구] 탭에 현황판을 넣는다. 로그인 화면에는 두지 않는다
  const dockHere = docked && screen.name !== 'schedule' && screen.name !== 'login' && !inRoom;

  return (
    <div className={dockHere ? 'app-shell' : undefined} style={dockHere ? undefined : { height: '100%' }}>
      <div className={dockHere ? 'app-main' : undefined} style={dockHere ? undefined : { height: '100%' }}>
        <ConnectionBanner status={connection} />
        {screen.name === 'home' && (
          <HomePage
            onLounge={toLobby}
            onSchedule={() => setScreen({ name: 'schedule' })}
            onLogin={() => setScreen({ name: 'login' })}
            onFriends={openDrawer}
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
            onFriends={openDrawer}
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
            onFriends={openDrawer}
            friendsPanel={docked ? <FriendsSidebar variant="tab" {...panelActions} /> : undefined}
            sideTab={roomSideTab}
            onSideTab={setRoomSideTab}
          />
        )}
        {screen.name === 'schedule' && (
          <PlannerApp onBack={toHome} friendsPanel={<FriendsSidebar variant="embedded" {...panelActions} />} />
        )}
      </div>
      {dockHere &&
        (friendsFolded ? (
          <FriendsRail onOpen={() => foldFriends(false)} />
        ) : (
          <FriendsSidebar variant="docked" {...panelActions} onClose={() => foldFriends(true)} />
        ))}
      {!docked && friendsOpen && (
        <>
          <button
            type="button"
            className="fs-backdrop"
            aria-label="친구 창 닫기"
            onClick={() => setFriendsOpen(false)}
          />
          <FriendsSidebar variant="drawer" {...panelActions} onClose={() => setFriendsOpen(false)} />
        </>
      )}
      {loginOpen && <LoginDialog onClose={() => setLoginOpen(false)} />}
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
      {lounge.invitation && (
        <div className="invite-banner" role="alert">
          <span>
            {lounge.invitation.from.nickname}님이 '{lounge.invitation.room.name}' 방에 초대했어요
          </span>
          <button type="button" className="btn btn-primary" onClick={() => void acceptInvitation()}>
            들어가기
          </button>
          <button type="button" className="btn btn-ghost" onClick={clearInvitation}>
            닫기
          </button>
        </div>
      )}
      <Toast message={notice} />
    </div>
  );
}
