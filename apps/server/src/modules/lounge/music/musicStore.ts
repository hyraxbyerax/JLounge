/*
 * 음악 재생 상태와 대기큐 (Redis). 모든 변경은 Lua 스크립트 하나로 처리한다.
 * 서버가 여러 대여도 "지금 곡이 아직 이 곡일 때만 다음 곡으로"가 한 번만 일어나게 하기 위해서다.
 *
 * 키 (docs/lounge-spec.md 부록 A)
 *   room:{id}:now     String  지금 곡 JSON (entry + state, startedAt ms, positionMs)
 *   room:{id}:queue   List    대기큐 (entry JSON)
 *   rooms:music-due   ZSet    "{방id}|{entryId}" → 곡이 끝나는 시각 (ms). music/ticker.ts 가 확인한다
 */
import type { MusicEntry, MusicNow, MusicState } from '@lounge/shared';
import type { RedisConnections } from '../../../shared/redis.ts';

type Client = RedisConnections['client'];

/** 브라우저가 영상을 불러오는 시간만큼 곡 끝을 조금 늦게 잡는다 */
export const END_GRACE_MS = 2_000;

export const musicKeys = {
  now: (id: string) => `room:${id}:now`,
  queue: (id: string) => `room:${id}:queue`,
  due: 'rooms:music-due',
};

/** 저장 모양: startedAt 이 숫자(ms) */
type StoredNow = MusicEntry & { state: 'playing' | 'paused'; startedAt: number; positionMs: number };

// 모든 스크립트 공통: KEYS = room, now, queue, due / ARGV[1] = 방 id, ARGV[2] = 지금 시각(ms)
const PRELUDE = `
local roomId, nowMs = ARGV[1], tonumber(ARGV[2])
if redis.call('EXISTS', KEYS[1]) == 0 then return {'NOT_FOUND'} end
local function getNow() local s = redis.call('GET', KEYS[2]) if s then return cjson.decode(s) end return nil end
local function dueMember(e) return roomId .. '|' .. e.entryId end
local function endsAt(e) return e.startedAt + e.durationSec * 1000 + ${END_GRACE_MS} end
local function play(e)
  e.state = 'playing'
  e.startedAt = nowMs
  e.positionMs = 0
  redis.call('SET', KEYS[2], cjson.encode(e))
  redis.call('ZADD', KEYS[4], endsAt(e), dueMember(e))
  return e
end
local function stopNow(cur)
  redis.call('DEL', KEYS[2])
  if cur then redis.call('ZREM', KEYS[4], dueMember(cur)) end
end
local function requireHost(actor)
  return redis.call('HGET', KEYS[1], 'hostId') == actor
end
`;

// 신청. ARGV: 방, 시각, entry JSON, 신청자, 1인당 최대
const REQUEST = `${PRELUDE}
local entry = cjson.decode(ARGV[3])
local cur = getNow()
if cur and cur.videoId == entry.videoId then return {'DUPLICATE'} end
local mine = 0
local queue = redis.call('LRANGE', KEYS[3], 0, -1)
for _, s in ipairs(queue) do
  local e = cjson.decode(s)
  if e.videoId == entry.videoId then return {'DUPLICATE'} end
  if e.requesterId == ARGV[4] then mine = mine + 1 end
end
if not cur then
  play(entry)
  return {'PLAYING', '0'}
end
if mine >= tonumber(ARGV[5]) then return {'LIMIT'} end
redis.call('RPUSH', KEYS[3], ARGV[3])
return {'QUEUED', tostring(#queue + 1)}`;

// 다음 곡으로. ARGV: 방, 시각, 기대하는 지금 곡 entryId ('' = 아무 곡이든), 요청한 사람('' = 서버/누구나), 방장만?
// 결과: {상태, 끝난 곡 JSON, 새 곡 JSON}  상태: NEXT / EMPTY / STALE / NOT_HOST
const ADVANCE = `${PRELUDE}
if ARGV[5] == '1' and not requireHost(ARGV[4]) then return {'NOT_HOST'} end
local cur = getNow()
if ARGV[3] ~= '' and (not cur or cur.entryId ~= ARGV[3]) then return {'STALE'} end
local ended = cur and cjson.encode(cur) or ''
if cur then redis.call('ZREM', KEYS[4], dueMember(cur)) end
local nxt = redis.call('LPOP', KEYS[3])
if not nxt then
  redis.call('DEL', KEYS[2])
  return {'EMPTY', ended}
end
local e = play(cjson.decode(nxt))
return {'NEXT', ended, cjson.encode(e)}`;

