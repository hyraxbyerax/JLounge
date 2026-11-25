import type { DirectMessage, FriendEntry } from '@lounge/shared';
import { DM_PAGE_SIZE } from '@lounge/shared';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage } from '../../../shared/api/ApiError';
import { connect } from '../../../shared/realtime/connection';
import { friendsApi } from './friendsApi';

type Props = {
  friend: FriendEntry;
  meId: string;
  /** 이 대화의 안 읽은 수를 0으로 (서버에도 읽음 표시) */
  onRead: () => void;
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });

/** 친구와 1:1 대화. 열면 최근 대화를 불러오고 읽음 표시, 새 메시지는 실시간으로 */
export function DirectChat({ friend, meId, onRead }: Props) {
  const [messages, setMessages] = useState<DirectMessage[] | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);
  const friendId = friend.userId;

  // 처음 열 때: 최근 대화 + 읽음
  useEffect(() => {
    let alive = true;
    setMessages(null);
    friendsApi.messages(friendId).then(
      (list) => {
        if (!alive) return;
        setMessages(list);
        setHasOlder(list.length === DM_PAGE_SIZE);
        stickToBottom.current = true;
      },
      (err: unknown) => alive && setError(errorMessage(err)),
    );
    void friendsApi.markRead(friendId).catch(() => undefined);
    onRead();
    return () => {
      alive = false;
    };
    // onRead 는 부모가 매번 새로 만들 수 있어 친구가 바뀔 때만 다시 한다
  }, [friendId]);

  // 새 메시지 (이 친구와의 것만). 받은 것이면 바로 읽음
  useEffect(() => {
    // 연결을 기다리는 사이에 대화를 닫았으면 듣기를 걸지 않는다 (안 그러면 지난 대화의 듣기가 남는다)
    let stopped = false;
    let detach = () => {};
    void connect().then((socket) => {
      if (stopped) return;
      const onMessage = (m: DirectMessage) => {
        const mine = m.from === meId && m.to === friendId;
        const theirs = m.from === friendId && m.to === meId;
        if (!mine && !theirs) return;
        const list = listRef.current;
        stickToBottom.current = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        setMessages((cur) => (cur && !cur.some((x) => x.id === m.id) ? [...cur, m] : cur));
        if (theirs) {
          void friendsApi.markRead(friendId).catch(() => undefined);
          onRead();
        }
      };
      socket.on('dm:message', onMessage);
      detach = () => socket.off('dm:message', onMessage);
    });
    return () => {
      stopped = true;
      detach();
    };
  }, [friendId, meId]);

  // 맨 아래를 보고 있었으면 새 메시지가 와도 맨 아래로
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  async function loadOlder() {
    if (!messages || messages.length === 0) return;
    const list = listRef.current;
    const before = list ? list.scrollHeight - list.scrollTop : 0;
    const older = await friendsApi.messages(friendId, messages[0]!.id);
    stickToBottom.current = false;
    setHasOlder(older.length === DM_PAGE_SIZE);
    setMessages((cur) => [...older, ...(cur ?? [])]);
    // 보던 위치 유지
    requestAnimationFrame(() => {
      if (list) list.scrollTop = list.scrollHeight - before;
    });
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setError(null);
    try {
      const sent = await friendsApi.sendMessage(friendId, value);
      setText('');
      stickToBottom.current = true;
      setMessages((cur) => (cur && !cur.some((x) => x.id === sent.id) ? [...cur, sent] : cur));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="dm">
      <ol ref={listRef} className="dm-list" aria-label={`${friend.nickname}님과 대화`} aria-live="polite">
        {hasOlder && (
          <li className="dm-older">
            <button type="button" className="btn-text" onClick={() => void loadOlder()}>
              이전 대화 더 보기
            </button>
          </li>
        )}
        {messages === null ? (
          <li className="dm-empty">불러오는 중이에요…</li>
        ) : messages.length === 0 ? (
          <li className="dm-empty">아직 나눈 대화가 없어요. 먼저 인사해보세요!</li>
        ) : (
          messages.map((m) => (
            <li key={m.id} className={`dm-msg${m.from === meId ? ' is-mine' : ''}`}>
              <span className="dm-bubble">{m.text}</span>
              <time className="dm-time" dateTime={m.at}>
                {timeOf(m.at)}
              </time>
            </li>
          ))
        )}
      </ol>
      {error && (
        <p className="form-error dm-error" role="alert">
          {error}
        </p>
      )}
      <form className="dm-form" onSubmit={(e) => void send(e)}>
        <label className="sr-only" htmlFor={`dm-input-${friendId}`}>
          {friend.nickname}님에게 메시지
        </label>
        <input
          id={`dm-input-${friendId}`}
          className="input dm-input"
          placeholder="메시지 입력"
          maxLength={500}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
          보내기
        </button>
      </form>
    </div>
  );
}
