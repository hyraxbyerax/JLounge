/*
 * npm run db:migrate — shared/db/migrations 의 SQL 파일을 순서대로 적용한다.
 * 파일 형식: "-- Up Migration" 아래에 적용할 SQL, "-- Down Migration" 아래에 되돌릴 SQL
 */
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { loadConfig } from '../config.ts';
import { createLogger } from '../logger.ts';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ task: 'migrate' });

try {
  const applied = await runner({
    databaseUrl: config.DATABASE_URL,
    dir: fileURLToPath(new URL('./migrations', import.meta.url)),
    direction: process.argv[2] === 'down' ? 'down' : 'up',
    count: process.argv[2] === 'down' ? 1 : Infinity,
    migrationsTable: 'pgmigrations',
    checkOrder: true,
    log: (msg) => logger.debug(msg),
  });
  logger.info('마이그레이션 완료', { applied: applied.map((m) => m.name) });
} catch (err) {
  logger.error('마이그레이션 실패', { err });
  process.exitCode = 1;
}
