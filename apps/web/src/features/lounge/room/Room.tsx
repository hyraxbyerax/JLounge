import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useMediaQuery } from '../../../shared/hooks/useMediaQuery';
import { useTimeouts } from '../../../shared/hooks/useTimeouts';
import { LockIcon } from '../../../shared/ui/icons';
import { Toast, useNotice } from '../../../shared/ui/Toast';
import { BOT, BOT_LINES, botReply } from '../bot/bot';
import { CatchMindPanel } from '../game/catchmind/CatchMindPanel';
import { useCatchMind } from '../game/catchmind/useCatchMind';
import { GamePickerDialog } from '../game/GamePickerDialog';
import { joinMembers, ME, transferHost, type Member, type RoomInfo, type RoomSettings } from '../model/room';
import { createRoomState, roomReducer, type MusicSnapshot, type PostedMessage } from '../model/roomState';
import { ChatPanel } from './ChatPanel';
import { MemberList } from './MemberList';
import { MusicBar } from './MusicBar';
import { CommandHelp, QueueList } from './QueueList';
import { RoomSettingsDialog } from './RoomSettingsDialog';
import { SongSearchDialog } from './SongSearchDialog';
import { Stage } from './Stage';
import './room.css';

type Props = {
  room: RoomInfo;
  /** 들어온 순서. 내가 들어온 뒤의 목록이다 */
  members: Member[];
  music: MusicSnapshot;
  /** 방금 만든 방인지 */
  created: boolean;
  onUpdate: (room: RoomInfo) => void;
  /** 나갈 때 방에 남는 상태를 넘긴다 (방장 위임은 받는 쪽에서) */
  onLeave: (snapshot: { members: Member[]; music: MusicSnapshot }) => void;
};

type Tab = 'chat' | 'queue' | 'members';
type Dialog = 'song' | 'settings' | 'game' | null;

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: '채팅' },
  { id: 'queue', label: '대기큐' },
  { id: 'members', label: '참가자' },
];

const BOT_JOIN_DELAY_MS = 1200;

export function Room({ room, members: initialMembers, music, created, onUpdate, onLeave }: Props) {
  const [state, dispatch] = useReducer(roomReducer, null, () =>
    createRoomState(music, created ? undefined : `${ME.nickname}님이 들어왔어요`),
  );
  const [members, setMembers] = useState(initialMembers);
  const botJoined = members.some((m) => m.id === BOT.id);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [notice, showNotice] = useNotice();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [membersOpen, setMembersOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');
  const later = useTimeouts();

  const host = members.find((m) => m.isHost) ?? members[0]!;
  const isHost = host.id === ME.id;
  const nicknameOf = useCallback((id: string) => members.find((m) => m.id === id)?.nickname ?? '누군가', [members]);

  const post = useCallback((message: PostedMessage) => dispatch({ type: 'post', message }), []);
  const botSay = useCallback(
    (text: string, delayMs: number) =>
      later(() => post({ kind: 'user', userId: BOT.id, nickname: BOT.nickname, text }), delayMs),
    [later, post],
  );

  // 새 방이면 연습 상대가 조금 뒤에 들어온다.
  // 연습 상대가 지키던 방에 돌아오면, 방장이던 연습 상대가 방장을 다시 넘겨준다.
  const firstMembers = useRef(initialMembers).current;
  const botWasHost = useRef(firstMembers.some((m) => m.id === BOT.id && m.isHost));
  useEffect(() => {
    if (botWasHost.current) {
      botSay(BOT_LINES.welcomeBack, 1000);
      later(() => {
        botWasHost.current = false;
        setMembers((ms) => transferHost(ms, ME.id));
        post({ kind: 'system', text: `방장이 ${ME.nickname}님으로 바뀌었어요` });
      }, 2200);
      return;
    }
    if (firstMembers.some((m) => m.id === BOT.id)) return;
    later(() => {
      setMembers((ms) => joinMembers(ms, { id: BOT.id, nickname: BOT.nickname, isHost: false, isFriend: false, isBot: true }));
      post({ kind: 'system', text: `${BOT.nickname}님이 들어왔어요` });
      botSay(BOT_LINES.greet, 1500);
    }, BOT_JOIN_DELAY_MS);
  }, [firstMembers, botSay, later, post]);

  const players = useMemo(() => members.map((m) => m.id), [members]);
  const catchmind = useCatchMind({ players, nicknameOf, post });
  const { game, view } = catchmind;
  const playing = game?.phase === 'playing';

  function send(text: string) {
    const trimmed = text.trim();
    const isCommand = trimmed.startsWith('/');

    if (!isCommand && playing) {
      const result = catchmind.guess(ME.id, trimmed);
      if (result === 'correct') return;
      if (result === 'blocked') {
        post({ kind: 'private', text: '정답이 드러나는 말은 채팅에 쓸 수 없어요' });
        return;
      }
    }

    dispatch({ type: 'send', text, isHost });
    if (!isCommand && botJoined && !playing) {
      const reply = botReply(trimmed);
      if (reply) botSay(reply, 900 + Math.random() * 1500);
    }
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

  function saveSettings(settings: RoomSettings) {
    onUpdate({ ...room, ...settings });
    setDialog(null);
    post({ kind: 'system', text: '방장이 방 설정을 바꿨어요' });
  }

  function pickGame() {
    setDialog(null);
    catchmind.select();
  }

  const closeMenu = () => setMenuOpen(false);
  const actions = (
    <>
      {isHost && !game && (
        <button type="button" className="btn btn-ghost" onClick={() => (closeMenu(), setDialog('game'))}>
          게임
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
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onLeave({ members, music: { now: state.now, paused: state.paused, queue: state.queue } })}
      >
        나가기
      </button>
    </>
  );

  const badges = [
    !room.isPublic && '비공개',
    room.password !== null && '비밀번호',
  ].filter(Boolean);

  const header = (
    <header className="room-header">
      <h1 className="room-name sign">{room.name}</h1>
      <p className="room-info">
        {!isMobile && <>👑 {host.nickname} · </>}
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

  const stage = (
    <Stage
      now={state.now}
      paused={state.paused}
      game={game ? <CatchMindPanel controller={catchmind} isHost={isHost} nicknameOf={nicknameOf} /> : null}
    />
  );

  const cancel = (entryId: string) => dispatch({ type: 'cancel', entryId });
  const musicBar = (
    <MusicBar
      now={state.now}
      paused={state.paused}
      queue={state.queue}
      isHost={isHost}
      compact={isMobile}
      onRequest={() => setDialog('song')}
      onCancel={cancel}
    />
  );

  let chatPlaceholder: string | undefined;
  if (playing && view && !view.isRevealing) {
    if (view.isDrawer) chatPlaceholder = '그리는 중이에요. 제시어는 채팅에 쓸 수 없어요';
    else if (!view.word) chatPlaceholder = '정답을 입력해보세요';
  }
  const chat = <ChatPanel messages={state.messages} isHost={isHost} placeholder={chatPlaceholder} onSend={send} />;

  return (
    <div className={`room${isMobile ? ' is-mobile' : ''}`}>
      {isMobile ? (
        <>
          {header}
          {stage}
          {musicBar}
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
                <QueueList queue={state.queue} onCancel={cancel} />
                {isHost && <CommandHelp />}
              </div>
            )}
            {tab === 'members' && (
              <div className="tab-scroll">
                <MemberList members={members} />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="room-main">
            {header}
            {stage}
            {musicBar}
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
              {membersOpen && <MemberList members={members} />}
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
