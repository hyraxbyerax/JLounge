// 캠퍼스 플래너 lib/time.test.ts 를 Vitest로 옮긴 것 (내용은 그대로)
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dDayLabel,
  dateKey,
  dueState,
  endOfDayInput,
  formatDue,
  localInputToUtcIso,
  monthGrid,
  toMinutes,
  tomorrowEndOfDayInput,
  utcIsoToLocalInput,
} from './time';

/** 이 테스트 동안만 시간대를 바꾼다 (Node는 TZ 환경 변수가 바뀌면 바로 반영한다) */
const inTz = (tz: string) => vi.stubEnv('TZ', tz);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('UTC ↔ 사용자 시간대 변환', () => {
  it('한국(KST): 11/5 23:59 입력은 UTC 14:59 로 서버에 간다', () => {
    inTz('Asia/Seoul');
    expect(localInputToUtcIso('2026-11-05T23:59')).toBe('2026-11-05T14:59:00.000Z');
    expect(utcIsoToLocalInput('2026-11-05T14:59:00.000Z')).toBe('2026-11-05T23:59');
    expect(formatDue('2026-11-05T14:59:00.000Z')).toBe('11월 5일 (목) 23:59');
  });

  it('다른 시간대(미국 서부)에서도 왕복 변환이 보존된다', () => {
    inTz('America/Los_Angeles');
    expect(localInputToUtcIso('2026-11-05T23:59')).toBe('2026-11-06T07:59:00.000Z');
    expect(utcIsoToLocalInput('2026-11-06T07:59:00.000Z')).toBe('2026-11-05T23:59');
  });

  it('UTC 날짜가 달라지는 경계: KST 00:30 은 전날 UTC 15:30', () => {
    inTz('Asia/Seoul');
    expect(localInputToUtcIso('2026-11-06T00:30')).toBe('2026-11-05T15:30:00.000Z');
    // 같은 순간을 달력 칸에 넣을 때는 사용자 시간대의 날짜(11/6)를 쓴다
    expect(dateKey(new Date('2026-11-05T15:30:00.000Z'))).toBe('2026-11-06');
  });

  it('잘못된 입력은 null', () => {
    inTz('Asia/Seoul');
    for (const v of ['', '2026-11-05', '2026-11-05T25:00', '2026-02-31T10:00', 'abc']) {
      expect(localInputToUtcIso(v), v).toBeNull();
    }
  });
});

describe('마감 표시와 달력', () => {
  it('마감 상태: 완료 > 지남 > 3일 이내 임박 > 보통', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    expect(dueState('2026-11-09T23:59:59Z', false, now)).toBe('overdue');
    expect(dueState('2026-11-09T23:59:59Z', true, now)).toBe('done');
    expect(dueState('2026-11-13T00:00:00Z', false, now)).toBe('soon'); // 정확히 72시간 후까지 임박
    expect(dueState('2026-11-13T00:00:01Z', false, now)).toBe('normal');
  });

  it('D-day 는 달력상 날짜 차이', () => {
    inTz('Asia/Seoul');
    const now = new Date('2026-11-05T01:00:00+09:00');
    expect(dDayLabel('2026-11-05T23:59:00+09:00', now)).toBe('D-DAY');
    expect(dDayLabel('2026-11-08T09:00:00+09:00', now)).toBe('D-3');
    expect(dDayLabel('2026-11-04T09:00:00+09:00', now)).toBe('D+1');
  });

  it('달력: 2026년 11월은 1일(일요일)부터 6주 42칸', () => {
    inTz('Asia/Seoul');
    const g = monthGrid(2026, 10);
    expect(g).toHaveLength(42);
    expect(dateKey(g[0]!)).toBe('2026-11-01');
    expect(dateKey(g[41]!)).toBe('2026-12-12');
    // 1일이 수요일인 달(2026년 7월)은 앞칸을 이전 달로 채운다
    expect(dateKey(monthGrid(2026, 6)[0]!)).toBe('2026-06-28');
  });

  it('기본 마감 시각과 분 환산', () => {
    expect(endOfDayInput('2026-11-05')).toBe('2026-11-05T23:59');
    expect(tomorrowEndOfDayInput(new Date(2026, 10, 30, 12, 0))).toBe('2026-12-01T23:59');
    expect(toMinutes('09:30')).toBe(570);
  });
});
