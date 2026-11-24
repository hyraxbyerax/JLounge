// 실제 Redis + Socket.IO 로 게임 공통 틀·캐치마인드·초성 퀴즈를 확인한다 (TEST_REDIS_URL 이 있을 때만)
import type { GameRandom, GameView, RoomJoined, RoomSummary } from '@lounge/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type TestClient } from '../testing.ts';

// 제시어를 정해 둔다: 캐치마인드는 '사과', 초성 퀴즈는 '라면'(음식 · ㄹㅁ)
const fixed: GameRandom = {
  pickWord: (_drawer, used) => (used.length === 0 ? '사과' : `단어${used.length}`),
  pickChosung: (used) => ({ category: '음식', word: used.length === 0 ? '라면' : `떡볶이${used.length}` }),
};

const url = process.env.TEST_REDIS_URL;
const h = createHarness(url ?? '', { gameRandom: fixed });
const { run, connect, ok, errorCode, next } = h;

const settings = { name: `게임방 ${run}`, isPublic: true, password: null, locked: false, maxMembers: 6 };

async function roomOf(...names: string[]) {
  const [hostName, ...rest] = names;
  const host = await connect(hostName!);
  const room = (await ok<RoomJoined>(host, 'room:create', settings)).room;
  const others: TestClient[] = [];
  for (const name of rest) {
    const c = await connect(name);
    await ok(c, 'room:join', { code: room.code });
    others.push(c);
  }
  return { host, others, room };
}

const stateOf = (c: TestClient, match: (v: GameView) => boolean) =>
  next(c, 'game:state', (info) => info.view !== null && match(info.view)).then((info) => info.view!);

