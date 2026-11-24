import pg from 'pg';
import type { Logger } from '../logger.ts';

/** 질의만 하는 쪽(저장소 함수)이 받는 타입. 테스트에서 가짜로 바꾸기 쉽다 */
export type Queryable = Pick<pg.Pool, 'query'>;

/** 세션 시간대를 UTC로 고정한다 (timestamptz는 어차피 UTC 저장이지만, 직접 조회할 때도 헷갈리지 않게) */
export function createPool(databaseUrl: string, logger: Logger): pg.Pool {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, options: '-c timezone=UTC' });
  pool.on('error', (err) => logger.warn('PostgreSQL 연결 오류', { err }));
  return pool;
}
