/*
 * 음악 같이 듣기의 공통 모양. 재생 상태와 대기큐는 서버(Redis)가 갖고, 화면은 받아서 같은 위치를 재생한다.
 * 위치 = 서버 지금 시각 − startedAt (일시정지 중에는 positionMs)
 */
import { z } from 'zod';

/** 대기큐에 한 사람이 올릴 수 있는 곡 수 */
export const MAX_SONGS_PER_USER = 3;
/** 브라우저 재생 위치가 이만큼 어긋나면 다시 맞춘다 */
export const MUSIC_DRIFT_TOLERANCE_MS = 2_500;

export type MusicEntry = {
  entryId: string;
  videoId: string;
  title: string;
  durationSec: number;
  requesterId: string;
  requesterNickname: string;
};

export type MusicNow = MusicEntry & {
  state: 'playing' | 'paused';
  /** 재생 중: 이 곡의 0초가 재생된(것으로 치는) 서버 시각 (ISO) */
  startedAt: string;
  /** 일시정지 중: 멈춘 위치 (ms) */
  positionMs: number;
};

export type MusicState = { now: MusicNow | null; queue: MusicEntry[] };

export const EMPTY_MUSIC: MusicState = { now: null, queue: [] };

/** 지금 재생 위치 (ms). serverNowMs 는 서버 시각으로 보정한 지금 */
export function positionOf(now: MusicNow, serverNowMs: number): number {
  if (now.state === 'paused') return now.positionMs;
  return Math.min(now.durationSec * 1000, Math.max(0, serverNowMs - Date.parse(now.startedAt)));
}

export const musicRequestInput = z.object({
  videoId: z.string().regex(/^[\w-]{11}$/, '유튜브 영상을 다시 골라주세요'),
});

export const MUSIC_COMMANDS = ['skip', 'pause', 'resume', 'stop', 'remove', 'move', 'clear'] as const;
export type MusicCommandName = (typeof MUSIC_COMMANDS)[number];

export const musicCommandInput = z.object({
  name: z.enum(MUSIC_COMMANDS),
  /** /remove {번호}, /move {번호} {위치} — 1부터 센다 */
  args: z.array(z.number().int()).max(2).default([]),
});
export type MusicCommandInput = z.input<typeof musicCommandInput>;

export const musicSeekInput = z.object({
  positionSec: z
    .number()
    .min(0)
    .max(24 * 3600),
});
export const entryInput = z.object({ entryId: z.string().min(1).max(100) });
