import { MUSIC_DRIFT_TOLERANCE_MS, positionOf, type MusicNow } from '@lounge/shared';
import { useEffect, useRef, useState } from 'react';
import { serverNow } from '../../../shared/realtime/connection';
import { loadYouTubeApi, PlayerState, type YouTubePlayer } from '../../../shared/youtube/youtubeApi';

type Props = {
  /** 서버가 정한 지금 곡 (재생 위치는 서버 시각 기준으로 계산한다) */
  now: MusicNow | null;
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
  /** 재생할 수 없는 영상일 때 (서버가 지금 곡이 아직 그 곡이면 다음 곡으로 넘긴다) */
  onError: (entryId: string) => void;
};

/** 자동 재생이 막혔는지 판단할 때까지 기다리는 시간 */
const AUTOPLAY_CHECK_MS = 1500;
/** 다른 사람과 위치가 어긋났는지 확인하는 주기 (광고 등으로 밀린 경우) */
const DRIFT_CHECK_MS = 3000;

/**
 * 라운지 TV: 방 안 모두가 같은 곡을 같은 위치에서 듣는다.
 * 위치 = 서버 지금 시각 − 곡 시작 시각 (일시정지 중에는 멈춘 위치). 곡 넘김은 서버가 한다.
 * 모두가 같은 위치를 들어야 하므로 유튜브 자체 버튼·키보드를 끄고 영상 클릭을 막는다 (팀 결정 — 명세 7장).
 * 영상은 고정된 크기로만 보고(전체 화면 없음), 영상 위에서는 우리 버튼으로 내 음량만 조절한다.
 * 방장은 여기에 일시정지·재생 버튼이 더 있다.
 */
export function LoungeTV({
  now,
  hidden = false,
  muted,
  volume,
  onMutedChange,
  onVolumeChange,
  isHost,
  onTogglePause,
  onPlayer,
  onBlockedChange,
  onError,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const paused = now?.state === 'paused';

  const blockedRef = useRef(onBlockedChange);
  useEffect(() => {
    blockedRef.current = onBlockedChange;
  });
  useEffect(() => {
    blockedRef.current(blocked);
  }, [blocked]);

  const latest = useRef({ now, onPlayer, onError });
  useEffect(() => {
    latest.current = { now, onPlayer, onError };
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

  /** 서버 기준으로 지금 있어야 할 위치(초) */
  const expectedSec = () => {
    const current = latest.current.now;
    return current ? positionOf(current, serverNow()) / 1000 : 0;
  };

  // 곡이 바뀌면 그 곡을 "지금 있어야 할 위치"부터 불러온다 (나중에 들어온 사람도 같은 위치)
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
    player.loadVideoById(videoId, expectedSec());
    if (latest.current.now?.state === 'paused') player.pauseVideo();
    const check = window.setTimeout(() => {
      const state = player.getPlayerState();
      const isPaused = latest.current.now?.state === 'paused';
      if (!isPaused && state !== PlayerState.PLAYING && state !== PlayerState.BUFFERING) setBlocked(true);
    }, AUTOPLAY_CHECK_MS);
    return () => window.clearTimeout(check);
  }, [ready, entryId, videoId]);

  // 방장의 일시정지·재개·위치 옮김: 같은 곡 안에서 상태가 바뀌면 서버 위치로 맞춘다
  const startedAt = now?.startedAt ?? null;
  const positionMs = now?.positionMs ?? null;
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || !entryId) return;
    player.seekTo(expectedSec(), true);
    if (paused) player.pauseVideo();
    else player.playVideo();
  }, [ready, entryId, paused, startedAt, positionMs]);

  // 광고·버퍼링 등으로 어긋나면 다시 맞춘다
  useEffect(() => {
    if (!ready || !entryId || paused) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || player.getPlayerState() !== PlayerState.PLAYING) return;
      const drift = Math.abs(player.getCurrentTime() - expectedSec()) * 1000;
      if (drift > MUSIC_DRIFT_TOLERANCE_MS) player.seekTo(expectedSec(), true);
    }, DRIFT_CHECK_MS);
    return () => window.clearInterval(id);
  }, [ready, entryId, paused]);

  // 곡이 바뀌어도 내 음량·소리 끔 설정을 유지한다
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    player.setVolume(volume);
    if (muted) player.mute();
    else player.unMute();
  }, [ready, muted, volume, entryId]);

  function playByHand() {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(expectedSec(), true);
    player.playVideo();
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
