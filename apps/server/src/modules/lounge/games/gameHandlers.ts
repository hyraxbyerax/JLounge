/*
 * 게임 공통 틀의 서버 쪽 (명세 8장). 규칙 계산은 @lounge/shared 의 순수 함수, 상태는 Redis(gameStore).
 * - 방장이 고르기·시작·끝내기, 판정은 서버. 숨김 정보(캐치마인드 제시어)는 받을 사람의 채널로만 보낸다
 * - 시간 흐름(라운드 끝, 힌트, 다음 라운드)과 연습 상대의 행동은 "다음에 확인할 시각"을 Redis(rooms:game-due)에 두고
 *   모든 서버가 0.5초마다 확인한다. 꺼낸 서버만 처리하고, 저장은 판 번호를 비교해 한 번만 성공한다
 */
import {
  BOT,
  BOT_DRAWINGS,
  BOT_LINES,
  botWordsFor,
  botGuessChance,
  botGuessDelay,
  botStrokesDue,
  botWrongGuess,
  CATCHMIND_RULES,
  createGame,
  gameName,
  gameSelectInput,
  gameTopicInput,
  gameView,
  setCatchMindTopic,
  TOPIC_LABEL,
  wordsFor,
  guessAnyGame,
  isRoundLive,
  pickUnused,
  privateView,
  startAnyGame,
  strokeInput,
  tickAnyGame,
  withPlayers,
  WORDS,
  type GameEvent,
  type GameRandom,
  type GameSnapshot,
  type GameState,
  type Stroke,
} from '@lounge/shared';
import { AppError } from '../../../shared/http/errors.ts';
import { validate } from '../../../shared/http/validate.ts';
import type { Logger } from '../../../shared/logger.ts';
import type { Counter } from '../../../shared/rateLimit.ts';
import { userChannel, type IoServer, type IoSocket } from '../../../shared/realtime/socket.ts';
import { roomChannel } from '../rooms/channels.ts';
import type { RoomHandlers } from '../rooms/handlers.ts';
import type { RoomStore } from '../rooms/roomStore.ts';
import type { BotMemory, GameStore, StoredGame } from './gameStore.ts';

const TICK_MS = 500;
/** 게임 진행 중 다시 확인하는 간격 (연습 상대가 그릴 때 획이 이만큼씩 늘어난다) */
const FOLLOW_UP_MS = 500;
/** 캐치마인드 라운드 진행 중 채팅 간격 (명세 6장) */
const SLOW_CHAT_SEC = 3;

export const defaultRandom: GameRandom = {
  pickWord: (drawerId, used, topic) => pickUnused(drawerId === BOT.id ? botWordsFor(topic) : wordsFor(topic), used),
};

const fail = (code: string, message: string) => new AppError(code, message);

/** '기린' → 이었어요, '사과' → 였어요 (마지막 글자 받침에 따라) */
function copula(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '이었어요' : '였어요';
}

type Deps = {
  io: IoServer;
  games: GameStore;
  rooms: RoomHandlers;
  roomStore: RoomStore;
  counter: Counter;
  logger: Logger;
  now?: () => number;
  random?: GameRandom;
};

/** 한 번의 변경에서 생긴 일 (저장에 성공한 뒤 알린다) */
type Outcome = { events: GameEvent[]; newStrokes: Stroke[]; botSays: string[] };
const nothing = (): Outcome => ({ events: [], newStrokes: [], botSays: [] });

