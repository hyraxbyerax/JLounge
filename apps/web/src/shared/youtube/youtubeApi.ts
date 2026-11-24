/*
 * 유튜브 IFrame Player API (https://developers.google.com/youtube/iframe_api_reference).
 * 쓰는 부분만 타입을 직접 적었다.
 */

export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  /** startSeconds: 이 위치부터 재생 */
  loadVideoById(videoId: string, startSeconds?: number): void;
  getPlayerState(): number;
  /** 지금 재생 위치(초) */
  getCurrentTime(): number;
  /** 영상 길이(초). 불러오기 전에는 0 */
  getDuration(): number;
  /** 재생 위치 옮기기(초). allowSeekAhead: 아직 안 받은 구간으로도 이동 */
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  /** 0~100 */
  setVolume(volume: number): void;
  destroy(): void;
};

type PlayerEvent = { target: YouTubePlayer; data: number };

export type PlayerOptions = {
  width?: string | number;
  height?: string | number;
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: PlayerEvent) => void;
    onStateChange?: (e: PlayerEvent) => void;
    onError?: (e: PlayerEvent) => void;
  };
};

type YouTubeNamespace = {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YouTubeNamespace> | null = null;

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.append(script);
  });
  return loading;
}
