import { describe, expect, it } from 'vitest';
import { musicCommandInput, musicRequestInput, positionOf, type MusicNow } from './music.ts';

const START = Date.parse('2026-11-25T03:00:00.000Z');
const now = (over: Partial<MusicNow> = {}): MusicNow => ({
  entryId: 'e1',
  videoId: 'dQw4w9WgXcQ',
  title: '곡',
  durationSec: 200,
  requesterId: 'u1',
  requesterNickname: '나',
  state: 'playing',
  startedAt: new Date(START).toISOString(),
  positionMs: 0,
  ...over,
});

// 같이 듣기의 핵심: 모든 브라우저가 "서버 시각 − 시작 시각"으로 같은 위치를 계산한다
describe('재생 위치', () => {
  it('재생 중이면 서버 시각 − 시작 시각', () => {
    expect(positionOf(now(), START + 42_000)).toBe(42_000);
  });

  it('시작 전(시계 오차)이면 0, 곡 길이를 넘으면 곡 끝', () => {
    expect(positionOf(now(), START - 500)).toBe(0);
    expect(positionOf(now(), START + 999_000)).toBe(200_000);
  });

  it('일시정지 중이면 시각과 상관없이 멈춘 위치', () => {
    const paused = now({ state: 'paused', positionMs: 12_345 });
    expect(positionOf(paused, START + 100_000)).toBe(12_345);
  });
});

describe('입력 검증', () => {
  it('신청은 유튜브 영상 id(11자)만 받는다', () => {
    expect(musicRequestInput.safeParse({ videoId: 'dQw4w9WgXcQ' }).success).toBe(true);
    expect(musicRequestInput.safeParse({ videoId: 'https://youtu.be/x' }).success).toBe(false);
  });

  it('방장 명령어는 정해진 것만, 인자는 2개까지', () => {
    expect(musicCommandInput.parse({ name: 'skip' }).args).toEqual([]);
    expect(musicCommandInput.safeParse({ name: 'move', args: [3, 1] }).success).toBe(true);
    expect(musicCommandInput.safeParse({ name: 'rm' }).success).toBe(false);
    expect(musicCommandInput.safeParse({ name: 'move', args: [1, 2, 3] }).success).toBe(false);
  });
});
