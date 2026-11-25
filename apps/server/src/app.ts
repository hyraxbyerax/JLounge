import express, { Router, type Express } from 'express';
import type { AuthProvider, TokenIssuer } from './shared/auth/AuthProvider.ts';
import { usersRouter } from './shared/auth/routes.ts';
import type { Queryable } from './shared/db/pool.ts';
import { healthRouter, type HealthCheck } from './shared/health.ts';
import { errorHandler, notFound } from './shared/http/errors.ts';
import { webAppRouter } from './shared/http/webApp.ts';
import type { Logger } from './shared/logger.ts';

type Deps = {
  auth: AuthProvider & TokenIssuer;
  db: Queryable;
  healthChecks: Record<string, HealthCheck>;
  isShuttingDown: () => boolean;
  logger: Logger;
  /** 라운지 API (modules/lounge/routes.ts) */
  lounge?: Router;
  /** 캠퍼스 플래너 API (modules/schedule/index.ts) */
  schedule?: Router;
  /** 화면 빌드 폴더. 주면 그 밖의 주소에서 화면을 내보낸다 (shared/http/webApp.ts) */
  webDir?: string;
};

/** HTTP 경로: /health, 공통 /api/users/*, 라운지 /api/lounge/*, 캠퍼스 플래너 /api/schedule/*, (선택) 화면 */
export function createApp({
  auth,
  db,
  healthChecks,
  isShuttingDown,
  logger,
  lounge = Router(),
  schedule = Router(),
  webDir,
}: Deps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.use('/health', healthRouter(healthChecks, isShuttingDown));
  app.use('/api/users', usersRouter(auth, db));
  app.use('/api/lounge', lounge);
  app.use('/api/schedule', schedule);
  if (webDir) app.use(webAppRouter(webDir));

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
