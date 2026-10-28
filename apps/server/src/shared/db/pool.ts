import pg from 'pg';
import type { Logger } from '../logger.ts';

export function createPool(databaseUrl: string, logger: Logger): pg.Pool {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  pool.on('error', (err) => logger.warn('PostgreSQL 연결 오류', { err }));
  return pool;
}
