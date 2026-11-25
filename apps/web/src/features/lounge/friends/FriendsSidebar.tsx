import { VISIBILITY_LABEL, type FriendEntry, type PresenceVisibility } from '@lounge/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../../../shared/api/ApiError';
import { useMember } from '../../../shared/auth/useMember';
import { DirectChat } from './DirectChat';
import { friendsApi } from './friendsApi';
import { useFriends } from './useFriends';
import './friends.css';
import './friends-sidebar.css';

type Props = {
  /** docked: 넓은 화면 오른쪽에 늘 / drawer: 좁은 화면에서 밀려 나옴 / embedded: 캠퍼스 플래너 오른쪽 칸 */
  variant: 'docked' | 'drawer' | 'embedded';
  /** 지금 들어가 있는 방 (있으면 친구에게 [초대]) */
  currentRoomCode?: string | null;
  onInvite?: (friend: FriendEntry) => Promise<void>;
  /** 친구가 있는 방으로 따라가기 */
  onFollow?: (friend: FriendEntry) => void;
  /** 열려 있는 대화 (App 이 알아야 새 메시지 알림을 띄울지 정한다) */
  openChat: string | null;
  onOpenChat: (userId: string | null) => void;
  /** docked: 접기 / drawer: 닫기 */
  onClose?: () => void;
  /** 게스트일 때 [로그인] */
  onLogin?: () => void;
};

const statusOf = (f: FriendEntry) =>
  !f.presence.online
    ? '오프라인'
    : f.presence.room
      ? `${f.presence.room.name} · ${f.presence.activity ?? '접속 중'}`
      : '접속 중';

/**
 * 친구 현황판 (리그 오브 레전드 친구 메신저처럼 오른쪽에 늘 펼쳐 둔다).
 * 목록: 친구 추가, 받은 요청, 친구(접속 중 먼저)·안 읽은 수 / 친구를 누르면 그 자리에서 1:1 대화.
 */
