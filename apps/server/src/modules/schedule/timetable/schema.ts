import { z } from 'zod';
import { optionalText, requiredText } from '../../../shared/http/validate.ts';

const hhmm = z
  .string({
    error: (issue) => (issue.input === undefined ? '시간을 입력해주세요.' : '시간은 HH:MM 형식으로 입력해주세요.'),
  })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, '시간은 HH:MM 형식(예: 09:30)으로 입력해주세요.');

const BAD_WEEKDAY = '요일이 올바르지 않습니다.';

export const timetableInput = z
  .object({
    courseName: requiredText('과목명', 50),
    weekday: z
      .number({ error: (issue) => (issue.input === undefined ? '요일을 선택해주세요.' : BAD_WEEKDAY) })
      .int(BAD_WEEKDAY)
      .min(1, BAD_WEEKDAY)
      .max(7, BAD_WEEKDAY),
    startTime: hhmm,
    endTime: hhmm,
    location: optionalText('강의실', 50),
  })
  .strict()
  // "HH:MM" 은 자리수가 고정이라 문자열 비교가 곧 시간 비교다.
  .refine((v) => v.endTime > v.startTime, { path: ['endTime'], message: '종료 시간은 시작 시간보다 늦어야 합니다.' });
export type TimetableInput = z.output<typeof timetableInput>;
