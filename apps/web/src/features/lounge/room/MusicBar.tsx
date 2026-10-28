import { useState } from 'react';
import type { QueuedSong } from '../model/room';
import { CommandHelp, QueueList } from './QueueList';

type Props = {
  now: QueuedSong | null;
  paused: boolean;
  queue: QueuedSong[];
  isHost: boolean;
  /** 휴대폰: 현재 곡과 [신청]만 */
  compact?: boolean;
  onRequest: () => void;
  onCancel: (entryId: string) => void;
};

type Popover = 'queue' | 'help' | null;

export function MusicBar({ now, paused, queue, isHost, compact = false, onRequest, onCancel }: Props) {
  const [popover, setPopover] = useState<Popover>(null);
  const toggle = (next: Exclude<Popover, null>) => setPopover((cur) => (cur === next ? null : next));

  return (
    <section className="music-bar" aria-label="음악">
      <div key={now?.entryId ?? 'none'} className="music-now">
        <span className="music-note" aria-hidden="true">
          ♪
        </span>
        {now ? (
          <>
            {!compact && <span className="music-label">{paused ? '일시정지' : '지금 재생 중'}</span>}
            <span className="music-title">{now.title}</span>
            <span className="music-by">· {now.requesterNickname}</span>
          </>
        ) : (
          <span className="music-by">재생 중인 곡이 없어요</span>
        )}
      </div>

      {!compact && (
        <button
          type="button"
          className="btn btn-ghost"
          aria-expanded={popover === 'queue'}
          onClick={() => toggle('queue')}
        >
          대기 {queue.length}곡 ▾
        </button>
      )}
      {!compact && isHost && (
        <button
          type="button"
          className="icon-btn"
          aria-label="방장 명령어 도움말"
          aria-expanded={popover === 'help'}
          onClick={() => toggle('help')}
        >
          ?
        </button>
      )}
      <button type="button" className="btn btn-primary" onClick={onRequest}>
        {compact ? '신청' : '곡 신청'}
      </button>

      {popover && (
        <div className="music-popover">
          {popover === 'queue' ? <QueueList queue={queue} onCancel={onCancel} /> : <CommandHelp />}
        </div>
      )}
    </section>
  );
}
