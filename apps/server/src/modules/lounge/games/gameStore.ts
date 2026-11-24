/*
 * 게임 상태 (Redis). 게임 규칙은 @lounge/shared 의 순수 함수로 계산하고,
 * 저장은 "읽은 판(version)이 그대로일 때만 쓰기"(Lua)로 한다 — 서버 여러 대가 동시에 바꿔도 한쪽만 성공하고
 * 진 쪽은 새로 읽어 다시 계산한다.
 *
 * 키 (docs/lounge-spec.md 부록 A)
 *   room:{id}:game      String  {"v": 판 번호, "state": 게임 상태(제시어 포함), "bot": 연습 상대 기억}
 *   room:{id}:strokes   List    지금 라운드 그림 (획 JSON)
 *   rooms:game-due      ZSet    방 id → 다음에 확인할 시각 (games/gameHandlers.ts 가 0.5초마다 꺼낸다)
 */
import type { GameState, Stroke } from '@lounge/shared';
import type { RedisConnections } from '../../../shared/redis.ts';

type Client = RedisConnections['client'];

/** 연습 상대가 게임 안에서 기억할 것 */
export type BotMemory = {
  /** 다음에 맞혀볼 시각 */
  nextGuessAt: number;
  /** "뭘 그리실지 궁금해요"를 이번 라운드에 했는지 */
  teased: boolean;
  /** 연습 상대가 그릴 때 이미 그린 획 수 */
  drawn: number;
  /** 이 기억이 몇 라운드 것인지 (라운드가 바뀌면 새로) */
  round: number;
};

export type StoredGame = { v: number; state: GameState; bot: BotMemory | null };

export const gameKeys = {
  game: (id: string) => `room:${id}:game`,
  strokes: (id: string) => `room:${id}:strokes`,
  due: 'rooms:game-due',
};

// ARGV: 기대하는 판 번호(0 = 아직 게임 없음), 새 값('' = 지우기)
const COMPARE_AND_SET = `
local cur = redis.call('GET', KEYS[1])
local v = 0
if cur then v = cjson.decode(cur).v end
if v ~= tonumber(ARGV[1]) then return 0 end
if ARGV[2] == '' then redis.call('DEL', KEYS[1]) else redis.call('SET', KEYS[1], ARGV[2]) end
return 1`;

const TAKE_DUE = `
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 20)
local taken = {}
for _, m in ipairs(due) do
  if redis.call('ZREM', KEYS[1], m) == 1 then table.insert(taken, m) end
end
return taken`;

export function createGameStore(client: Client) {
  async function get(id: string): Promise<StoredGame | null> {
    const json = await client.get(gameKeys.game(id));
    return json ? (JSON.parse(json) as StoredGame) : null;
  }

  return {
    get,

    /**
     * 지금 게임을 읽어 change 로 바꾼다. change 가 undefined 를 돌려주면 그대로 둔다, null 이면 게임을 지운다.
     * 다른 서버가 먼저 바꿨으면 새로 읽어 다시 계산한다.
     */
    async update<T>(
      id: string,
      change: (current: StoredGame | null) => { next: Omit<StoredGame, 'v'> | null; result: T } | undefined,
    ): Promise<{ changed: boolean; stored: StoredGame | null; result?: T }> {
      for (let attempt = 0; attempt < 8; attempt++) {
        const current = await get(id);
        const outcome = change(current);
        if (!outcome) return { changed: false, stored: current };
        const stored = outcome.next ? { ...outcome.next, v: (current?.v ?? 0) + 1 } : null;
        const ok = await client.eval(COMPARE_AND_SET, {
          keys: [gameKeys.game(id)],
          arguments: [String(current?.v ?? 0), stored ? JSON.stringify(stored) : ''],
        });
        if (ok === 1) return { changed: true, stored, result: outcome.result };
      }
      throw new Error('게임 상태를 저장하지 못했어요 (다른 서버와 계속 겹침)');
    },

    async strokes(id: string): Promise<Stroke[]> {
      return (await client.lRange(gameKeys.strokes(id), 0, -1)).map((s) => JSON.parse(s) as Stroke);
    },
    async addStrokes(id: string, strokes: Stroke[]): Promise<void> {
      if (strokes.length > 0)
        await client.rPush(
          gameKeys.strokes(id),
          strokes.map((s) => JSON.stringify(s)),
        );
    },
    async undoStroke(id: string): Promise<void> {
      await client.rPop(gameKeys.strokes(id));
    },
    async clearStrokes(id: string): Promise<void> {
      await client.del(gameKeys.strokes(id));
    },

    async schedule(id: string, at: number): Promise<void> {
      await client.zAdd(gameKeys.due, { score: at, value: id });
    },
    async unschedule(id: string): Promise<void> {
      await client.zRem(gameKeys.due, id);
    },
    /** 확인할 시각이 된 방들 (꺼낸 서버만 처리) */
    async takeDue(now: number): Promise<string[]> {
      return (await client.eval(TAKE_DUE, { keys: [gameKeys.due], arguments: [String(now)] })) as string[];
    },

    async clearRoom(id: string): Promise<void> {
      await client.del([gameKeys.game(id), gameKeys.strokes(id)]);
      await client.zRem(gameKeys.due, id);
    },
  };
}

export type GameStore = ReturnType<typeof createGameStore>;
