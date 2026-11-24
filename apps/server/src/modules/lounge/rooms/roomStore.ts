/*
 * 방 상태는 전부 Redis에 둔다 (서버 메모리에 두지 않는다 — 서버가 여러 대여도 같은 방을 본다).
 * 정원 확인·방장 변경·강퇴처럼 여러 서버가 동시에 바꿀 수 있는 곳은 Lua 스크립트로 한 번에 처리한다.
 *
 * 키 (docs/lounge-spec.md 부록 A)
 *   room:{id}           Hash   code, name, hostId, isPublic, passwordHash, locked, maxMembers, createdAt
 *   room:{id}:members   ZSet   참가자 (점수 = 들어온 시각 ms, 낮을수록 오래 있던 사람)
 *   room:{id}:profiles  Hash   userId → {"nickname","isGuest"}
 *   room:{id}:bots      Set    연습 상대 userId
 *   room:{id}:banned    Set    강퇴된 사람
 *   room:{id}:chat      List   최근 채팅 100개 (다시 연결한 사람에게 놓친 메시지를 주는 데 쓴다)
 *   room:{id}:seq       String 채팅 번호
 *   roomcode:{code}     String 코드 → 방 id
 *   rooms:public        Set    공개방 id
 *   rooms:alive         ZSet   "{방id}|{userId}" → 마지막으로 접속이 확인된 시각 (presence.ts)
 *   pwfail:{id}:{key}   String 비밀번호 틀린 횟수 (10분 뒤 사라짐)
 */
import { randomBytes } from 'node:crypto';
import type { RoomMember, RoomSummary, RoomView, ServerChatMessage } from '@lounge/shared';
import type { RedisConnections } from '../../../shared/redis.ts';

type Client = RedisConnections['client'];

const CHAT_KEEP = 100;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const keys = {
  room: (id: string) => `room:${id}`,
  members: (id: string) => `room:${id}:members`,
  profiles: (id: string) => `room:${id}:profiles`,
  bots: (id: string) => `room:${id}:bots`,
  banned: (id: string) => `room:${id}:banned`,
  chat: (id: string) => `room:${id}:chat`,
  seq: (id: string) => `room:${id}:seq`,
  code: (code: string) => `roomcode:${code}`,
  public: 'rooms:public',
  alive: 'rooms:alive',
  pwfail: (id: string, userKey: string) => `pwfail:${id}:${userKey}`,
};

/** 방 하나에 딸린 키 전부 (방을 지울 때) */
const roomKeys = (id: string) => [
  keys.room(id),
  keys.members(id),
  keys.profiles(id),
  keys.bots(id),
  keys.banned(id),
  keys.chat(id),
  keys.seq(id),
];

export type Profile = { userId: string; nickname: string; isGuest: boolean };

const profileJson = (p: Profile) => JSON.stringify({ nickname: p.nickname, isGuest: p.isGuest });

const CREATE = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX') == false then return 0 end
redis.call('HSET', KEYS[2], 'code', ARGV[2], 'name', ARGV[3], 'hostId', ARGV[4], 'isPublic', ARGV[5],
  'passwordHash', ARGV[6], 'locked', ARGV[7], 'maxMembers', ARGV[8], 'createdAt', ARGV[9])
redis.call('ZADD', KEYS[3], ARGV[9], ARGV[4])
redis.call('HSET', KEYS[4], ARGV[4], ARGV[10])
if ARGV[5] == '1' then redis.call('SADD', KEYS[5], ARGV[1]) end
return 1`;

// 결과: OK(새로 들어옴) / ALREADY(이미 참가자, 다시 연결) / NOT_FOUND / BANNED / LOCKED / FULL
const JOIN = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'NOT_FOUND' end
if redis.call('ZSCORE', KEYS[2], ARGV[1]) then
  redis.call('HSET', KEYS[3], ARGV[1], ARGV[2])
  return 'ALREADY'
end
if redis.call('SISMEMBER', KEYS[4], ARGV[1]) == 1 then return 'BANNED' end
if redis.call('HGET', KEYS[1], 'locked') == '1' then return 'LOCKED' end
if redis.call('ZCARD', KEYS[2]) >= tonumber(redis.call('HGET', KEYS[1], 'maxMembers')) then return 'FULL' end
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
redis.call('HSET', KEYS[3], ARGV[1], ARGV[2])
return 'OK'`;

