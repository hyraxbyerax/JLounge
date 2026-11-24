import { z } from 'zod';
import { AppError } from './errors.ts';

/** zod 스키마로 검증하고, 실패하면 칸별 한국어 메시지가 담긴 400 오류(VALIDATION_ERROR)를 던진다 */
export function validate<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (!(key in fields)) fields[key] = issue.message;
  }
  const first = result.error.issues[0]?.message ?? '입력값이 올바르지 않아요';
  throw new AppError('VALIDATION_ERROR', first, 400, fields);
}

/** 마지막 글자에 받침이 있으면 true (한글이 아니면 false) */
function hasFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

/** "과목명" → "과목명을", "메모" → "메모를" */
export const withObjectParticle = (word: string): string => `${word}${hasFinalConsonant(word) ? '을' : '를'}`;
/** "강의실" → "강의실은", "메모" → "메모는" */
export const withTopicParticle = (word: string): string => `${word}${hasFinalConsonant(word) ? '은' : '는'}`;

/** 앞뒤 공백을 지운 뒤 1~max 자인지 검사하는 문자열 스키마 (한국어 오류 메시지) */
export function requiredText(label: string, max: number) {
  const required = `${withObjectParticle(label)} 입력해주세요.`;
  return z
    .string({
      error: (issue) => (issue.input === undefined ? required : `${withTopicParticle(label)} 문자열이어야 합니다.`),
    })
    .trim()
    .min(1, required)
    .max(max, `${withTopicParticle(label)} ${max}자 이하로 입력해주세요.`);
}

export function optionalText(label: string, max: number) {
  return z
    .string({ error: `${withTopicParticle(label)} 문자열이어야 합니다.` })
    .trim()
    .max(max, `${withTopicParticle(label)} ${max}자 이하로 입력해주세요.`)
    .optional()
    .default('');
}
