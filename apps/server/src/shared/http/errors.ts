import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from '../logger.ts';

/**
 * 사용자에게 보여줄 수 있는 오류. 응답: { error: { code, message, fields? } }
 * fields: 입력칸별 오류 문장 (화면이 칸 아래에 보여준다)
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields: Record<string, string> | undefined;

  constructor(code: string, message: string, status = 400, fields?: Record<string, string>) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export type ErrorBody = { error: { code: string; message: string; fields?: Record<string, string> } };

export function errorBody(code: string, message: string, fields?: Record<string, string>): ErrorBody {
  return { error: { code, message, ...(fields ? { fields } : {}) } };
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', '찾는 주소가 없어요'));
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.status).json(errorBody(err.code, err.message, err.fields));
      return;
    }
    // express.json()이 잘못된 JSON을 받았을 때
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json(errorBody('BAD_REQUEST', '요청 형식이 잘못됐어요'));
      return;
    }
    logger.error('처리하지 못한 오류', { err, method: req.method, path: req.path });
    res.status(500).json(errorBody('INTERNAL', '잠깐 문제가 생겼어요. 다시 시도해주세요'));
  };
}
