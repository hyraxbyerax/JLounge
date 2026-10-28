import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { registerLoungeHandlers } from './modules/lounge/index.ts';
import { createLocalAuth } from './shared/auth/localAuth.ts';
import { loadConfig } from './shared/config.ts';
import { createPool } from './shared/db/pool.ts';
import { createLogger } from './shared/logger.ts';
import { createSocketServer } from './shared/realtime/socket.ts';
import { connectRedis } from './shared/redis.ts';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

const redis = await connectRedis(config.REDIS_URL, logger);
const db = createPool(config.DATABASE_URL, logger);
const auth = createLocalAuth(config.AUTH_SECRET);

let shuttingDown = false;

const app = createApp({
  issuer: auth,
  db,
  healthChecks: {
    redis: async () => {
      await redis.client.ping();
    },
    db: async () => {
      await db.query('select 1');
    },
  },
  isShuttingDown: () => shuttingDown,
  logger,
});

const httpServer = createServer(app);
const io = createSocketServer({ httpServer, auth, redis, corsOrigins: config.CORS_ORIGINS, logger });
registerLoungeHandlers(io);

httpServer.listen(config.PORT, () => logger.info('서버 시작', { port: config.PORT }));

/**
 * SIGTERM(배포·축소 시) → 새 연결을 받지 않고, 소켓을 정리하고, Redis·DB를 닫은 뒤 종료.
 * 브라우저는 자동 재접속해서 다른 서버로 붙는다.
 */
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('종료 시작', { signal });

  const force = setTimeout(() => {
    logger.warn('제한 시간 안에 정리하지 못해 강제 종료');
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
  force.unref();

  // io.close()는 모든 소켓을 끊고 HTTP 서버도 닫는다 (새 연결 거부)
  await io.close();
  await Promise.allSettled([redis.close(), db.end()]);
  logger.info('종료 완료');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
