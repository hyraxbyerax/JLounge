import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { errorMessage } from '../../../shared/api/ApiError';
import { LoginDialog } from '../../../shared/auth/LoginPage';
import { friendsApi } from '../friends/friendsApi';
import { useFriends } from '../friends/useFriends';
import { useMediaQuery } from '../../../shared/hooks/useMediaQuery';
import type { YouTubePlayer } from '../../../shared/youtube/youtubeApi';
import { LockIcon } from '../../../shared/ui/icons';
import { Toast, useNotice } from '../../../shared/ui/Toast';
import { BOT, GAME_CATALOG, type GameType } from '@lounge/shared';
import { CatchMindPanel } from '../game/catchmind/CatchMindPanel';
import { GamePickerDialog } from '../game/GamePickerDialog';
import { toMembers, type Me, type Member, type RoomSettings } from '../model/room';
import { createRoomState, parseCommand, roomReducer, type PostedMessage } from '../model/roomState';
import {
  callBot,
  cancelSong,
  clearStrokes,
  kickMember,
  musicCommand,
  quitGame,
  reportUnplayable,
  requestSong,
  seekMusic,
  selectGame,
  setGameTopic,
  sendChat,
  sendStroke,
  startGame,
  transferHost,
  undoStroke,
  updateRoom,
  type RoomSession,
} from '../net/loungeClient';
import { ChatPanel } from './ChatPanel';
import { MemberList } from './MemberList';
import { LoungeTV } from './LoungeTV';
import { MusicBar, type HostMusicCommand } from './MusicBar';
import { CommandHelp, QueueList } from './QueueList';
import { RoomSettingsDialog } from './RoomSettingsDialog';
import { SongSearchDialog } from './SongSearchDialog';
import './room.css';

type Props = {
  /** 서버가 준 방 정보와 채팅 (loungeClient 가 계속 갱신한다) */
  session: RoomSession;
  me: Me;
  /** 방금 만든 방인지 (만든 사람에게만 안내를 보여준다) */
  created: boolean;
  onLeave: () => void;
  /** 친구 창 (로그인한 회원만). 없으면 게스트라 [로그인]을 보여준다 */
  onFriends?: () => void;
};

type Tab = 'chat' | 'queue' | 'members';
type Dialog = 'song' | 'settings' | 'game' | 'login' | null;

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: '채팅' },
  { id: 'queue', label: '대기큐' },
  { id: 'members', label: '참가자' },
];

