import { useEffect, useState, type CSSProperties } from 'react';
import type { YouTubePlayer } from '../../../shared/youtube/youtubeApi';
import type { QueuedSong } from '../model/room';
import { CommandHelp, QueueList } from './QueueList';

export type HostMusicCommand = '/pause' | '/resume' | '/skip';

type Props = {
  now: QueuedSong | null;
  paused: boolean;
  queue: QueuedSong[];
  /** 내가 신청한 곡에만 [취소] */
  meId: string;
  isHost: boolean;
  /**
   * remote: 평소, 라운지 TV 아래에 붙는 리모컨 (곡 정보·버튼 / 재생 위치)
   * mini: 게임 중(영상 숨김), 헤더 옆 한 줄 위젯 (음량 막대·도움말 없이, 진행선은 아래 테두리에)
   */
  variant?: 'remote' | 'mini';
  /** 휴대폰: 음량 막대·대기큐 버튼을 줄인다 */
  compact?: boolean;
  player: YouTubePlayer | null;
  /** 브라우저가 자동 재생을 막아 소리가 안 나는 중 */
  blocked: boolean;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  /** 방장 버튼 (모두에게 적용) */
  onHostCommand: (command: HostMusicCommand) => void;
  onRequest: () => void;
  onCancel: (entryId: string) => void;
};

type Popover = 'queue' | 'help' | null;

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 플레이어에서 재생 위치를 주기적으로 읽는다 */
function usePosition(player: YouTubePlayer | null, entryId: string | null): number {
  const [position, setPosition] = useState(0);
  useEffect(() => {
    if (!player || !entryId) return;
    const read = () => setPosition(player.getCurrentTime() || 0);
    read();
    const id = window.setInterval(read, 500);
    return () => window.clearInterval(id);
  }, [player, entryId]);
  return entryId ? position : 0;
}

/**
 * 방의 음악 조작.
 * - 평소(remote): 라운지 TV 아래 리모컨 (곡 정보·버튼 / 재생 위치)
 * - 게임 중(mini): 헤더 옆 한 줄 위젯. 영상과 동시에 나오지 않는다
 * 모두: 내 소리 끄기·음량, 대기큐, 곡 신청 / 방장: 재생·일시정지·다음 곡 (모두에게 적용)
 */
export function MusicBar({
  now,
  paused,
  queue,
  meId,
  isHost,
  variant = 'remote',
  compact = false,
  player,
  blocked,
  muted,
  onMutedChange,
  onHostCommand,
  onRequest,
  onCancel,
}: Props) {
  const [popover, setPopover] = useState<Popover>(null);
  const toggle = (next: Exclude<Popover, null>) => setPopover((cur) => (cur === next ? null : next));
  const mini = variant === 'mini';
  const small = mini || compact;

  const playing = usePosition(player, now?.entryId ?? null);
  // 방장이 진행 막대를 끄는 동안의 위치. 손을 떼면 그 위치로 옮긴다
  const [dragging, setDragging] = useState<number | null>(null);
  const position = dragging ?? playing;
  const duration = now ? now.durationSec || player?.getDuration() || 0 : 0;
  const percent = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const timeText = `${formatTime(position)} / ${formatTime(duration)}`;

  // 재생 위치 옮기기 (방장만). 지금은 내 화면의 플레이어만 옮기고, 서버를 붙이면 모두에게 같은 위치로 맞춘다
  function seekTo(sec: number) {
    player?.seekTo(sec, true);
    setDragging(null);
  }
  const commitDrag = () => {
    if (dragging !== null) seekTo(dragging);
  };

  const progress = now && (
    <div
      className="progress-track"
      role="progressbar"
      aria-label="재생 위치"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={timeText}
    >
      <span className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );

  return (
    <section className={`music-bar${mini ? ' is-mini' : ''}`} aria-label="음악">
      <div className="music-row">
        <div key={now?.entryId ?? 'none'} className="music-now" title={now?.title}>
          <span className="music-note" aria-hidden="true">
            ♪
          </span>
          {now ? (
            <>
              {!small && <span className="music-label">{paused ? '일시정지' : '지금 재생 중'}</span>}
              <span className="music-title">{now.title}</span>
              {!mini && <span className="music-by">· {now.requesterNickname}</span>}
            </>
          ) : (
            <span className="music-by">{mini ? '음악 없음' : '재생 중인 곡이 없어요'}</span>
          )}
        </div>

        <div className="music-controls">
          {now && blocked && (
            <button type="button" className="btn btn-primary music-unblock" onClick={() => player?.playVideo()}>
              ▶ 같이 듣기
            </button>
          )}
          {now && isHost && (
            <div className="music-group" role="group" aria-label="방장 음악 조작">
              {/* 평소에는 일시정지·음량이 영상 위에 있으므로 리모컨에는 두지 않는다 (기능 하나당 버튼 하나) */}
              {mini && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={paused ? '다시 재생' : '일시정지'}
                  title={paused ? '다시 재생' : '일시정지'}
                  onClick={() => onHostCommand(paused ? '/resume' : '/pause')}
                >
                  {paused ? '▶' : '❚❚'}
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label="다음 곡"
                title="다음 곡"
                onClick={() => onHostCommand('/skip')}
              >
                ▶▶
              </button>
            </div>
          )}

          {mini && (
            <div className="music-group">
              <button
                type="button"
                className="icon-btn"
                aria-label={muted ? '내 소리 켜기' : '내 소리 끄기'}
                aria-pressed={muted}
                title={muted ? '내 소리 켜기' : '내 소리 끄기'}
                onClick={() => onMutedChange(!muted)}
              >
                {muted ? '🔇' : '🔊'}
              </button>
            </div>
          )}

          {!compact && (
            <button
              type="button"
              className="btn btn-ghost"
              aria-expanded={popover === 'queue'}
              aria-label={`대기 ${queue.length}곡`}
              onClick={() => toggle('queue')}
            >
              {mini ? `대기 ${queue.length}` : `대기 ${queue.length}곡 ▾`}
            </button>
          )}
          {!small && isHost && (
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
            {small ? '신청' : '곡 신청'}
          </button>
        </div>
      </div>

      {now &&
        (mini ? (
          <div className="music-progress-line" title={timeText}>
            {progress}
          </div>
        ) : (
          <div className="music-progress">
            {isHost && duration > 0 ? (
              <input
                className="seek-slider"
                type="range"
                min={0}
                max={Math.floor(duration)}
                step={1}
                value={Math.floor(position)}
                aria-label="재생 위치 (방장)"
                aria-valuetext={timeText}
                style={{ '--seek': `${percent}%` } as CSSProperties}
                onChange={(e) => setDragging(Number(e.target.value))}
                onPointerUp={commitDrag}
                onKeyUp={commitDrag}
                onBlur={commitDrag}
              />
            ) : (
              progress
            )}
            <span className="progress-time">{timeText}</span>
          </div>
        ))}

      {popover && (
        <div className="music-popover">
          {popover === 'queue' ? <QueueList queue={queue} meId={meId} onCancel={onCancel} /> : <CommandHelp />}
        </div>
      )}
    </section>
  );
}
