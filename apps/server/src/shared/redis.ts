import { createClient } from 'redis';
import type { Logger } from './logger.ts';

export type RedisConnections = Awaited<ReturnType<typeof connectRedis>>;

/**
 * 상태 저장용 클라이언트 하나와, Socket.IO 어댑터용 pub/sub 클라이언트 두 개.
 * 연결이 끊기면 node-redis가 알아서 다시 연결한다.
 */
export async function connectRedis(url: string, logger: Logger) {
  const client = createClient({ url });
  client.on('error', (err) => logger.warn('Redis 연결 오류', { err }));
  client.on('reconnecting', () => logger.info('Redis 다시 연결하는 중'));

  const pub = client.duplicate();
  const sub = client.duplicate();
  pub.on('error', (err) => logger.warn('Redis pub 연결 오류', { err }));
  sub.on('error', (err) => logger.warn('Redis sub 연결 오류', { err }));

  await Promise.all([client.connect(), pub.connect(), sub.connect()]);
  logger.info('Redis 연결됨');

  return {
    client,
    pub,
    sub,
    async close() {
      await Promise.allSettled([client.close(), pub.close(), sub.close()]);
    },
  };
}
