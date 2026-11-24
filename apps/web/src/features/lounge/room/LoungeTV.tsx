import { useEffect, useRef, useState } from 'react';
import { loadYouTubeApi, PlayerState, type YouTubePlayer } from '../../../shared/youtube/youtubeApi';
import type { QueuedSong } from '../model/room';

type Props = {
  now: QueuedSong | null;
  paused: boolean;
  /** 게임 중: 영상은 화면 밖으로 빼고 소리만 계속 낸다 (팀 결정, 유튜브 약관과 다름 — docs/lounge-spec.md 7장) */
  hidden?: boolean;
  /** 내 소리만 끄기·음량 (다른 사람에게는 영향 없음) */
  muted: boolean;
  volume: number;
  onMutedChange: (muted: boolean) => void;
  onVolumeChange: (volume: number) => void;
  /** 방장이면 영상 위에 일시정지·재생 버튼도 (모두에게 적용) */
  isHost: boolean;
  onTogglePause: () => void;
  /** 플레이어가 준비되면 넘겨준다 (음악 바가 재생 위치를 읽는다) */
  onPlayer: (player: YouTubePlayer | null) => void;
  /** 브라우저가 소리 있는 자동 재생을 막았는지 (음악 바에 [같이 듣기]를 띄운다) */
  onBlockedChange: (blocked: boolean) => void;
  /** 곡이 끝났을 때. 지금은 화면이 다음 곡으로 넘기고, 서버를 붙이면 서버가 넘긴다 */
  onEnded: (entryId: string) => void;
  /** 재생할 수 없는 영상일 때 */
  onError: (entryId: string) => void;
};

/** 자동 재생이 막혔는지 판단할 때까지 기다리는 시간 */
const AUTOPLAY_CHECK_MS = 1500;

/**
 * 라운지 TV: 곡을 신청하면 바로 재생된다.
 * 방 안 모두가 같은 곡을 같이 들으므로, 영상 안에서 각자 멈추거나 넘기지 못하게
 * 유튜브 자체 버튼·키보드를 끄고 영상 클릭을 막는다 (팀 결정 — docs/lounge-spec.md 7장).
 * 영상은 고정된 크기로만 보고(전체 화면 없음), 영상 위에서는 우리 버튼으로 내 음량만 조절한다.
 * 방장은 여기에 일시정지·재생 버튼이 더 있다.
 */
export function LoungeTV({
  now,
  paused,
  hidden = false,
  muted,
  volume,
  onMutedChange,
  onVolumeChange,
  isHost,
  onTogglePause,
  onPlayer,
  onBlockedChange,
  onEnded,
  onError,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const blockedRef = useRef(onBlockedChange);
  useEffect(() => {
    blockedRef.current = onBlockedChange;
  });
  useEffect(() => {
    blockedRef.current(blocked);
  }, [blocked]);

  const latest = useRef({ now, paused, onPlayer, onEnded, onError });
  useEffect(() => {
    latest.current = { now, paused, onPlayer, onEnded, onError };
  });

  // 플레이어는 한 번만 만들고, 곡이 바뀌면 영상만 바꿔 끼운다
  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !mountRef.current) return;
      const target = document.createElement('div');
      mountRef.current.replaceChildren(target);
      const player = new YT.Player(target, {
        width: '100%',
        height: '100%',
        // controls·disablekb·fs: 유튜브 자체 버튼·키보드·전체 화면 버튼을 끈다
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3 },
        events: {
          onReady: () => {
            setReady(true);
            latest.current.onPlayer(player);
          },
          onStateChange: (e) => {
            if (e.data === PlayerState.PLAYING) setBlocked(false);
            const current = latest.current.now;
            if (e.data === PlayerState.ENDED && current) latest.current.onEnded(current.entryId);
          },
          onError: (e) => {
            const current = latest.current.now;
            // 원인 찾기용 (2: 잘못된 영상 ID, 5: 브라우저 재생 오류, 100: 없는 영상, 101·150: 퍼가기 금지, 153: 브라우저가 주소 정보(Referer)를 안 보냄)
            console.warn(`유튜브 재생 오류 ${e.data}`, current?.videoId);
            if (current) latest.current.onError(current.entryId);
          },
        },
      });
      playerRef.current = player;
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      latest.current.onPlayer(null);
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

  // 곡이 바뀌어도 내 음량·소리 끔 설정을 유지한다
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    player.setVolume(volume);
    if (muted) player.mute();
    else player.unMute();
  }, [ready, muted, volume, entryId]);

  function playByHand() {
    playerRef.current?.playVideo();
    setBlocked(false);
  }

  return (
    <figure className="tv" aria-hidden={hidden || undefined}>
      <div className="tv-screen">
        <div ref={mountRef} className="tv-player" />
        {/* 영상 위의 모든 반응(마우스 올리기·클릭)을 막는 투명한 덮개 */}
        <div className="tv-shield" aria-hidden="true" />
        {!now && <p className="tv-off">다음 곡이 없어요. 듣고 싶은 곡을 신청해보세요</p>}
        {/* 멈췄을 때 유튜브가 영상 안에 띄우는 화면(큰 ❚❚·제목·추천 영상)을 우리 화면으로 덮는다 */}
        {now && paused && (
          <div className="tv-paused">
            <span className="tv-paused-icon" aria-hidden="true">
              ❚❚
            </span>
            <p className="tv-paused-text">
              {isHost ? '일시정지 중이에요. ▶를 누르면 다시 재생해요' : '방장이 음악을 잠시 멈췄어요'}
            </p>
          </div>
        )}
        {now && blocked && (
          <button type="button" className="btn btn-primary tv-play" onClick={playByHand}>
            ▶ 눌러서 같이 듣기
          </button>
        )}
        {now && !hidden && (
          <div className="tv-overlay">
            {isHost && (
              <button
                type="button"
                className="icon-btn"
                aria-label={paused ? '다시 재생' : '일시정지'}
                title={paused ? '다시 재생' : '일시정지'}
                onClick={onTogglePause}
              >
                {paused ? '▶' : '❚❚'}
              </button>
            )}
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
            <input
              className="volume-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={muted ? 0 : volume}
              aria-label="내 음량"
              onChange={(e) => onVolumeChange(Number(e.target.value))}
            />
          </div>
        )}
      </div>
    </figure>
  );
}