// 방장 명령. ARGV: 방, 시각, 요청한 사람, 명령, 인자1, 인자2
// 결과: {상태, 관련 곡 JSON?}
const COMMAND = `${PRELUDE}
if not requireHost(ARGV[3]) then return {'NOT_HOST'} end
local cmd = ARGV[4]
local cur = getNow()
if cmd == 'pause' then
  if not cur or cur.state ~= 'playing' then return {'NOTHING'} end
  cur.positionMs = math.min(math.max(0, nowMs - cur.startedAt), cur.durationSec * 1000)
  cur.state = 'paused'
  redis.call('ZREM', KEYS[4], dueMember(cur))
  redis.call('SET', KEYS[2], cjson.encode(cur))
  return {'OK'}
elseif cmd == 'resume' then
  if not cur or cur.state ~= 'paused' then return {'NOTHING'} end
  cur.startedAt = nowMs - cur.positionMs
  cur.state = 'playing'
  redis.call('SET', KEYS[2], cjson.encode(cur))
  redis.call('ZADD', KEYS[4], endsAt(cur), dueMember(cur))
  return {'OK'}
elseif cmd == 'seek' then
  if not cur then return {'NOTHING'} end
  local pos = math.min(math.max(0, tonumber(ARGV[5])), math.max(0, cur.durationSec * 1000 - 1000))
  if cur.state == 'playing' then
    cur.startedAt = nowMs - pos
    redis.call('ZADD', KEYS[4], endsAt(cur), dueMember(cur))
  else
    cur.positionMs = pos
  end
  redis.call('SET', KEYS[2], cjson.encode(cur))
  return {'OK'}
elseif cmd == 'stop' then
  if not cur then return {'NOTHING'} end
  stopNow(cur)
  return {'OK', cjson.encode(cur)}
elseif cmd == 'clear' then
  if redis.call('LLEN', KEYS[3]) == 0 then return {'NOTHING'} end
  redis.call('DEL', KEYS[3])
  return {'OK'}
elseif cmd == 'remove' then
  local i = tonumber(ARGV[5])
  local len = redis.call('LLEN', KEYS[3])
  if not i or i < 1 or i > len then return {'RANGE', tostring(len)} end
  local removed = redis.call('LINDEX', KEYS[3], i - 1)
  redis.call('LSET', KEYS[3], i - 1, '__removed__')
  redis.call('LREM', KEYS[3], 1, '__removed__')
  return {'OK', removed}
elseif cmd == 'move' then
  local from, to = tonumber(ARGV[5]), tonumber(ARGV[6])
  local list = redis.call('LRANGE', KEYS[3], 0, -1)
  local len = #list
  if not from or not to or from < 1 or from > len or to < 1 or to > len then return {'RANGE', tostring(len)} end
  local moved = table.remove(list, from)
  table.insert(list, to, moved)
  redis.call('DEL', KEYS[3])
  redis.call('RPUSH', KEYS[3], unpack(list))
  return {'OK', moved, tostring(to)}
end
return {'UNKNOWN'}`;

// 본인 곡 취소. ARGV: 방, 시각, 요청한 사람, entryId  결과: {OK, 곡} / NOT_FOUND_ENTRY / NOT_YOURS
const CANCEL = `${PRELUDE}
local list = redis.call('LRANGE', KEYS[3], 0, -1)
for i, s in ipairs(list) do
  local e = cjson.decode(s)
  if e.entryId == ARGV[4] then
    if e.requesterId ~= ARGV[3] then return {'NOT_YOURS'} end
    redis.call('LSET', KEYS[3], i - 1, '__removed__')
    redis.call('LREM', KEYS[3], 1, '__removed__')
    return {'OK', s}
  end
end
return {'NOT_FOUND_ENTRY'}`;

// 끝날 시각이 지난 곡을 꺼낸다 (꺼낸 서버만 처리)
const TAKE_DUE = `
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 20)
local taken = {}
for _, m in ipairs(due) do
  if redis.call('ZREM', KEYS[1], m) == 1 then table.insert(taken, m) end
end
return taken`;

function toNow(stored: StoredNow): MusicNow {
  return { ...stored, startedAt: new Date(stored.startedAt).toISOString() };
}

const parseEntry = (json: string | undefined): MusicEntry | null => (json ? (JSON.parse(json) as MusicEntry) : null);