// 나가기·강퇴. 결과: {상태, 나간 사람 프로필, 새 방장}
//   상태: LEFT / HOST_CHANGED / DELETED(사람이 아무도 안 남아 방 삭제) / NOT_FOUND / NOT_MEMBER / NOT_HOST / SELF
// KEYS: room, members, profiles, bots, banned, chat, seq, roomcode, rooms:public
// ARGV: 나갈 사람, 요청한 사람, 'leave'|'kick', 방 id
const LEAVE = `
if redis.call('EXISTS', KEYS[1]) == 0 then return {'NOT_FOUND'} end
local host = redis.call('HGET', KEYS[1], 'hostId')
if ARGV[3] == 'kick' then
  if ARGV[2] ~= host then return {'NOT_HOST'} end
  if ARGV[1] == host then return {'SELF'} end
end
if not redis.call('ZSCORE', KEYS[2], ARGV[1]) then return {'NOT_MEMBER'} end
local profile = redis.call('HGET', KEYS[3], ARGV[1]) or '{}'
local isBot = redis.call('SISMEMBER', KEYS[4], ARGV[1]) == 1
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('HDEL', KEYS[3], ARGV[1])
redis.call('SREM', KEYS[4], ARGV[1])
if ARGV[3] == 'kick' and not isBot then redis.call('SADD', KEYS[5], ARGV[1]) end
local firstHuman = nil
for _, m in ipairs(redis.call('ZRANGE', KEYS[2], 0, -1)) do
  if redis.call('SISMEMBER', KEYS[4], m) == 0 then firstHuman = m break end
end
if not firstHuman then
  if redis.call('GET', KEYS[8]) == ARGV[4] then redis.call('DEL', KEYS[8]) end
  redis.call('DEL', KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7])
  redis.call('SREM', KEYS[9], ARGV[4])
  return {'DELETED', profile}
end
if ARGV[1] == host then
  redis.call('HSET', KEYS[1], 'hostId', firstHuman)
  return {'HOST_CHANGED', profile, firstHuman}
end
return {'LEFT', profile}`;

// 결과: OK / NOT_FOUND / NOT_HOST / NOT_MEMBER / IS_BOT / SELF
const TRANSFER = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'NOT_FOUND' end
if redis.call('HGET', KEYS[1], 'hostId') ~= ARGV[1] then return 'NOT_HOST' end
if ARGV[1] == ARGV[2] then return 'SELF' end
if not redis.call('ZSCORE', KEYS[2], ARGV[2]) then return 'NOT_MEMBER' end
if redis.call('SISMEMBER', KEYS[3], ARGV[2]) == 1 then return 'IS_BOT' end
redis.call('HSET', KEYS[1], 'hostId', ARGV[2])
return 'OK'`;

// ARGV: 요청한 사람, name, isPublic, locked, maxMembers, 비밀번호('keep'|'set'|'clear'), 해시, 방 id
// 결과: OK / NOT_FOUND / NOT_HOST / TOO_SMALL
const UPDATE = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'NOT_FOUND' end
if redis.call('HGET', KEYS[1], 'hostId') ~= ARGV[1] then return 'NOT_HOST' end
if tonumber(ARGV[5]) < redis.call('ZCARD', KEYS[2]) then return 'TOO_SMALL' end
redis.call('HSET', KEYS[1], 'name', ARGV[2], 'isPublic', ARGV[3], 'locked', ARGV[4], 'maxMembers', ARGV[5])
if ARGV[6] == 'set' then redis.call('HSET', KEYS[1], 'passwordHash', ARGV[7]) end
if ARGV[6] == 'clear' then redis.call('HSET', KEYS[1], 'passwordHash', '') end
if ARGV[3] == '1' then redis.call('SADD', KEYS[3], ARGV[8]) else redis.call('SREM', KEYS[3], ARGV[8]) end
return 'OK'`;