export function createGameHandlers({
  io,
  games,
  rooms,
  roomStore,
  counter,
  logger,
  now = Date.now,
  random = defaultRandom,
}: Deps) {
  async function members(roomId: string) {
    const view = await roomStore.view(roomId);
    return {
      hostId: view?.hostId ?? null,
      ids: view?.members.map((m) => m.userId) ?? [],
      nickname: (id: string) => view?.members.find((m) => m.userId === id)?.nickname ?? '누군가',
    };
  }

  async function requireHost(socket: IoSocket, roomId: string) {
    const { hostId } = await members(roomId);
    if (hostId !== socket.data.user.userId) throw fail('GAME_NOT_HOST', '방장만 할 수 있어요');
  }

  /** 대기 중에는 지금 방에 있는 사람을 참가자로 보여준다 */
  async function shown(roomId: string, state: GameState): Promise<GameState> {
    return state.phase === 'playing' ? state : withPlayers(state, (await members(roomId)).ids);
  }

  async function publish(roomId: string, stored: StoredGame | null) {
    if (!stored) {
      io.to(roomChannel(roomId)).emit('game:state', { roomId, view: null });
      return;
    }
    const state = await shown(roomId, stored.state);
    io.to(roomChannel(roomId)).emit('game:state', { roomId, view: gameView(state, now()) });
    for (const userId of state.players) {
      io.to(userChannel(userId)).emit('game:private', { roomId, private: privateView(state, userId) });
    }
  }

  const botSay = (roomId: string, text: string) =>
    rooms.say(roomId, {
      kind: 'user',
      userId: BOT.id,
      nickname: BOT.nickname,
      text,
      sentAt: new Date(now()).toISOString(),
    });

  /** 규칙이 낸 일을 채팅으로 알리고, 새 라운드면 그림판을 비운다 */
  async function announce(roomId: string, state: GameState, outcome: Outcome) {
    const { nickname } = await members(roomId);
    const hasBot = state.players.includes(BOT.id);
    for (const event of outcome.events) {
      switch (event.type) {
        case 'started':
          await rooms.system(
            roomId,
            `캐치마인드를 시작해요! ${state.totalRounds}라운드, 라운드마다 ${CATCHMIND_RULES.roundMs / 1000}초예요 (주제: ${TOPIC_LABEL[state.topic ?? 'all']})`,
          );
          break;
        case 'roundStarted':
          await games.clearStrokes(roomId);
          io.to(roomChannel(roomId)).emit('game:strokes', { roomId, strokes: [] });
          await rooms.system(roomId, `${event.round}라운드: ${nickname(event.drawerId)}님이 그려요`);
          if (event.drawerId === BOT.id) await botSay(roomId, BOT_LINES.myTurn);
          break;
        case 'correct':
          await rooms.system(roomId, `${nickname(event.userId)}님이 정답을 맞혔어요! (+${event.points}점)`);
          if (event.userId !== BOT.id && state.turn?.drawerId === BOT.id) {
            await botSay(roomId, BOT_LINES.someoneGotIt);
          }
          break;
        case 'roundEnded': {
          const anyone = event.guessedIds.length > 0;
          await rooms.system(
            roomId,
            anyone
              ? `정답은 '${event.word}'${copula(event.word)}`
              : `아무도 못 맞혔어요. 정답은 '${event.word}'${copula(event.word)}`,
          );
          if (!anyone && hasBot) await botSay(roomId, BOT_LINES.nobodyGotIt);
          break;
        }
        case 'finished': {
          const winners = event.ranking.filter((r) => r.rank === 1);
          const names = winners.map((w) => `${nickname(w.userId)}님`).join(', ');
          await rooms.system(
            roomId,
            `게임이 끝났어요. ${winners.length > 1 ? '공동 1등' : '1등'}은 ${names} (${winners[0]?.score ?? 0}점)`,
          );
          if (hasBot) {
            const botWon = winners.some((w) => w.userId === BOT.id);
            await botSay(roomId, winners.length > 1 ? BOT_LINES.tie : botWon ? BOT_LINES.won : BOT_LINES.lost);
          }
          await rooms.publishLobby();
          break;
        }
        case 'hint':
          break;
      }
    }
    if (outcome.newStrokes.length > 0) {
      await games.addStrokes(roomId, outcome.newStrokes);
      for (const stroke of outcome.newStrokes) io.to(roomChannel(roomId)).emit('game:stroke', { roomId, stroke });
    }
    for (const text of outcome.botSays) await botSay(roomId, text);
  }

  /** 연습 상대가 이번 순간에 할 일 (그리기·맞혀보기). 상태와 기억을 바꿔 돌려준다 */
  function botTurn(state: GameState, memory: BotMemory | null, t: number, strokeCount: number, out: Outcome) {
    if (!memory || !state.players.includes(BOT.id) || !isRoundLive(state) || !state.turn) return { state, memory };
    let bot: BotMemory =
      memory.round === state.round
        ? memory
        : { round: state.round, drawn: 0, teased: false, nextGuessAt: t + botGuessDelay() };
    const turn = state.turn;
    const elapsed = t - turn.startedAt;

    if (turn.drawerId === BOT.id) {
      const drawing = BOT_DRAWINGS[turn.word] ?? [];
      const due = botStrokesDue(drawing.length, elapsed);
      if (due > bot.drawn) {
        out.newStrokes.push(...drawing.slice(bot.drawn, due));
        bot = { ...bot, drawn: due };
      }
      return { state, memory: bot };
    }
    if (turn.guessedIds.includes(BOT.id)) return { state, memory: bot };
    if (t < bot.nextGuessAt) return { state, memory: bot };

    bot = { ...bot, nextGuessAt: t + botGuessDelay() };
    if (strokeCount === 0) {
      if (!bot.teased) out.botSays.push(BOT_LINES.yourTurnEmpty);
      return { state, memory: { ...bot, teased: true } };
    }
    const word = turn.word;
    if (Math.random() < botGuessChance(elapsed, CATCHMIND_RULES.roundMs)) {
      const guess = guessAnyGame(state, BOT.id, word, t);
      out.events.push(...guess.events);
      return { state: guess.state, memory: bot };
    }
    out.botSays.push(botWrongGuess(word, WORDS));
    return { state, memory: bot };
  }

  /** 시간이 된 방 하나를 처리한다 */
  async function advance(roomId: string) {
    const t = now();
    const present = (await members(roomId)).ids;
    const strokeCount = (await games.strokes(roomId)).length;
    const { changed, stored, result } = await games.update(roomId, (current) => {
      if (!current || current.state.phase !== 'playing') return undefined;
      const out = nothing();
      const step = tickAnyGame(current.state, t, random, present);
      out.events.push(...step.events);
      const bot = botTurn(
        step.state,
        current.bot,
        t,
        out.events.some((e) => e.type === 'roundStarted') ? 0 : strokeCount,
        out,
      );
      const same = bot.state === current.state && bot.memory === current.bot && out.botSays.length === 0;
      if (same && out.newStrokes.length === 0 && out.events.length === 0) return undefined;
      return { next: { state: bot.state, bot: bot.memory }, result: out };
    });
    const latest = stored ?? (await games.get(roomId));
    if (changed && stored && result) {
      await announce(roomId, stored.state, result);
      if (result.events.length > 0) await publish(roomId, stored);
    }
    if (latest?.state.phase === 'playing') await games.schedule(roomId, t + FOLLOW_UP_MS);
  }

  async function tick() {
    for (const roomId of await games.takeDue(now())) {
      await advance(roomId).catch((err: unknown) => logger.warn('게임 진행 처리 실패', { err, roomId }));
    }
  }

  async function requireDrawer(socket: IoSocket, roomId: string) {
    const stored = await games.get(roomId);
    const state = stored?.state;
    if (
      !state ||
      state.type !== 'catchmind' ||
      !isRoundLive(state) ||
      state.turn?.drawerId !== socket.data.user.userId
    ) {
      throw fail('GAME_NOT_DRAWER', '지금은 그릴 수 없어요');
    }
  }

  function register(socket: IoSocket) {
    socket.on('game:select', (input, ack) =>
      rooms.respond(socket, 'game:select', ack, async () => {
        const roomId = await rooms.requireRoom(socket);
        await requireHost(socket, roomId);
        const { type } = validate(gameSelectInput, input);
        const { ids } = await members(roomId);
        const { changed, stored } = await games.update(roomId, (current) => {
          if (current?.state.phase === 'playing') return undefined;
          return { next: { state: createGame(type, ids), bot: null }, result: null };
        });
        if (!changed) throw fail('GAME_IN_PROGRESS', '게임이 진행 중이에요. 끝난 뒤에 골라주세요');
        await games.clearStrokes(roomId);
        await rooms.system(roomId, `방장이 ${gameName(type)}을(를) 골랐어요`);
        if (ids.includes(BOT.id)) await botSay(roomId, BOT_LINES.gameSelected);
        await publish(roomId, stored);
        return null;
      }),
    );

    socket.on('game:topic', (input, ack) =>
      rooms.respond(socket, 'game:topic', ack, async () => {
        const roomId = await rooms.requireRoom(socket);
        await requireHost(socket, roomId);
        const { topic } = validate(gameTopicInput, input);
        const { changed, stored } = await games.update(roomId, (current) => {
          if (!current || current.state.type !== 'catchmind' || current.state.phase === 'playing') return undefined;
          if ((current.state.topic ?? 'all') === topic) return undefined;
          return { next: { ...current, state: setCatchMindTopic(current.state, topic) }, result: null };
        });
        if (!changed || !stored) {
          const current = await games.get(roomId);
          if (current?.state.phase === 'playing')
            throw fail('GAME_IN_PROGRESS', '게임이 진행 중이에요. 끝난 뒤에 바꿔주세요');
          if (current?.state.type !== 'catchmind') throw fail('GAME_NONE', '캐치마인드를 먼저 골라주세요');
          return null; // 이미 그 주제
        }
        await rooms.system(roomId, `제시어 주제를 '${TOPIC_LABEL[topic]}'(으)로 바꿨어요`);
        await publish(roomId, stored);
        return null;
      }),
    );

    socket.on('game:start', (ack) =>
      rooms.respond(socket, 'game:start', ack, async () => {
        const roomId = await rooms.requireRoom(socket);
        await requireHost(socket, roomId);
        const t = now();
        const { ids } = await members(roomId);
        const { changed, stored, result } = await games.update(roomId, (current) => {
          if (!current || current.state.phase === 'playing') return undefined;
          // 대기 중에 들어온 사람까지 이번 판 참가자로
          const step = startAnyGame(withPlayers(current.state, ids), t, random, ids);
          if (step.state.phase !== 'playing') return undefined;
          const bot = ids.includes(BOT.id)
            ? { round: 1, drawn: 0, teased: false, nextGuessAt: t + botGuessDelay() }
            : null;
          return { next: { state: step.state, bot }, result: { ...nothing(), events: step.events as GameEvent[] } };
        });
        if (!changed || !stored || !result) {
          const current = await games.get(roomId);
          if (!current) throw fail('GAME_NONE', '먼저 게임을 골라주세요');
          if (current.state.phase === 'playing') throw fail('GAME_IN_PROGRESS', '이미 게임이 진행 중이에요');
          throw fail('GAME_NEED_PLAYERS', '같이 할 사람이 2명 이상 있어야 시작할 수 있어요');
        }
        await announce(roomId, stored.state, result);
        await publish(roomId, stored);
        await games.schedule(roomId, t + FOLLOW_UP_MS);
        await rooms.publishLobby();
        return null;
      }),
    );

    socket.on('game:quit', (ack) =>
      rooms.respond(socket, 'game:quit', ack, async () => {
        const roomId = await rooms.requireRoom(socket);
        await requireHost(socket, roomId);
        const current = await games.get(roomId);
        if (!current) throw fail('GAME_NONE', '진행 중인 게임이 없어요');
        await games.clearRoom(roomId);
        await rooms.system(
          roomId,
          current.state.phase === 'playing' ? '방장이 게임을 강제로 끝냈어요' : '게임을 끝냈어요',
        );
        await publish(roomId, null);
        await rooms.publishLobby();
        return null;
      }),
    );

    socket.on('game:stroke', (input, ack) =>
      rooms.respond(socket, 'game:stroke', ack, async () => {
        const roomId = await rooms.requireRoom(socket);
        const stroke = validate(strokeInput, input) as Stroke;
        await requireDrawer(socket, roomId);
        await games.addStrokes(roomId, [stroke]);
        socket.to(roomChannel(roomId)).emit('game:stroke', { roomId, stroke });
        return null;
      }),
    );

    for (const event of ['game:undo', 'game:clear'] as const) {
      socket.on(event, (ack) =>
        rooms.respond(socket, event, ack, async () => {
          const roomId = await rooms.requireRoom(socket);
          await requireDrawer(socket, roomId);
          if (event === 'game:undo') await games.undoStroke(roomId);
          else await games.clearStrokes(roomId);
          io.to(roomChannel(roomId)).emit('game:strokes', { roomId, strokes: await games.strokes(roomId) });
          return null;
        }),
      );
    }
  }

  /** 채팅을 정답으로 판정한다 (방 채팅보다 먼저 본다) */
  async function beforeChat(socket: IoSocket, roomId: string, text: string) {
    const current = await games.get(roomId);
    if (!current || current.state.phase !== 'playing') return { consumed: false };
    const userId = socket.data.user.userId;
    const live = isRoundLive(current.state);
    if (live && current.state.players.includes(userId)) {
      const used = await counter.hit(`room:${roomId}:slow:${userId}`, SLOW_CHAT_SEC);
      if (used > 1) throw fail('CHAT_SLOW', `게임 중에는 ${SLOW_CHAT_SEC}초에 한 번만 보낼 수 있어요`);
    }
    const t = now();
    // 정답일 때만 저장한다 (오답·흘리는 말은 상태를 바꾸지 않는다)
    const seen: { verdict: 'correct' | 'chat' | 'blocked' } = { verdict: 'chat' };
    const { stored, result } = await games.update(roomId, (cur) => {
      if (!cur || cur.state.phase !== 'playing') return undefined;
      const guess = guessAnyGame(cur.state, userId, text, t);
      seen.verdict = guess.result;
      if (guess.result !== 'correct') return undefined;
      return { next: { state: guess.state, bot: cur.bot }, result: { ...nothing(), events: guess.events } };
    });
    if (seen.verdict === 'correct' && stored && result) {
      await announce(roomId, stored.state, result);
      await publish(roomId, stored);
      return { consumed: true };
    }
    if (seen.verdict === 'blocked') throw fail('GAME_BLOCKED', '정답이 드러나는 말은 채팅에 쓸 수 없어요');
    return { consumed: false, quiet: true };
  }

  async function afterLeave(roomId: string, userId: string, deleted: boolean) {
    if (deleted) {
      await games.clearRoom(roomId);
      return;
    }
    const t = now();
    const { changed, stored, result } = await games.update(roomId, (current) => {
      if (!current || current.state.type !== 'catchmind') return undefined;
      const state = current.state;
      if (!isRoundLive(state) || state.turn?.drawerId !== userId) return undefined;
      // 그리던 사람이 나가면 라운드를 바로 끝낸다
      const ended = { ...state, turn: { ...state.turn, revealUntil: t + CATCHMIND_RULES.revealMs } };
      const events: GameEvent[] = [{ type: 'roundEnded', word: state.turn.word, guessedIds: state.turn.guessedIds }];
      return { next: { state: ended, bot: current.bot }, result: { ...nothing(), events } };
    });
    if (changed && stored && result) await announce(roomId, stored.state, result);
    const latest = stored ?? (await games.get(roomId));
    if (latest) await publish(roomId, latest);
  }

  async function snapshot(roomId: string, userId: string): Promise<{ game: GameSnapshot | null }> {
    const stored = await games.get(roomId);
    if (!stored) return { game: null };
    const state = await shown(roomId, stored.state);
    return {
      game: { view: gameView(state, now()), private: privateView(state, userId), strokes: await games.strokes(roomId) },
    };
  }

  function startTicker(): () => void {
    const timer = setInterval(() => {
      tick().catch((err: unknown) => logger.warn('게임 확인 실패', { err }));
    }, TICK_MS);
    return () => clearInterval(timer);
  }

  rooms.extend({ beforeChat, afterLeave, joinExtras: snapshot });

  return { register, startTicker, tick };
}