export function Room({ session, me, created, onLeave, onFriends }: Props) {
  const room = session.view;
  const [state, dispatch] = useReducer(roomReducer, null, () =>
    createRoomState(me, created ? '방을 만들었어요. 초대 링크로 친구를 불러보세요' : undefined),
  );
  const { overview: friends, reload: reloadFriends } = useFriends();
  const friendIds = useMemo(() => new Set(friends?.friends.map((f) => f.userId)), [friends]);
  const pendingIds = useMemo(() => new Set(friends?.outgoing.map((f) => f.userId)), [friends]);
  const members = useMemo(() => toMembers(room, friendIds), [room, friendIds]);
  const botJoined = members.some((m) => m.id === BOT.id);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [notice, showNotice] = useNotice();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [membersOpen, setMembersOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');
  // 내 소리만 끄기·음량 (나에게만 적용)
  const [player, setPlayer] = useState<YouTubePlayer | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [blocked, setBlocked] = useState(false);

  const host = members.find((m) => m.isHost) ?? members[0];
  const isHost = room.hostId === me.id;
  const nicknameOf = useCallback((id: string) => members.find((m) => m.id === id)?.nickname ?? '누군가', [members]);

  // 서버가 보낸 채팅을 화면 채팅 목록에 붙인다 (같은 메시지는 한 번만)
  useEffect(() => {
    dispatch({ type: 'receive', messages: session.messages });
  }, [session.messages]);

  const post = useCallback((message: PostedMessage) => dispatch({ type: 'post', message }), []);
  const tell = useCallback((text: string) => post({ kind: 'private', text }), [post]);

  // 게임은 서버가 진행한다. 이 화면은 받은 상태를 그리고, 방장 동작·그림·정답(채팅)을 서버로 보낸다
  const game = session.game;
  const view = game?.view ?? null;
  const playing = view?.phase === 'playing';
  const roundLive = playing && !view.revealing;
  const amPlayer = view?.players.includes(me.id) ?? false;

  /** 방장 동작·그림은 서버가 확인한다. 거절되면 이유를 나에게만 보여준다 */
  const act = (task: Promise<unknown>) => task.catch((err: unknown) => tell(errorMessage(err)));

  /** "/" 명령어: 서버가 권한을 확인하고, 결과 안내는 나에게만 */
  function runCommand(text: string) {
    const command = parseCommand(text);
    if (command.kind === 'invalid') return tell(command.message);
    if (command.kind === 'endgame') {
      if (!isHost) return tell('방장만 쓸 수 있는 명령어예요');
      if (!game) return tell('진행 중인 게임이 없어요');
      void act(quitGame());
      return;
    }
    musicCommand({ name: command.name, args: command.args }).then(
      ({ notice }) => notice && tell(notice),
      (err: unknown) => tell(errorMessage(err)),
    );
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (trimmed.startsWith('/')) {
      runCommand(trimmed);
      return;
    }
    // 게임 중이면 서버가 정답인지 본다 (정답은 채팅에 올라가지 않는다)
    void act(sendChat(trimmed));
  }

  async function invite() {
    const link = `${window.location.origin}/room/${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      showNotice('초대 링크를 복사했어요');
    } catch {
      showNotice(`초대 링크: ${link}`);
    }
  }

  async function saveSettings(settings: RoomSettings) {
    await updateRoom(settings);
    setDialog(null);
  }

  function pickGame(type: GameType) {
    setDialog(null);
    void act(selectGame(type));
  }

  const closeMenu = () => setMenuOpen(false);
  const actions = (
    <>
      {isHost && !game && (
        <button
          type="button"
          className="btn btn-ghost"
          // 게임이 하나뿐이면 고르는 창 없이 바로 연다
          onClick={() => (closeMenu(), GAME_CATALOG.length === 1 ? pickGame(GAME_CATALOG[0].type) : setDialog('game'))}
        >
          게임
        </button>
      )}
      {isHost && !botJoined && (
        <button type="button" className="btn btn-ghost" onClick={() => (closeMenu(), act(callBot()))}>
          연습 상대 부르기
        </button>
      )}
      <button type="button" className="btn btn-ghost" onClick={() => (closeMenu(), invite())}>
        초대
      </button>
      {onFriends ? (
        <button type="button" className="btn btn-ghost" onClick={() => (closeMenu(), onFriends())}>
          친구
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => (closeMenu(), setDialog('login'))}>
          로그인
        </button>
      )}
      {isHost && (
        <button type="button" className="btn btn-ghost" onClick={() => (closeMenu(), setDialog('settings'))}>
          설정
        </button>
      )}
      <button type="button" className="btn btn-ghost" onClick={onLeave}>
        나가기
      </button>
    </>
  );

  const badges = [!room.isPublic && '비공개', room.hasPassword && '비밀번호'].filter(Boolean);

  const header = (
    <header className="room-header">
      <h1 className="room-name sign">{room.name}</h1>
      <p className="room-info">
        {!isMobile && host && <>👑 {host.nickname} · </>}
        {members.length}/{room.maxMembers}
        {badges.length > 0 && <> · {badges.join(' · ')}</>}
        {room.locked && (
          <span className="room-locked">
            {' · '}
            <LockIcon className="room-lock-icon" /> 잠금
          </span>
        )}
      </p>
      {isMobile ? (
        <div className="room-menu-wrap">
          <button
            type="button"
            className="icon-btn"
            aria-label="방 메뉴"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⋯
          </button>
          {menuOpen && <div className="room-menu">{actions}</div>}
        </div>
      ) : (
        <div className="room-actions">{actions}</div>
      )}
    </header>
  );

  const gameActions = { onStart: () => void act(startGame()), onQuit: () => void act(quitGame()) };
  const gamePanel = !game ? null : (
    <CatchMindPanel
      game={game}
      meId={me.id}
      isHost={isHost}
      nicknameOf={nicknameOf}
      {...gameActions}
      onTopic={(topic) => void act(setGameTopic(topic))}
      onStroke={(stroke) => void act(sendStroke(stroke))}
      onUndo={() => void act(undoStroke())}
      onClear={() => void act(clearStrokes())}
    />
  );

  const music = session.music;
  const paused = music.now?.state === 'paused';
  const cancel = (entryId: string) =>
    cancelSong(entryId).then(
      ({ notice }) => tell(notice),
      (err: unknown) => tell(errorMessage(err)),
    );
  const changeVolume = (v: number) => {
    setVolume(v);
    setMuted(v === 0);
  };
  // 영상과 미니 음악 바는 같이 나오지 않는다: 평소엔 TV 아래 리모컨, 게임 중엔 헤더 옆 미니 위젯
  const musicBar = (
    <MusicBar
      now={music.now}
      paused={paused}
      queue={music.queue}
      meId={me.id}
      isHost={isHost}
      variant={game ? 'mini' : 'remote'}
      compact={isMobile}
      player={player}
      blocked={blocked}
      muted={muted}
      onMutedChange={setMuted}
      onHostCommand={(command: HostMusicCommand) => runCommand(command)}
      onRequest={() => setDialog('song')}
      onCancel={cancel}
      onSeek={(sec) => void seekMusic(sec).catch((err: unknown) => tell(errorMessage(err)))}
    />
  );

  // 라운지 TV는 하나만 두고 보이기만 바꾼다 (게임 중: 화면 밖에서 소리만). 다시 만들면 음악이 끊긴다
  const tv = (
    <div className={`room-tv${game ? ' is-offscreen' : ''}`}>
      <div className="tv-set">
        <LoungeTV
          now={music.now}
          hidden={game !== null}
          muted={muted}
          volume={volume}
          onMutedChange={setMuted}
          onVolumeChange={changeVolume}
          isHost={isHost}
          onTogglePause={() => runCommand(paused ? '/resume' : '/pause')}
          onPlayer={setPlayer}
          onBlockedChange={setBlocked}
          onError={reportUnplayable}
        />
        {!game && musicBar}
      </div>
    </div>
  );

  let chatPlaceholder: string | undefined;
  if (roundLive && amPlayer) {
    if (view.drawerId === me.id) chatPlaceholder = '그리는 중이에요. 제시어는 채팅에 쓸 수 없어요';
    else if (!game?.private) chatPlaceholder = '정답을 입력해보세요';
  }
  const chat = (
    <ChatPanel
      messages={state.messages}
      meId={me.id}
      isHost={isHost}
      placeholder={chatPlaceholder}
      slowMode={roundLive && amPlayer}
      onSend={send}
    />
  );

  const memberList = (
    <MemberList
      members={members}
      meId={me.id}
      isHost={isHost}
      onTransfer={(m: Member) => act(transferHost(m.id))}
      onKick={(m: Member) => act(kickMember(m.id))}
      // 회원끼리만 친구 요청 (게스트·연습 상대·이미 친구·이미 요청한 사람 제외)
      canRequestFriend={(m: Member) =>
        Boolean(onFriends) && !m.isGuest && !m.isBot && !m.isFriend && !pendingIds.has(m.id)
      }
      onRequestFriend={(m: Member) =>
        friendsApi.request({ userId: m.id }).then(
          (res) => {
            tell(res.message);
            reloadFriends();
          },
          (err: unknown) => tell(errorMessage(err)),
        )
      }
    />
  );

  return (
    <div className={`room${isMobile ? ' is-mobile' : ''}`}>
      {isMobile ? (
        <>
          <div className={`room-main${game ? ' in-game' : ''}`}>
            {header}
            {game && musicBar}
            {tv}
            {gamePanel && <div className="room-game">{gamePanel}</div>}
          </div>
          <div className="room-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                className="room-tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="room-tabpanel" role="tabpanel">
            {tab === 'chat' && chat}
            {tab === 'queue' && (
              <div className="tab-scroll">
                <QueueList queue={music.queue} meId={me.id} onCancel={cancel} />
                {isHost && <CommandHelp />}
              </div>
            )}
            {tab === 'members' && <div className="tab-scroll">{memberList}</div>}
          </div>
        </>
      ) : (
        <>
          <div className={`room-main${game ? ' in-game' : ''}`}>
            {header}
            {game && musicBar}
            {tv}
            {gamePanel && <div className="room-game">{gamePanel}</div>}
          </div>
          <aside className="room-side">
            <div className="members">
              <button
                type="button"
                className="members-toggle"
                aria-expanded={membersOpen}
                onClick={() => setMembersOpen((v) => !v)}
              >
                참가자 {members.length}명 <span aria-hidden="true">{membersOpen ? '▴' : '▾'}</span>
              </button>
              {membersOpen && memberList}
            </div>
            {chat}
          </aside>
        </>
      )}

      {dialog === 'song' && (
        <SongSearchDialog
          onClose={() => setDialog(null)}
          onPick={(song) => {
            setDialog(null);
            requestSong(song.videoId).then(
              ({ position }) => position > 0 && tell(`신청했어요. 대기 ${position}번째예요`),
              (err: unknown) => tell(errorMessage(err)),
            );
          }}
        />
      )}
      {dialog === 'settings' && (
        <RoomSettingsDialog
          mode="edit"
          initial={room}
          currentMembers={members.length}
          onSubmit={saveSettings}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'game' && <GamePickerDialog onPick={pickGame} onClose={() => setDialog(null)} />}
      {dialog === 'login' && <LoginDialog onClose={() => setDialog(null)} />}
      <Toast message={notice} />
    </div>
  );
}
