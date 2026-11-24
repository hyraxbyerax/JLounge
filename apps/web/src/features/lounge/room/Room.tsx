import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { errorMessage } from '../../../shared/api/ApiError';
import { useMediaQuery } from '../../../shared/hooks/useMediaQuery';
import type { YouTubePlayer } from '../../../shared/youtube/youtubeApi';
import { LockIcon } from '../../../shared/ui/icons';
import { Toast, useNotice } from '../../../shared/ui/Toast';
import { BOT } from '../bot/bot';
import { CatchMindPanel } from '../game/catchmind/CatchMindPanel';
import { useCatchMind } from '../game/catchmind/useCatchMind';
import { GamePickerDialog } from '../game/GamePickerDialog';
import { toMembers, type Me, type Member, type RoomSettings } from '../model/room';
import { createRoomState, roomReducer, type PostedMessage } from '../model/roomState';
import { callBot, kickMember, sendChat, transferHost, updateRoom, type RoomSession } from '../net/loungeClient';
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
};

type Tab = 'chat' | 'queue' | 'members';
type Dialog = 'song' | 'settings' | 'game' | null;

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: '채팅' },
  { id: 'queue', label: '대기큐' },
  { id: 'members', label: '참가자' },
];

export function Room({ session, me, created, onLeave }: Props) {
  const room = session.view;
  const [state, dispatch] = useReducer(roomReducer, null, () =>
    createRoomState(me, created ? '방을 만들었어요. 초대 링크로 친구를 불러보세요' : undefined),
  );
  const members = useMemo(() => toMembers(room), [room]);
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

  // 3단계 전까지 캐치마인드는 방장 화면 안에서 "방장 + 연습 상대"끼리만 (docs/lounge-spec.md 8장)
  const players = useMemo(() => (isHost && botJoined ? [me.id, BOT.id] : [me.id]), [isHost, botJoined, me.id]);
  const catchmind = useCatchMind({ meId: me.id, players, nicknameOf, post });
  const { game, view } = catchmind;
  const playing = game?.phase === 'playing';

  // 방장을 넘겼거나 연습 상대가 나가면 이 화면의 게임은 닫는다
  const canPlay = isHost && botJoined;
  const { quit } = catchmind;
  useEffect(() => {
    if (!canPlay && game) quit();
  }, [canPlay, game, quit]);

  function send(text: string) {
    const trimmed = text.trim();
    const isCommand = trimmed.startsWith('/');

    // 게임 강제 종료 (방장만). 방장이 아니거나 게임이 없으면 아래 명령어 처리에서 안내한다
    if (trimmed.split(/\s+/)[0] === '/endgame' && isHost && game) {
      catchmind.quit(true);
      return;
    }
    if (isCommand) {
      dispatch({ type: 'command', text, isHost });
      return;
    }

    if (playing) {
      const result = catchmind.guess(me.id, trimmed);
      if (result === 'correct') return;
      if (result === 'blocked') {
        tell('정답이 드러나는 말은 채팅에 쓸 수 없어요');
        return;
      }
    }
    sendChat(trimmed).catch((err: unknown) => tell(errorMessage(err)));
  }

  /** 방장 동작은 서버가 확인한다. 거절되면 이유를 나에게만 보여준다 */
  const hostAction = (task: Promise<unknown>) => task.catch((err: unknown) => tell(errorMessage(err)));

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

  function pickGame() {
    setDialog(null);
    catchmind.select();
  }

  const closeMenu = () => setMenuOpen(false);
  const actions = (
    <>
      {canPlay && !game && (
        <button type="button" className="btn btn-ghost" onClick={() => (closeMenu(), setDialog('game'))}>
          게임
        </button>
      )}
      {isHost && !botJoined && (
        <button type="button" className="btn btn-ghost" onClick={() => (closeMenu(), hostAction(callBot()))}>
          연습 상대 부르기
        </button>
      )}
      <button type="button" className="btn btn-ghost" onClick={() => (closeMenu(), invite())}>
        초대
      </button>
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

  const gamePanel = game ? <CatchMindPanel controller={catchmind} isHost={isHost} nicknameOf={nicknameOf} /> : null;

  const cancel = (entryId: string) => dispatch({ type: 'cancel', entryId });
  const changeVolume = (v: number) => {
    setVolume(v);
    setMuted(v === 0);
  };
  // 영상과 미니 음악 바는 같이 나오지 않는다: 평소엔 TV 아래 리모컨, 게임 중엔 헤더 옆 미니 위젯
  const musicBar = (
    <MusicBar
      now={state.now}
      paused={state.paused}
      queue={state.queue}
      meId={me.id}
      isHost={isHost}
      variant={game ? 'mini' : 'remote'}
      compact={isMobile}
      player={player}
      blocked={blocked}
      muted={muted}
      onMutedChange={setMuted}
      onHostCommand={(command: HostMusicCommand) => dispatch({ type: 'command', text: command, isHost })}
      onRequest={() => setDialog('song')}
      onCancel={cancel}
    />
  );

  // 라운지 TV는 하나만 두고 보이기만 바꾼다 (게임 중: 화면 밖에서 소리만). 다시 만들면 음악이 끊긴다
  const tv = (
    <div className={`room-tv${game ? ' is-offscreen' : ''}`}>
      <div className="tv-set">
        <LoungeTV
          now={state.now}
          paused={state.paused}
          hidden={game !== null}
          muted={muted}
          volume={volume}
          onMutedChange={setMuted}
          onVolumeChange={changeVolume}
          isHost={isHost}
          onTogglePause={() => dispatch({ type: 'command', text: state.paused ? '/resume' : '/pause', isHost })}
          onPlayer={setPlayer}
          onBlockedChange={setBlocked}
          onEnded={(entryId) => dispatch({ type: 'ended', entryId })}
          onError={(entryId) => dispatch({ type: 'failed', entryId })}
        />
        {!game && musicBar}
      </div>
    </div>
  );

  let chatPlaceholder: string | undefined;
  if (playing && view && !view.isRevealing) {
    if (view.isDrawer) chatPlaceholder = '그리는 중이에요. 제시어는 채팅에 쓸 수 없어요';
    else if (!view.word) chatPlaceholder = '정답을 입력해보세요';
  }
  const chat = (
    <ChatPanel
      messages={state.messages}
      meId={me.id}
      isHost={isHost}
      placeholder={chatPlaceholder}
      slowMode={playing}
      onSend={send}
    />
  );

  const memberList = (
    <MemberList
      members={members}
      meId={me.id}
      isHost={isHost}
      onTransfer={(m: Member) => hostAction(transferHost(m.id))}
      onKick={(m: Member) => hostAction(kickMember(m.id))}
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
                <QueueList queue={state.queue} meId={me.id} onCancel={cancel} />
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
            dispatch({ type: 'request', song });
            setDialog(null);
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
      <Toast message={notice} />
    </div>
  );
}
