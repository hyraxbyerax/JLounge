/** 서버가 { error: { code, message, fields? } } 로 답한 오류. message 는 화면에 그대로 보여줄 수 있는 한국어 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** 입력칸별 오류 문장 (예: { email: '이미 가입된 이메일입니다.' }) */
  readonly fields: Record<string, string>;

  constructor(code: string, message: string, status = 0, fields: Record<string, string> = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export type ApiErrorBody = { error: { code: string; message: string; fields?: Record<string, string> } };
export type ApiResponse<T> = { data: T } | ApiErrorBody;

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : '잠깐 문제가 생겼어요. 다시 시도해주세요';
