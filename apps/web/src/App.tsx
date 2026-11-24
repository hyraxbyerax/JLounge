import { useState } from 'react';
import { Lobby } from './features/lounge/lobby/Lobby';
import { WindowZoom } from './features/lounge/lobby/WindowZoom';
import {
  createRoom,
  joinMembers,
  leaveMembers,
  ME,
  type Member,
  type RoomInfo,
  type RoomSettings,
} from './features/lounge/model/room';
import { EMPTY_MUSIC, type MusicSnapshot } from './features/lounge/model/roomState';
import { Room } from './features/lounge/room/Room';
import { PlannerApp } from './features/schedule/PlannerApp';
import { LoginPage } from './shared/auth/LoginPage';
import { prefersReducedMotion } from './shared/hooks/useMediaQuery';
import { ConnectionBanner } from './shared/realtime/ConnectionBanner';
import { useConnection } from './shared/realtime/useConnection';
import { HomePage } from './shared/home/HomePage';

/** 방에 남아 있는 상태. 서버를 붙이면 Redis(room:{id}, :members, :now, :queue)가 갖는다 */
type LiveRoom = {
  info: RoomInfo;
  members: Member[];
  music: MusicSnapshot;
};

// 화면 전환은 아직 라우터 없이 상태로 한다 (주소 /room/{코드} 연결은 0단계 이후)
type Screen =
  | { name: 'home' }
  | { name: 'login' }
  | { name: 'lobby' }
  | { name: 'room'; room: LiveRoom; created: boolean }
  | { name: 'schedule' };

const me: Member = { id: ME.id, nickname: ME.nickname, isHost: false, isFriend: false };

export function App() {
  const connection = useConnection();
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [zoom, setZoom] = useState<{ from: DOMRect; room: LiveRoom } | null>(null);

  function joinRoom(room: LiveRoom, created = false) {
    const members = joinMembers(room.members, me);
    setScreen({ name: 'room', room: { ...room, members, info: { ...room.info, members: members.length } }, created });
  }

  function enterRoom(info: RoomInfo, from?: DOMRect) {
    const room = rooms.find((r) => r.info.id === info.id);
    if (!room) return;
    if (!from || prefersReducedMotion()) joinRoom(room);
    else setZoom({ from, room });
  }

  function finishZoom() {
    if (!zoom) return;
    joinRoom(zoom.room);
    setZoom(null);
  }

  function createAndEnter(settings: RoomSettings) {
    const room: LiveRoom = { info: createRoom(settings), members: [], music: EMPTY_MUSIC };
    setRooms((rs) => [...rs, room]);
    joinRoom(room, true);
  }

  function updateRoom(info: RoomInfo) {
    if (screen.name !== 'room') return;
    setScreen({ ...screen, room: { ...screen.room, info } });
    setRooms((rs) => rs.map((r) => (r.info.id === info.id ? { ...r, info } : r)));
  }

  /** 내가 나가면 가장 오래 있던 사람이 방장이 되고, 아무도 없으면 방이 사라진다 */
  function leaveRoom(snapshot: { members: Member[]; music: MusicSnapshot }) {
    if (screen.name !== 'room') return;
    const { info } = screen.room;
    const members = leaveMembers(snapshot.members, ME.id);
    setRooms((rs) =>
      members === null
        ? rs.filter((r) => r.info.id !== info.id)
        : rs.map((r) =>
            r.info.id === info.id
              ? {
                  info: { ...info, members: members.length, game: null, nowPlaying: snapshot.music.now?.title ?? null },
                  members,
                  music: snapshot.music,
                }
              : r,
          ),
    );
    setScreen({ name: 'lobby' });
  }

  const toLobby = () => setScreen({ name: 'lobby' });
  const toHome = () => setScreen({ name: 'home' });

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
      {screen.name === 'lobby' && (
        <Lobby
          rooms={rooms.map((r) => r.info)}
          onEnter={enterRoom}
          onCreate={createAndEnter}
          onHome={() => setScreen({ name: 'home' })}
          onSchedule={() => setScreen({ name: 'schedule' })}
        />
      )}
      {screen.name === 'room' && (
        <Room
          key={screen.room.info.id}
          room={screen.room.info}
          members={screen.room.members}
          music={screen.room.music}
          created={screen.created}
          onUpdate={updateRoom}
          onLeave={leaveRoom}
        />
      )}
      {screen.name === 'schedule' && <PlannerApp onBack={toHome} />}
      {zoom && <WindowZoom from={zoom.from} onDone={finishZoom} />}
    </>
  );
}
