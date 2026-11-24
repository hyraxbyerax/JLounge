/*
 * 접속·활동 상태 (Redis presence:{userId}). 브라우저가 20초마다 신호를 보내고, 60초 동안 없으면 키가 사라져 오프라인.
 * 친구에게 보낼 때는 그 사람이 정한 공개 범위로 거른다 (서버에서).
 */
import { OFFLINE, PRESENCE_TTL_SEC, type FriendPresence, type PresenceVisibility } from '@lounge/shared';
import type { RedisConnections } from '../../../shared/redis.ts';

type Client = RedisConnections['client'];

/** 저장하는 그대로의 상태 (거르기 전) */
export type RawPresence = { roomCode: string | null; roomName: string | null; activity: string | null };

const key = (userId: string) => `presence:${userId}`;

export function filterPresence(raw: RawPresence | null, visibility: PresenceVisibility): FriendPresence {
  if (!raw || visibility === 'hidden') return OFFLINE;
  if (visibility === 'online') return { online: true, room: null, activity: null };
  return {
    online: true,
    room: raw.roomCode && raw.roomName ? { code: raw.roomCode, name: raw.roomName } : null,
    activity: raw.activity,
  };
}

export function createActivityStore(client: Client) {
  return {
    /** 신호를 받으면 상태를 저장하고 만료를 늘린다. 방·활동이 바뀌었는지 돌려준다 */
    async beat(userId: string, next: RawPresence): Promise<boolean> {
      const json = JSON.stringify(next);
      const previous = await client.set(key(userId), json, { EX: PRESENCE_TTL_SEC, GET: true });
      return previous !== json;
    },

    async get(userIds: string[]): Promise<Map<string, RawPresence>> {
      if (userIds.length === 0) return new Map();
      const values = await client.mGet(userIds.map(key));
      const out = new Map<string, RawPresence>();
      values.forEach((v, i) => {
        if (v) out.set(userIds[i]!, JSON.parse(v) as RawPresence);
      });
      return out;
    },

    async clear(userId: string): Promise<void> {
      await client.del(key(userId));
    },
  };
}

export type ActivityStore = ReturnType<typeof createActivityStore>;
