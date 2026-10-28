import express, { Router, type Express } from 'express';
import type { Pool } from 'pg';
import type { TokenIssuer } from './shared/auth/AuthProvider.ts';
import { usersRouter } from './shared/auth/routes.ts';
import { healthRouter, type HealthCheck } from './shared/health.ts';
import { errorHandler, notFound } from './shared/http/errors.ts';
import type { Logger } from './shared/logger.ts';

type Deps = {
  issuer: TokenIssuer;
  db: Pool;
  healthChecks: Record<string, HealthCheck>;
  isShuttingDown: () => boolean;
  logger: Logger;
  /** 라운지 API (modules/lounge/routes.ts) */
  lounge?: Router;
};

/** HTTP 경로: /health, 공통 /api/users/*, 라운지 /api/lounge/*, 스케줄러용 /api/schedule/* 는 비워둔다 */
export function createApp({ issuer, db, healthChecks, isShuttingDown, logger, lounge = Router() }: Deps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.use('/health', healthRouter(healthChecks, isShuttingDown));
  app.use('/api/users', usersRouter(issuer, db));
  app.use('/api/lounge', lounge);

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
