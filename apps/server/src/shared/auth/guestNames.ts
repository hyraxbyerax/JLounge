/*
 * 게스트 이름(Guest00000) 겹치지 않게 잡아 두기.
 * 이름마다 Redis 키 guestname:{이름} 을 "없을 때만" 만든다 (SET NX). 게스트 토큰이 살아 있는 동안(12시간) 유지하므로
 * 지금 접속 중인 게스트끼리는 이름이 겹치지 않는다. 서버가 여러 대여도 Redis 한 곳에서 확인한다.
 */
import type { RedisConnections } from '../redis.ts';
import { GUEST_TOKEN_TTL_SEC, randomGuestName } from './localAuth.ts';

export type GuestNames = {
  /** 이름을 잡는다. 이미 다른 게스트가 쓰고 있으면 false */
  reserve: (name: string, userId: string) => Promise<boolean>;
};

const key = (name: string) => `guestname:${name}`;

export function createRedisGuestNames(client: RedisConnections['client']): GuestNames {
  return {
    async reserve(name, userId) {
      return (await client.set(key(name), userId, { NX: true, EX: GUEST_TOKEN_TTL_SEC })) === 'OK';
    },
  };
}

/** 서버 한 대용 (테스트 등 Redis 없이 앱만 띄울 때) */
export function createMemoryGuestNames(): GuestNames {
  const taken = new Set<string>();
  return {
    async reserve(name) {
      if (taken.has(name)) return false;
      taken.add(name);
      return true;
    },
  };
}

/** 아직 아무도 안 쓰는 게스트 이름 하나를 잡아서 돌려준다 (10만 개 중 무작위, 겹치면 다시 뽑는다) */
export async function pickGuestName(names: GuestNames, userId: string, pick = randomGuestName): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = pick();
    if (await names.reserve(name, userId)) return name;
  }
  throw new Error('게스트 이름을 정하지 못했어요 (빈 이름이 거의 없음)');
}
