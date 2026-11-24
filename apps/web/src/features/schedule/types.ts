export type ScheduleType = 'assignment' | 'exam';

export const TYPE_LABEL: Record<ScheduleType, string> = { assignment: '과제', exam: '시험' };

export interface User {
  id: string;
  email: string;
  nickname: string;
}

/** 서버가 내려주는 모든 시각(dueAt 등)은 UTC ISO 8601 문자열이다. 화면에 보여줄 때만 사용자 시간대로 바꾼다. */
export interface Schedule {
  id: number;
  subject: string;
  type: ScheduleType;
  title: string;
  dueAt: string;
  memo: string;
  isDone: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleInput {
  subject: string;
  type: ScheduleType;
  title: string;
  dueAt: string; // UTC ISO 8601
  memo: string;
}

export interface TimetableEntry {
  id: number;
  courseName: string;
  weekday: number; // 1=월 … 7=일
  startTime: string; // 'HH:MM' (학교 달력 기준 시각)
  endTime: string;
  location: string;
}

export type TimetableInput = Omit<TimetableEntry, 'id'>;

export const WEEKDAY_LABEL = ['', '월', '화', '수', '목', '금', '토', '일'] as const;