export type AdvanceResult =
  | { status: 'NEXT'; ended: MusicEntry | null; next: MusicEntry }
  | { status: 'EMPTY'; ended: MusicEntry | null }
  | { status: 'STALE' | 'NOT_HOST' | 'NOT_FOUND' };

export type CommandResult =
  | { status: 'OK'; entry: MusicEntry | null; to?: number }
  | { status: 'RANGE'; length: number }
  | { status: 'NOTHING' | 'NOT_HOST' | 'NOT_FOUND' | 'UNKNOWN' };

export function createMusicStore(client: Client) {
  const keysOf = (id: string) => [`room:${id}`, musicKeys.now(id), musicKeys.queue(id), musicKeys.due];
  const run = async (script: string, id: string, now: number, args: (string | number)[]) =>
    (await client.eval(script, { keys: keysOf(id), arguments: [id, String(now), ...args.map(String)] })) as string[];

  return {
    async state(id: string): Promise<MusicState> {
      const [now, queue] = await Promise.all([
        client.get(musicKeys.now(id)),
        client.lRange(musicKeys.queue(id), 0, -1),
      ]);
      return {
        now: now ? toNow(JSON.parse(now) as StoredNow) : null,
        queue: queue.map((s) => JSON.parse(s) as MusicEntry),
      };
    },

    /** 로비 창문에 보일 지금 곡 제목 */
    async nowTitle(id: string): Promise<string | null> {
      const now = await client.get(musicKeys.now(id));
      return now ? (JSON.parse(now) as StoredNow).title : null;
    },

    async request(id: string, entry: MusicEntry, now: number, maxPerUser: number) {
      const [status, position] = await run(REQUEST, id, now, [JSON.stringify(entry), entry.requesterId, maxPerUser]);
      return {
        status: status as 'PLAYING' | 'QUEUED' | 'DUPLICATE' | 'LIMIT' | 'NOT_FOUND',
        position: Number(position),
      };
    },

    async advance(
      id: string,
      now: number,
      opts: { expectedEntryId?: string; actorId?: string; hostOnly?: boolean } = {},
    ): Promise<AdvanceResult> {
      const [status, ended, next] = await run(ADVANCE, id, now, [
        opts.expectedEntryId ?? '',
        opts.actorId ?? '',
        opts.hostOnly ? 1 : 0,
      ]);
      if (status === 'NEXT') return { status, ended: parseEntry(ended), next: parseEntry(next)! };
      if (status === 'EMPTY') return { status, ended: parseEntry(ended) };
      return { status: status as 'STALE' | 'NOT_HOST' | 'NOT_FOUND' };
    },

    async command(
      id: string,
      now: number,
      actorId: string,
      name: 'pause' | 'resume' | 'seek' | 'stop' | 'clear' | 'remove' | 'move',
      args: number[] = [],
    ): Promise<CommandResult> {
      const [status, a, b] = await run(COMMAND, id, now, [actorId, name, args[0] ?? '', args[1] ?? '']);
      if (status === 'OK') return { status, entry: parseEntry(a), to: b ? Number(b) : undefined };
      if (status === 'RANGE') return { status, length: Number(a) };
      return { status: status as 'NOTHING' | 'NOT_HOST' | 'NOT_FOUND' | 'UNKNOWN' };
    },

    async cancel(id: string, now: number, actorId: string, entryId: string) {
      const [status, entry] = await run(CANCEL, id, now, [actorId, entryId]);
      return { status: status as 'OK' | 'NOT_YOURS' | 'NOT_FOUND_ENTRY' | 'NOT_FOUND', entry: parseEntry(entry) };
    },

    /** 끝날 시각이 지난 곡들 (꺼낸 서버만 처리한다) */
    async takeDue(now: number): Promise<{ roomId: string; entryId: string }[]> {
      const taken = (await client.eval(TAKE_DUE, { keys: [musicKeys.due], arguments: [String(now)] })) as string[];
      return taken.map((m) => {
        const at = m.indexOf('|');
        return { roomId: m.slice(0, at), entryId: m.slice(at + 1) };
      });
    },

    /** 방이 지워질 때 */
    async clearRoom(id: string): Promise<void> {
      const now = await client.get(musicKeys.now(id));
      await client.del([musicKeys.now(id), musicKeys.queue(id)]);
      if (now) await client.zRem(musicKeys.due, `${id}|${(JSON.parse(now) as StoredNow).entryId}`);
    },
  };
}

export type MusicStore = ReturnType<typeof createMusicStore>;