describe.skipIf(!url)('게임 (TEST_REDIS_URL 이 있을 때만)', () => {
  beforeAll(() => h.start());
  afterEach(() => h.cleanup());
  afterAll(() => h.stop());

  it('방장만 고르고 시작한다. 혼자서는 시작할 수 없다', async () => {
    const { host, others } = await roomOf('방장', '손님');
    expect(await errorCode(others[0]!, 'game:select', { type: 'catchmind' })).toBe('GAME_NOT_HOST');
    expect(await errorCode(host, 'game:start')).toBe('GAME_NONE');

    const waiting = stateOf(others[0]!, (v) => v.phase === 'waiting');
    await ok(host, 'game:select', { type: 'catchmind' });
    expect((await waiting).players).toHaveLength(2);
    expect(await errorCode(others[0]!, 'game:start')).toBe('GAME_NOT_HOST');

    const solo = await roomOf('혼자');
    await ok(solo.host, 'game:select', { type: 'chosung' });
    expect(await errorCode(solo.host, 'game:start')).toBe('GAME_NEED_PLAYERS');
  });

  it('캐치마인드: 제시어는 그리는 사람에게만, 그림은 그리는 사람만, 정답은 채팅에 올라가지 않는다', async () => {
    const { host, others, room } = await roomOf('방장', '가', '나');
    const [a, b] = others as [TestClient, TestClient];
    await ok(host, 'game:select', { type: 'catchmind' });

    const hostSecret = next(host, 'game:private', (p) => p.private !== null);
    let leaked = false;
    a.on('game:private', (p) => {
      if (p.private) leaked = true;
    });
    const started = stateOf(a, (v) => v.phase === 'playing');
    await ok(host, 'game:start');
    const view = await started;
    expect(view.drawerId).toBe(host.user.userId);
    expect(view.prompt).toBe('_ _');
    expect(JSON.stringify(view)).not.toContain('사과');
    expect((await hostSecret).private).toEqual({ word: '사과' });

    // 그림: 그리는 사람만, 다른 사람에게 그대로 간다
    const stroke = {
      ink: 'black',
      width: 8,
      points: [
        [10, 10],
        [100, 100],
      ],
    };
    const drawn = next(a, 'game:stroke');
    await ok(host, 'game:stroke', stroke);
    expect((await drawn).stroke).toEqual(stroke);
    expect(await errorCode(a, 'game:stroke', stroke)).toBe('GAME_NOT_DRAWER');

    // 그리는 사람이 제시어를 쓰면 막는다
    expect(await errorCode(host, 'chat:send', { text: '정답은 사과' })).toBe('GAME_BLOCKED');

    // 오답은 채팅, 정답은 "맞혔어요"만
    const wrong = next(b, 'chat:message', (m) => m.kind === 'user');
    await ok(a, 'chat:send', { text: '바나나' });
    expect((await wrong).text).toBe('바나나');
    expect(await errorCode(a, 'chat:send', { text: '사과' })).toBe('CHAT_SLOW'); // 3초 안에 또
    await new Promise((r) => setTimeout(r, 3_100));
    expect(leaked).toBe(false); // 맞히기 전에는 제시어를 받지 않는다

    const correct = next(b, 'chat:message', (m) => m.text.includes('정답을 맞혔어요'));
    const aSecret = next(a, 'game:private', (p) => p.private !== null);
    await ok(a, 'chat:send', { text: ' 사 과 ' });
    expect((await correct).text).toMatch(/^가님이 정답을 맞혔어요! \(\+\d+점\)$/);
    expect((await aSecret).private).toEqual({ word: '사과' });

    // 마지막 사람이 맞히면 라운드가 끝나고 모두에게 정답 공개
    const revealed = stateOf(host, (v) => v.revealing);
    await ok(b, 'chat:send', { text: '사과' });
    expect((await revealed).answer).toBe('사과');

    // 진행 중인 게임은 로비 창문에 보인다
    const lobby = await ok<RoomSummary[]>(host, 'lobby:watch');
    expect(lobby.find((r) => r.id === room.id)?.game).toBe('캐치마인드');
  }, 20_000);

  it('게임 중에 들어온 사람은 이번 판에 끼지 않고 평범하게 채팅한다. 들어오면 지금 게임 화면을 받는다', async () => {
    const { host, room } = await roomOf('방장', '가');
    await ok(host, 'game:select', { type: 'chosung' });
    await ok(host, 'game:start');
    const late = await connect('늦게');
    const joined = await ok<RoomJoined>(late, 'room:join', { code: room.code });
    expect(joined.game?.view.phase).toBe('playing');
    expect(joined.game?.view.players).not.toContain(late.user.userId);
    expect(joined.game?.private).toBeNull();

    const chat = next(host, 'chat:message', (m) => m.kind === 'user');
    await ok(late, 'chat:send', { text: '라면' });
    expect((await chat).text).toBe('라면');
  });

  it('초성 퀴즈: 분류와 초성을 보여주고, 먼저 맞힌 사람이 점수를 받는다', async () => {
    const { host, others } = await roomOf('방장', '가');
    const a = others[0]!;
    await ok(host, 'game:select', { type: 'chosung' });
    const started = stateOf(a, (v) => v.phase === 'playing');
    await ok(host, 'game:start');
    expect((await started).prompt).toBe('음식 · ㄹㅁ');

    const revealed = stateOf(host, (v) => v.revealing);
    await ok(a, 'chat:send', { text: '라면' });
    const view = await revealed;
    expect(view.answer).toBe('라면');
    expect(view.guessedIds).toEqual([a.user.userId]);
    expect(view.scores[a.user.userId]).toBeGreaterThanOrEqual(10);
  });

  it('방장은 언제든 게임을 끝낼 수 있다 (/endgame)', async () => {
    const { host, others } = await roomOf('방장', '가');
    await ok(host, 'game:select', { type: 'catchmind' });
    await ok(host, 'game:start');
    expect(await errorCode(others[0]!, 'game:quit')).toBe('GAME_NOT_HOST');
    const closed = next(others[0]!, 'game:state', (info) => info.view === null);
    const notice = next(others[0]!, 'chat:message', (m) => m.text === '방장이 게임을 강제로 끝냈어요');
    await ok(host, 'game:quit');
    await closed;
    await notice;
  });

  it('그리던 사람이 나가면 그 라운드는 바로 끝난다', async () => {
    const { host, others } = await roomOf('방장', '가', '나');
    await ok(host, 'game:select', { type: 'catchmind' });
    await ok(host, 'game:start');
    const revealed = stateOf(others[0]!, (v) => v.revealing);
    await ok(host, 'room:leave');
    expect((await revealed).answer).toBe('사과');
  });
});
