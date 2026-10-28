/*
 * 정해진 시간 안에 몇 번까지 허용할지 세는 카운터.
 * 서버가 여러 대여도 같이 세도록 Redis에서 원자적으로(Lua) 처리한다.
 */
import type { RedisConnections } from './redis.ts';

export type Counter = {
  /** key의 횟수를 1 올리고, 처음이면 ttlSec 뒤 사라지게 한다. 올린 뒤의 횟수를 돌려준다 */
  hit(key: string, ttlSec: number): Promise<number>;
};

const INCR_WITH_TTL = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

export function redisCounter(client: RedisConnections['client']): Counter {
  return {
    async hit(key, ttlSec) {
      return Number(await client.eval(INCR_WITH_TTL, { keys: [key], arguments: [String(ttlSec)] }));
    },
  };
}