// 연습 상대 부르기. 결과: OK / NOT_FOUND / NOT_HOST / ALREADY / FULL
const ADD_BOT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'NOT_FOUND' end
if redis.call('HGET', KEYS[1], 'hostId') ~= ARGV[1] then return 'NOT_HOST' end
if redis.call('ZSCORE', KEYS[2], ARGV[2]) then return 'ALREADY' end
if redis.call('ZCARD', KEYS[2]) >= tonumber(redis.call('HGET', KEYS[1], 'maxMembers')) then return 'FULL' end
redis.call('ZADD', KEYS[2], ARGV[4], ARGV[2])
redis.call('HSET', KEYS[3], ARGV[2], ARGV[3])
redis.call('SADD', KEYS[4], ARGV[2])
return 'OK'`;

// 방이 있을 때만 채팅을 붙인다 (방이 막 지워졌으면 0). 번호·id 를 붙인 JSON 을 돌려준다
const APPEND_CHAT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
local seq = redis.call('INCR', KEYS[3])
local m = cjson.decode(ARGV[1])
m.seq = seq
m.id = ARGV[2] .. ':' .. seq
local json = cjson.encode(m)
redis.call('RPUSH', KEYS[2], json)
redis.call('LTRIM', KEYS[2], -tonumber(ARGV[3]), -1)
return json`;

// 기한이 지난 "{방id}|{userId}" 를 꺼낸다. 꺼낸 서버만 처리하도록 ZREM 에 성공한 것만 돌려준다
const TAKE_EXPIRED = `
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 50)
local taken = {}
for _, m in ipairs(due) do
  if redis.call('ZREM', KEYS[1], m) == 1 then table.insert(taken, m) end
end
return taken`;

export type JoinStatus = 'OK' | 'ALREADY' | 'NOT_FOUND' | 'BANNED' | 'LOCKED' | 'FULL';
export type LeaveResult =
  | { status: 'LEFT' | 'DELETED'; left: Profile }
  | { status: 'HOST_CHANGED'; left: Profile; newHostId: string }
  | { status: 'NOT_FOUND' | 'NOT_MEMBER' | 'NOT_HOST' | 'SELF' };

type RoomHash = Record<string, string>;

