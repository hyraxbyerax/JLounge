import { z } from 'zod';
import { optionalText, requiredText } from '../../../shared/http/validate.ts';

export const SCHEDULE_TYPES = ['assignment', 'exam'] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const BAD_DUE = '마감일 형식이 올바르지 않습니다.';

/**
 * 마감 시각: 시간대 정보가 포함된 ISO 8601 문자열만 받는다. (예: 2026-11-05T14:59:00.000Z)
 * 시간대 없는 값("2026-11-05")은 서버가 어느 시간대로 해석할지 모호하므로 거부한다.
 * 어떤 오프셋으로 들어오든 Date(=UTC 순간)로 변환해 저장한다.
 */
export const dueAtSchema = z
  .string({ error: (issue) => (issue.input === undefined ? '마감일을 입력해주세요.' : BAD_DUE) })
  .pipe(z.iso.datetime({ offset: true, error: BAD_DUE }))
  .transform((s) => new Date(s))
  .refine((d) => !Number.isNaN(d.getTime()), BAD_DUE)
  .refine(
    (d) => d.getUTCFullYear() >= MIN_YEAR && d.getUTCFullYear() <= MAX_YEAR,
    `마감일은 ${MIN_YEAR}년~${MAX_YEAR}년 사이로 입력해주세요.`,
  );

export const scheduleInput = z
  .object({
    subject: requiredText('과목명', 50),
    type: z.enum(SCHEDULE_TYPES, { error: '구분은 과제 또는 시험이어야 합니다.' }),
    title: requiredText('일정명', 100),
    dueAt: dueAtSchema,
    memo: optionalText('메모', 1000),
  })
  .strict();
export type ScheduleInput = z.output<typeof scheduleInput>;

export const doneInput = z
  .object({
    isDone: z.boolean({
      error: (issue) =>
        issue.input === undefined ? '완료 여부(isDone)가 필요합니다.' : '완료 여부는 true/false 여야 합니다.',
    }),
  })
  .strict();

export const listQuery = z.object({
  subject: z.string().trim().min(1).max(50).optional(),
  done: z
    .enum(['true', 'false'], { error: 'done 은 true 또는 false 여야 합니다.' })
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type ListFilter = { subject?: string; done?: boolean };

const BAD_ID = '올바르지 않은 일정 번호입니다.';
export const idParam = z.object({
  id: z.coerce.number({ error: BAD_ID }).int(BAD_ID).positive(BAD_ID).max(2_147_483_647, BAD_ID),
});
