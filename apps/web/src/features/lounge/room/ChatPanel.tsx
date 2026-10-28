import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ME, type ChatMessage } from '../model/room';
import { chatCooldownLeft, countsAsChat, HOST_COMMANDS } from '../model/roomState';

type Props = {
  messages: ChatMessage[];
  isHost: boolean;
  /** 게임 중 안내처럼 상황에 맞는 입력창 안내 */
  placeholder?: string;
  onSend: (text: string) => void;
};

const MAX_LENGTH = 200;

const timeFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });

export function ChatPanel({ messages, isHost, placeholder, onSend }: Props) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const listboxId = useId();
  // 채팅을 보내면 3초 동안 다음 채팅을 못 보낸다. 입력은 미리 해둘 수 있다
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cooldownMs = chatCooldownLeft(lastSentAt, now);
  const coolingDown = cooldownMs > 0;

  useEffect(() => {
    if (lastSentAt === null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (chatCooldownLeft(lastSentAt, t) === 0) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [lastSentAt]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // 방장이 "/"로 시작하면 명령어 자동완성 (인자 입력 전까지만)
  const suggestions =
    isHost && text.startsWith('/') && !text.includes(' ') ? HOST_COMMANDS.filter((c) => c.name.startsWith(text)) : [];
  const activeIndex = Math.min(active, suggestions.length - 1);

  function complete(index: number) {
    const command = suggestions[index];
    if (!command) return;
    setText(command.usage.includes('{') ? `${command.name} ` : command.name);
    setActive(0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + suggestions.length) % suggestions.length);
    } else if (e.key === 'Tab' || (e.key === 'Enter' && text !== suggestions[activeIndex]?.name)) {
      e.preventDefault();
      complete(activeIndex);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const isChat = countsAsChat(text);
    if (isChat && coolingDown) return;
    onSend(text);
    setText('');
    if (isChat) {
      const t = Date.now();
      setLastSentAt(t);
      setNow(t);
    }
  }

  const blocked = coolingDown && countsAsChat(text);

  return (
    <section className="chat" aria-label="채팅">
      <ol ref={listRef} className="chat-list" aria-live="polite">
        {messages.map((m) => (
          <MessageItem key={m.id} message={m} />
        ))}
      </ol>

      <form className="chat-form" onSubmit={submit}>
        {suggestions.length > 0 && (
          <ul id={listboxId} className="suggest" role="listbox" aria-label="방장 명령어">
            {suggestions.map((c, i) => (
              <li
                key={c.name}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className="suggest-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  complete(i);
                }}
              >
                <code>{c.usage}</code>
                <span className="muted">{c.description}</span>
              </li>
            ))}
          </ul>
        )}
        <label className="sr-only" htmlFor="chat-input">
          메시지
        </label>
        <input
          id="chat-input"
          className="input"
          placeholder={placeholder ?? (isHost ? '메시지 입력 ( / 로 명령어)' : '메시지 입력')}
          autoComplete="off"
          maxLength={MAX_LENGTH}
          value={text}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={suggestions.length > 0 ? `${listboxId}-${activeIndex}` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="btn btn-primary chat-send"
          disabled={blocked}
          aria-label={coolingDown ? `${Math.ceil(cooldownMs / 1000)}초 뒤에 보낼 수 있어요` : '보내기'}
        >
          {coolingDown ? `${Math.ceil(cooldownMs / 1000)}초` : '보내기'}
        </button>
      </form>
    </section>
  );
}

function MessageItem({ message }: { message: ChatMessage }) {
  if (message.kind === 'system') {
    return <li className="msg-system">{message.text}</li>;
  }
  if (message.kind === 'private') {
    return (
      <li className="msg-private">
        <span className="msg-private-label">나에게만 보여요</span> {message.text}
      </li>
    );
  }
  const mine = message.userId === ME.id;
  return (
    <li className={`msg${mine ? ' is-mine' : ''}`}>
      {!mine && <span className="msg-nick">{message.nickname}</span>}
      <span className="msg-row">
        <span className="bubble">{message.text}</span>
        <time className="msg-time" dateTime={message.sentAt}>
          {timeFormat.format(new Date(message.sentAt))}
        </time>
      </span>
    </li>
  );
}
