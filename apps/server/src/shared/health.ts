import { Router } from 'express';
import { errorBody } from './http/errors.ts';

export type HealthCheck = () => Promise<void>;

const CHECK_TIMEOUT_MS = 2000;

function withTimeout(check: HealthCheck): Promise<void> {
  return Promise.race([
    check(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS)),
  ]);
}

/**
 * GET /health — 로드밸런서가 확인하는 주소.
 * Redis·DB가 모두 정상이면 200, 하나라도 안 되거나 종료 중이면 503.
 */
export function healthRouter(checks: Record<string, HealthCheck>, isShuttingDown: () => boolean): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    if (isShuttingDown()) {
      res.status(503).json(errorBody('SHUTTING_DOWN', '서버가 종료되는 중이에요'));
      return;
    }
    const names = Object.keys(checks);
    const results = await Promise.allSettled(names.map((name) => withTimeout(checks[name]!)));
    const status = Object.fromEntries(
      names.map((name, i) => [name, results[i]!.status === 'fulfilled' ? 'ok' : 'down']),
    );
    if (results.every((r) => r.status === 'fulfilled')) {
      res.json({ data: status });
    } else {
      res.status(503).json({ ...errorBody('UNHEALTHY', '서버 일부가 응답하지 않아요'), data: status });
    }
  });
  return router;
}