export function FriendsSidebar({
  variant,
  currentRoomCode = null,
  onInvite,
  onFollow,
  openChat,
  onOpenChat,
  onClose,
  onLogin,
}: Props) {
  const member = useMember();
  const { overview, reload, clearUnread } = useFriends();
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [me, setMe] = useState<{ friendCode: string; presenceVisibility: PresenceVisibility } | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (member) friendsApi.me().then(setMe, () => undefined);
    else setMe(null);
  }, [member]);

  // 목록 ↔ 대화를 오가면 지난 안내와 메뉴는 지운다
  useEffect(() => {
    setMessage(null);
    setMenuOpen(false);
  }, [openChat]);

  const say = (text: string, error = false) => setMessage({ text, error });
  const run = (task: Promise<{ message?: string } | void>, done?: string) =>
    task.then(
      (res) => {
        say((res && 'message' in res && res.message) || done || '바꿨어요');
        reload();
      },
      (err: unknown) => say(errorMessage(err), true),
    );

  const shell = (body: ReactNode, title = '친구') => (
    <aside className={`friends-side is-${variant}`} aria-label="친구 현황판">
      <header className="fs-head">
        <h2 className="fs-title">{title}</h2>
        {onClose && (
          <button
            type="button"
            className="fs-close"
            aria-label={variant === 'drawer' ? '친구 창 닫기' : '친구 현황판 접기'}
            onClick={onClose}
          >
            {variant === 'drawer' ? '✕' : '»'}
          </button>
        )}
      </header>
      {body}
    </aside>
  );

  if (!member) {
    return shell(
      <div className="fs-guest">
        <p>로그인하면 친구를 추가하고, 친구가 어디서 노는지 보고, 1:1로 대화할 수 있어요.</p>
        {onLogin && (
          <button type="button" className="btn btn-primary" onClick={onLogin}>
            로그인
          </button>
        )}
      </div>,
    );
  }

  const friends = overview?.friends ?? [];
  const chatFriend = openChat ? friends.find((f) => f.userId === openChat) : undefined;

  /* 1:1 대화 화면 */
  if (chatFriend) {
    const here = currentRoomCode !== null && chatFriend.presence.room?.code === currentRoomCode;
    return (
      <aside className={`friends-side is-${variant}`} aria-label={`${chatFriend.nickname}님과 대화`}>
        <header className="fs-head fs-chat-head">
          <button type="button" className="fs-back" aria-label="친구 목록으로" onClick={() => onOpenChat(null)}>
            ‹
          </button>
          <span className={`fs-dot${chatFriend.presence.online ? ' is-online' : ''}`} aria-hidden="true" />
          <span className="fs-chat-who">
            <span className="fs-name">{chatFriend.nickname}</span>
            <span className="fs-status">{statusOf(chatFriend)}</span>
          </span>
          <span className="fs-menu-wrap">
            <button
              type="button"
              className="fs-close"
              aria-label="친구 메뉴"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ⋯
            </button>
            {menuOpen && (
              <span className="fs-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="btn-text"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenChat(null);
                    void run(friendsApi.remove(chatFriend.userId), `${chatFriend.nickname}님과 친구를 끊었어요`);
                  }}
                >
                  친구 끊기
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="btn-text fs-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenChat(null);
                    void run(friendsApi.block(chatFriend.userId));
                  }}
                >
                  차단
                </button>
              </span>
            )}
          </span>
        </header>
        {(onFollow || onInvite) && (
          <div className="fs-chat-actions">
            {onFollow && chatFriend.presence.room && !here && (
              <button type="button" className="btn btn-ghost" onClick={() => onFollow(chatFriend)}>
                따라가기
              </button>
            )}
            {onInvite && currentRoomCode && chatFriend.presence.online && !here && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  onInvite(chatFriend).then(
                    () => say(`${chatFriend.nickname}님을 초대했어요`),
                    (err: unknown) => say(errorMessage(err), true),
                  )
                }
              >
                이 방에 초대
              </button>
            )}
          </div>
        )}
        {message && (
          <p className={`fs-note${message.error ? ' is-error' : ''}`} role="status">
            {message.text}
          </p>
        )}
        <DirectChat friend={chatFriend} meId={member.userId} onRead={() => clearUnread(chatFriend.userId)} />
      </aside>
    );
  }

  /* 친구 목록 */
  function submit(e: FormEvent) {
    e.preventDefault();
    const value = target.trim();
    if (!value) return;
    // 8자리 영문·숫자면 친구 코드, 아니면 닉네임으로 찾는다
    const byCode = /^[A-Za-z0-9]{8}$/.test(value);
    void run(friendsApi.request(byCode ? { friendCode: value } : { nickname: value })).then(() => setTarget(''));
  }

  const online = friends.filter((f) => f.presence.online);
  const offline = friends.filter((f) => !f.presence.online);
  const row = (f: FriendEntry) => (
    <li key={f.userId}>
      <button type="button" className="fs-friend" onClick={() => onOpenChat(f.userId)}>
        <span className={`fs-dot${f.presence.online ? ' is-online' : ''}`} aria-hidden="true" />
        <span className="fs-friend-text">
          <span className="fs-name">{f.nickname}</span>
          <span className="fs-status">{statusOf(f)}</span>
        </span>
        {f.unread > 0 && (
          <span className="fs-unread" aria-label={`안 읽은 메시지 ${f.unread}개`}>
            {f.unread > 99 ? '99+' : f.unread}
          </span>
        )}
      </button>
    </li>
  );

  return shell(
    <div className="fs-body">
      <form className="fs-add" onSubmit={submit}>
        <label className="sr-only" htmlFor={`fs-add-${variant}`}>
          친구 닉네임 또는 친구 코드
        </label>
        <input
          id={`fs-add-${variant}`}
          className="input fs-add-input"
          placeholder="닉네임 또는 친구 코드"
          maxLength={20}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" aria-label="친구 추가">
          추가
        </button>
      </form>
      {message && (
        <p className={`fs-note${message.error ? ' is-error' : ''}`} role="status">
          {message.text}
        </p>
      )}

      {overview && overview.incoming.length > 0 && (
        <section className="fs-section" aria-label="받은 친구 요청">
          <h3 className="fs-heading">받은 요청 {overview.incoming.length}</h3>
          <ul className="fs-list">
            {overview.incoming.map((u) => (
              <li key={u.userId} className="fs-request">
                <span className="fs-name">{u.nickname}</span>
                <button
                  type="button"
                  className="btn btn-primary fs-mini"
                  onClick={() => run(friendsApi.accept(u.userId))}
                >
                  수락
                </button>
                <button
                  type="button"
                  className="btn-text"
                  onClick={() => run(friendsApi.remove(u.userId), '요청을 거절했어요')}
                >
                  거절
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="fs-section" aria-label="접속 중인 친구">
        <h3 className="fs-heading">
          접속 중 {online.length}
          <span className="fs-heading-sub"> / 친구 {friends.length}</span>
        </h3>
        {!overview ? (
          <p className="fs-empty">불러오는 중이에요…</p>
        ) : friends.length === 0 ? (
          <p className="fs-empty">아직 친구가 없어요. 위에 닉네임이나 친구 코드를 넣어 추가해보세요</p>
        ) : online.length === 0 ? (
          <p className="fs-empty">지금 접속한 친구가 없어요</p>
        ) : (
          <ul className="fs-list">{online.map(row)}</ul>
        )}
      </section>

      {offline.length > 0 && (
        <section className="fs-section" aria-label="오프라인 친구">
          <h3 className="fs-heading">오프라인 {offline.length}</h3>
          <ul className="fs-list is-offline">{offline.map(row)}</ul>
        </section>
      )}

      <section className="fs-section fs-more">
        <button
          type="button"
          className="fs-more-toggle"
          aria-expanded={showMore}
          onClick={() => setShowMore((v) => !v)}
        >
          내 친구 코드·설정 {showMore ? '▴' : '▾'}
        </button>
        {showMore && (
          <div className="fs-more-body">
            <div className="fs-code-row">
              <span className="fs-heading">내 친구 코드</span>
              <code className="friend-code">{me?.friendCode ?? '…'}</code>
              <button
                type="button"
                className="btn-text"
                disabled={!me}
                onClick={async () => {
                  if (!me) return;
                  try {
                    await navigator.clipboard.writeText(me.friendCode);
                    say('친구 코드를 복사했어요');
                  } catch {
                    say(`친구 코드: ${me.friendCode}`);
                  }
                }}
              >
                복사
              </button>
            </div>
            <label className="fs-heading" htmlFor={`fs-vis-${variant}`}>
              친구에게 보이는 내 상태
            </label>
            <select
              id={`fs-vis-${variant}`}
              className="input"
              value={me?.presenceVisibility ?? 'all'}
              disabled={!me}
              onChange={(e) => {
                const value = e.target.value as PresenceVisibility;
                friendsApi.setVisibility(value).then(
                  (next) => {
                    setMe(next);
                    say('공개 범위를 바꿨어요');
                  },
                  (err: unknown) => say(errorMessage(err), true),
                );
              }}
            >
              {(Object.keys(VISIBILITY_LABEL) as PresenceVisibility[]).map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_LABEL[v]}
                </option>
              ))}
            </select>
            {overview && overview.outgoing.length > 0 && (
              <>
                <h3 className="fs-heading">보낸 요청</h3>
                <ul className="fs-list">
                  {overview.outgoing.map((u) => (
                    <li key={u.userId} className="fs-request">
                      <span className="fs-name">{u.nickname}</span>
                      <span className="fs-status">기다리는 중</span>
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => run(friendsApi.remove(u.userId), '요청을 취소했어요')}
                      >
                        취소
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {overview && overview.blocked.length > 0 && (
              <>
                <h3 className="fs-heading">차단</h3>
                <ul className="fs-list">
                  {overview.blocked.map((u) => (
                    <li key={u.userId} className="fs-request">
                      <span className="fs-name">{u.nickname}</span>
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => run(friendsApi.unblock(u.userId), '차단을 풀었어요')}
                      >
                        차단 풀기
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>
    </div>,
  );
}

/** 접힌 현황판: 오른쪽 끝의 얇은 띠 (접속 중인 친구 수와 안 읽은 메시지 수) */
export function FriendsRail({ onOpen }: { onOpen: () => void }) {
  const member = useMember();
  const { overview } = useFriends();
  const online = overview?.friends.filter((f) => f.presence.online).length ?? 0;
  const unread = overview?.friends.reduce((sum, f) => sum + f.unread, 0) ?? 0;
  return (
    <aside className="friends-rail" aria-label="친구 현황판 (접힘)">
      <button type="button" className="fs-rail-btn" onClick={onOpen} aria-label="친구 현황판 펼치기">
        <span aria-hidden="true">«</span>
        <span className="fs-rail-label">친구</span>
        {member && <span className="fs-rail-count">{online}</span>}
        {unread > 0 && (
          <span className="fs-unread" aria-label={`안 읽은 메시지 ${unread}개`}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </aside>
  );
}
