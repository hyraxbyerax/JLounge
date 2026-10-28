import { useEffect, useRef, useState } from 'react';
import { loadYouTubeApi, PlayerState, type YouTubePlayer } from '../../../shared/youtube/youtubeApi';
import type { QueuedSong } from '../model/room';

type Props = {
  now: QueuedSong | null;
  paused: boolean;
  small?: boolean;
  /** 곡이 끝났을 때. 지금은 화면이 다음 곡으로 넘기고, 서버를 붙이면 서버가 넘긴다 */
  onEnded: (entryId: string) => void;
  /** 재생할 수 없는 영상일 때 */
  onError: (entryId: string) => void;
};

/** 자동 재생이 막혔는지 판단할 때까지 기다리는 시간 */
const AUTOPLAY_CHECK_MS = 1500;

/**
 * 라운지 TV: 곡을 신청하면 바로 재생된다.
 * 유튜브 약관상 플레이어는 화면에 보여야 하므로 숨기지 않는다.
 * 브라우저가 소리 있는 자동 재생을 막으면 [눌러서 같이 듣기]를 보여준다.
 */
export function LoungeTV({ now, paused, small = false, onEnded, onError }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const latest = useRef({ now, paused, onEnded, onError });
  useEffect(() => {
    latest.current = { now, paused, onEnded, onError };
  });

  // 플레이어는 한 번만 만들고, 곡이 바뀌면 영상만 바꿔 끼운다
  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !mountRef.current) return;
      const target = document.createElement('div');
      mountRef.current.replaceChildren(target);
      playerRef.current = new YT.Player(target, {
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e) => {
            if (e.data === PlayerState.PLAYING) setBlocked(false);
            const current = latest.current.now;
            if (e.data === PlayerState.ENDED && current) latest.current.onEnded(current.entryId);
          },
          onError: () => {
            const current = latest.current.now;
            if (current) latest.current.onError(current.entryId);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setReady(false);
    };
  }, []);

  const entryId = now?.entryId ?? null;
  const videoId = now?.videoId ?? null;
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    setBlocked(false);
    if (!videoId) {
      player.stopVideo();
      return;
    }
    player.loadVideoById(videoId);
    if (latest.current.paused) player.pauseVideo();
    const check = window.setTimeout(() => {
      const state = player.getPlayerState();
      if (!latest.current.paused && state !== PlayerState.PLAYING && state !== PlayerState.BUFFERING) setBlocked(true);
    }, AUTOPLAY_CHECK_MS);
    return () => window.clearTimeout(check);
  }, [ready, entryId, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || !entryId) return;
    if (paused) player.pauseVideo();
    else player.playVideo();
  }, [ready, paused, entryId]);

  function playByHand() {
    playerRef.current?.playVideo();
    setBlocked(false);
  }

  return (
    <figure className={`tv${small ? ' is-small' : ''}`}>
      <div className="tv-screen">
        <div ref={mountRef} className="tv-player" />
        {!now && <p className="tv-off">다음 곡이 없어요. 듣고 싶은 곡을 신청해보세요</p>}
        {now && blocked && (
          <button type="button" className="btn btn-primary tv-play" onClick={playByHand}>
            ▶ 눌러서 같이 듣기
          </button>
        )}
      </div>
      <figcaption className="tv-caption">라운지 TV{now && paused && ' · 일시정지'}</figcaption>
    </figure>
  );
}