export function createRoomStore(client: Client, random: (n: number) => Buffer = randomBytes) {
  const run = async <T>(script: string, keyList: string[], args: (string | number)[]) =>
    (await client.eval(script, { keys: keyList, arguments: args.map(String) })) as T;

  const newCode = () => Array.from(random(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

  async function readHash(id: string): Promise<RoomHash | null> {
    const hash = await client.hGetAll(keys.room(id));
    return Object.keys(hash).length > 0 ? hash : null;
  }

  return {
    /** 새 방. 만든 사람이 방장 */
    async create(input: {
      name: string;
      isPublic: boolean;
      passwordHash: string | null;
      locked: boolean;
      maxMembers: number;
      host: Profile;
      now: number;
    }): Promise<{ id: string; code: string }> {
      for (let i = 0; i < 10; i++) {
        const id = `r_${random(9).toString('base64url')}`;
        const code = newCode();
        const ok = await run<number>(
          CREATE,
          [keys.code(code), keys.room(id), keys.members(id), keys.profiles(id), keys.public],
          [
            id,
            code,
            input.name,
            input.host.userId,
            input.isPublic ? 1 : 0,
            input.passwordHash ?? '',
            input.locked ? 1 : 0,
            input.maxMembers,
            input.now,
            profileJson(input.host),
          ],
        );
        if (ok === 1) return { id, code };
      }
      throw new Error('방 코드를 만들지 못했어요');
    },

    async findIdByCode(code: string): Promise<string | null> {
      return client.get(keys.code(code));
    },

    async isMember(id: string, userId: string): Promise<boolean> {
      return (await client.zScore(keys.members(id), userId)) !== null;
    },

    /** 비밀번호 해시 (없으면 null). 방이 없어도 null */
    async passwordHash(id: string): Promise<string | null> {
      return (await client.hGet(keys.room(id), 'passwordHash')) || null;
    },

    async join(id: string, user: Profile, now: number): Promise<JoinStatus> {
      return run<JoinStatus>(
        JOIN,
        [keys.room(id), keys.members(id), keys.profiles(id), keys.banned(id)],
        [user.userId, profileJson(user), now],
      );
    },

    /** 나가기(mode 'leave', actorId 는 본인) 또는 방장의 강퇴(mode 'kick') */
    async leave(id: string, userId: string, actorId = userId, mode: 'leave' | 'kick' = 'leave'): Promise<LeaveResult> {
      const code = (await client.hGet(keys.room(id), 'code')) ?? '-';
      const [status, profile, newHostId] = await run<[string, string?, string?]>(
        LEAVE,
        [...roomKeys(id), keys.code(code), keys.public],
        [userId, actorId, mode, id],
      );
      if (status === 'NOT_FOUND' || status === 'NOT_MEMBER' || status === 'NOT_HOST' || status === 'SELF') {
        return { status };
      }
      const parsed = JSON.parse(profile ?? '{}') as { nickname?: string; isGuest?: boolean };
      const left: Profile = { userId, nickname: parsed.nickname ?? '누군가', isGuest: parsed.isGuest ?? true };
      if (status === 'HOST_CHANGED') return { status, left, newHostId: newHostId! };
      return { status: status as 'LEFT' | 'DELETED', left };
    },

    async transfer(id: string, actorId: string, targetId: string) {
      return run<'OK' | 'NOT_FOUND' | 'NOT_HOST' | 'NOT_MEMBER' | 'IS_BOT' | 'SELF'>(
        TRANSFER,
        [keys.room(id), keys.members(id), keys.bots(id)],
        [actorId, targetId],
      );
    },

    async update(
      id: string,
      actorId: string,
      input: {
        name: string;
        isPublic: boolean;
        locked: boolean;
        maxMembers: number;
        password: { mode: 'keep' } | { mode: 'clear' } | { mode: 'set'; hash: string };
      },
    ) {
      return run<'OK' | 'NOT_FOUND' | 'NOT_HOST' | 'TOO_SMALL'>(
        UPDATE,
        [keys.room(id), keys.members(id), keys.public],
        [
          actorId,
          input.name,
          input.isPublic ? 1 : 0,
          input.locked ? 1 : 0,
          input.maxMembers,
          input.password.mode,
          input.password.mode === 'set' ? input.password.hash : '',
          id,
        ],
      );
    },

    async addBot(id: string, actorId: string, bot: Profile, now: number) {
      return run<'OK' | 'NOT_FOUND' | 'NOT_HOST' | 'ALREADY' | 'FULL'>(
        ADD_BOT,
        [keys.room(id), keys.members(id), keys.profiles(id), keys.bots(id)],
        [actorId, bot.userId, profileJson(bot), now],
      );
    },

    async hasBot(id: string, botId: string): Promise<boolean> {
      return (await client.sIsMember(keys.bots(id), botId)) === 1;
    },

    /** 방 안에서 보는 정보. 방이 없으면 null */
    async view(id: string): Promise<RoomView | null> {
      const [hash, memberIds, profiles, bots] = await Promise.all([
        readHash(id),
        client.zRange(keys.members(id), 0, -1),
        client.hGetAll(keys.profiles(id)),
        client.sMembers(keys.bots(id)),
      ]);
      if (!hash) return null;
      const members: RoomMember[] = memberIds.map((userId) => {
        const p = JSON.parse(profiles[userId] ?? '{}') as { nickname?: string; isGuest?: boolean };
        return { userId, nickname: p.nickname ?? '누군가', isGuest: p.isGuest ?? true, isBot: bots.includes(userId) };
      });
      return {
        id,
        code: hash.code!,
        name: hash.name!,
        isPublic: hash.isPublic === '1',
        hasPassword: Boolean(hash.passwordHash),
        locked: hash.locked === '1',
        maxMembers: Number(hash.maxMembers),
        hostId: hash.hostId!,
        members,
      };
    },

    /** 로비에 보일 공개방 */
    async listPublic(): Promise<RoomSummary[]> {
      const ids = await client.sMembers(keys.public);
      const rooms = await Promise.all(
        ids.map(async (id): Promise<RoomSummary | null> => {
          const [hash, members] = await Promise.all([readHash(id), client.zCard(keys.members(id))]);
          if (!hash) return null;
          return {
            id,
            code: hash.code!,
            name: hash.name!,
            hasPassword: Boolean(hash.passwordHash),
            locked: hash.locked === '1',
            members,
            maxMembers: Number(hash.maxMembers),
            game: null,
            nowPlaying: null,
          };
        }),
      );
      return rooms.filter((r): r is RoomSummary => r !== null);
    },

    /** 채팅을 저장하고 번호를 붙여 돌려준다. 방이 없으면 null */
    async appendChat(
      id: string,
      message:
        | Omit<Extract<ServerChatMessage, { kind: 'user' }>, 'id' | 'seq'>
        | Omit<Extract<ServerChatMessage, { kind: 'system' }>, 'id' | 'seq'>,
    ): Promise<ServerChatMessage | null> {
      const json = await run<string | number>(
        APPEND_CHAT,
        [keys.room(id), keys.chat(id), keys.seq(id)],
        [JSON.stringify(message), id, CHAT_KEEP],
      );
      return typeof json === 'string' ? (JSON.parse(json) as ServerChatMessage) : null;
    },

    /** since 번호 다음의 채팅 */
    async chatSince(id: string, since: number): Promise<ServerChatMessage[]> {
      const list = await client.lRange(keys.chat(id), 0, -1);
      return list
        .map((json) => JSON.parse(json) as ServerChatMessage)
        .filter((m) => m.seq > since)
        .sort((a, b) => a.seq - b.seq);
    },

    /* 비밀번호 틀린 횟수 */

    async passwordFailures(id: string, userKey: string): Promise<{ count: number; ttlSec: number }> {
      const key = keys.pwfail(id, userKey);
      const [count, ttl] = await Promise.all([client.get(key), client.ttl(key)]);
      return { count: Number(count ?? 0), ttlSec: Math.max(0, ttl) };
    },

    async clearPasswordFailures(id: string, userKey: string): Promise<void> {
      await client.del(keys.pwfail(id, userKey));
    },

    /* 접속 확인 (presence.ts) */

    async touch(id: string, userId: string, at: number): Promise<void> {
      await client.zAdd(keys.alive, { score: at, value: `${id}|${userId}` });
    },

    async forget(id: string, userId: string): Promise<void> {
      await client.zRem(keys.alive, `${id}|${userId}`);
    },

    /** 마지막 확인 시각이 before 이전인 것들을 꺼낸다 (꺼낸 서버만 처리) */
    async takeExpired(before: number): Promise<{ roomId: string; userId: string }[]> {
      const taken = await run<string[]>(TAKE_EXPIRED, [keys.alive], [before]);
      return taken.map((entry) => {
        const at = entry.indexOf('|');
        return { roomId: entry.slice(0, at), userId: entry.slice(at + 1) };
      });
    },
  };
}

export type RoomStore = ReturnType<typeof createRoomStore>;
