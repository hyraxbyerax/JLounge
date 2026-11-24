// 시간 규칙: 서버·DB 는 UTC(timestamptz). 사용자 입력은 브라우저의 로컬 시간대로 받아 UTC ISO 로 바꿔 보내고,
// 받은 UTC 값은 화면에 보여줄 때만 로컬 시간대로 바꾼다.

export const SOON_DAYS = 3;
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** <input type="datetime-local"> 값("YYYY-MM-DDTHH:mm", 사용자 시간대) → UTC ISO 문자열. 올바르지 않으면 null. */
export function localInputToUtcIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(value); // 시간대 표기가 없는 날짜+시각 문자열은 로컬 시간으로 해석된다
  if (Number.isNaN(d.getTime())) return null;
  // 2월 31일 같은 값이 조용히 3월 3일로 넘어가지 않도록, 되돌려 봤을 때 입력과 같은지 확인한다.
  return utcIsoToLocalInput(d.toISOString()) === value ? d.toISOString() : null;
}

/** UTC ISO 문자열 → <input type="datetime-local"> 값(사용자 시간대) */
export function utcIsoToLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 로컬 날짜 키 "YYYY-MM-DD" (달력 칸 묶기용) */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const dateKeyOf = (iso: string): string => dateKey(new Date(iso));

/** 날짜 키 → 그날 23:59 (datetime-local 값). 마감일만 정하는 일반적인 경우의 기본 시각. */
export const endOfDayInput = (key: string): string => `${key}T23:59`;

/** 내일 23:59 (datetime-local 값) */
export function tomorrowEndOfDayInput(now: Date = new Date()): string {
  return endOfDayInput(dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)));
}

/** "11월 5일 (목) 23:59" — 사용자 시간대 기준 */
export function formatDue(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS_KO[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type DueState = 'done' | 'overdue' | 'soon' | 'normal';

/** 완료 > 지남 > 마감 임박(3일 이내) > 보통 */
export function dueState(iso: string, isDone: boolean, now: Date = new Date()): DueState {
  if (isDone) return 'done';
  const diff = new Date(iso).getTime() - now.getTime();
  if (diff < 0) return 'overdue';
  if (diff <= SOON_DAYS * DAY_MS) return 'soon';
  return 'normal';
}

/** 달력상 날짜 차이로 계산한 D-day 표기 (오늘이면 D-DAY) */
export function dDayLabel(iso: string, now: Date = new Date()): string {
  const due = new Date(iso);
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const n = Math.round((a - b) / DAY_MS);
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

/** 일요일 시작 6주(42칸) 달력. month 는 0~11 */
export function monthGrid(year: number, month: number): Date[] {
  const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** 'HH:MM' → 자정부터의 분 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}
