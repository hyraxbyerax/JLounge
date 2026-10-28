/*
 * 화면에서 캐치마인드를 돌리는 훅.
 * 규칙 판정은 catchmind.ts의 순수 함수가 하고, 여기서는 시간 흐름·그림·연습 상대·채팅 알림을 연결한다.
 * 서버를 붙이면 상태는 서버(Redis)가 갖고, 이 훅은 game:state·game:private 를 받아 그리는 역할만 남는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimeouts } from '../../../../shared/hooks/useTimeouts';
import { BOT, BOT_LINES, botGuessChance, botWrongGuess } from '../../bot/bot';
import { ME } from '../../model/room';
import type { PostedMessage } from '../../model/roomState';
import { BOT_DRAWINGS, createPlayback } from './botDrawings';
import {
  backToWaiting,
  canStart,
  CATCHMIND_RULES,
  createCatchMind,
  setPlayers,
  startGame,
  submitGuess,
  tick,
  viewFor,
  type CatchMindEvent,
  type CatchMindState,
  type GuessResult,
  type PickWord,
} from './catchmind';
import type { Stroke } from './drawing';
import { pickUnused, WORDS } from './words';

const TICK_MS = 250;
const BOT_DRAW_TICK_MS = 50;
const BOT_WORDS = Object.keys(BOT_DRAWINGS);

const pickWord: PickWord = (drawerId, used) => pickUnused(drawerId === BOT.id ? BOT_WORDS : WORDS, used);

type Options = {
  players: string[];
  nicknameOf: (userId: string) => string;
  post: (message: PostedMessage) => void;
};

export function useCatchMind({ players, nicknameOf, post }: Options) {
  const [game, setGame] = useState<CatchMindState | null>(null);
  const gameRef = useRef<CatchMindState | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const later = useTimeouts();

  // 콜백 안에서 항상 최신 값을 쓰기 위한 참조
  const latest = useRef({ nicknameOf, post });
  useEffect(() => {
    latest.current = { nicknameOf, post };
  });
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const botSay = useCallback(
    (text: string, delayMs = 600) =>
      later(() => latest.current.post({ kind: 'user', userId: BOT.id, nickname: BOT.nickname, text }), delayMs),
    [later],
  );

  const announce = useCallback(
    (event: CatchMindEvent, state: CatchMindState) => {
      const { nicknameOf: nick, post: say } = latest.current;
      const system = (text: string) => say({ kind: 'system', text });
      switch (event.type) {
        case 'started':
          system(`캐치마인드를 시작해요! ${state.totalRounds}라운드, 라운드마다 ${CATCHMIND_RULES.roundMs / 1000}초예요`);
          break;
        case 'roundStarted':
          setStrokes([]);
          system(`${event.round}라운드: ${nick(event.drawerId)}님이 그려요`);
          if (event.drawerId === BOT.id) botSay(BOT_LINES.myTurn);
          break;
        case 'correct':
          system(`${nick(event.userId)}님이 정답을 맞혔어요! (+${event.points}점)`);
          if (event.userId !== BOT.id && state.turn?.drawerId === BOT.id) botSay(BOT_LINES.someoneGotIt);
          break;
        case 'roundEnded':
          system(
            event.guessedIds.length > 0
              ? `정답은 '${event.word}'였어요`
              : `아무도 못 맞혔어요. 정답은 '${event.word}'였어요`,
          );
          if (event.guessedIds.length === 0 && state.players.includes(BOT.id)) botSay(BOT_LINES.nobodyGotIt);
          break;
        case 'finished': {
          const winners = event.ranking.filter((r) => r.rank === 1);
          const names = winners.map((w) => `${nick(w.userId)}님`).join(', ');
          system(`게임이 끝났어요. ${winners.length > 1 ? '공동 1등' : '1등'}은 ${names} (${winners[0]?.score ?? 0}점)`);
          if (state.players.includes(BOT.id)) {
            const botWon = winners.some((w) => w.userId === BOT.id);
            botSay(winners.length > 1 ? BOT_LINES.tie : botWon ? BOT_LINES.won : BOT_LINES.lost, 1200);
          }
          break;
        }
      }
    },
    [botSay],
  );

  const commit = useCallback(
    (next: CatchMindState | null, events: CatchMindEvent[] = []) => {
      gameRef.current = next;
      setGame(next);
      if (next) events.forEach((e) => announce(e, next));
    },
    [announce],
  );

  /* 방장 동작 */

  const select = useCallback(() => {
    if (gameRef.current) return;
    commit(createCatchMind(players));
    latest.current.post({ kind: 'system', text: '방장이 캐치마인드를 골랐어요' });
    if (players.includes(BOT.id)) botSay(BOT_LINES.gameSelected, 900);
  }, [commit, players, botSay]);

  const start = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    const ready = setPlayers(current, players);
    if (!canStart(ready)) {
      latest.current.post({ kind: 'private', text: '같이 할 사람이 2명 이상 있어야 시작할 수 있어요' });
      return;
    }
    const step = startGame(ready, Date.now(), pickWord);
    setNow(Date.now());
    commit(step.state, step.events);
  }, [commit, players]);

  const quit = useCallback(() => {
    if (!gameRef.current) return;
    commit(null);
    setStrokes([]);
    latest.current.post({ kind: 'system', text: '게임을 끝냈어요' });
  }, [commit]);

  const toWaiting = useCallback(() => {
    if (gameRef.current) commit(backToWaiting(gameRef.current));
  }, [commit]);

  /* 정답 */

  const guess = useCallback(
    (userId: string, text: string): GuessResult => {
      const current = gameRef.current;
      if (!current) return 'chat';
      const step = submitGuess(current, userId, text, Date.now());
      if (step.state !== current) commit(step.state, step.events);
      return step.result;
    },
    [commit],
  );

  /* 그림 (그리는 사람만) */

  const myTurnToDraw = game?.phase === 'playing' && game.turn?.drawerId === ME.id && game.turn.revealUntil === null;

  const addStroke = useCallback(
    (stroke: Stroke) => {
      if (myTurnToDraw) setStrokes((prev) => [...prev, stroke]);
    },
    [myTurnToDraw],
  );
  const undo = useCallback(() => setStrokes((prev) => prev.slice(0, -1)), []);
  const clear = useCallback(() => setStrokes([]), []);

  /* 대기 중에 사람이 들어오고 나가면 참가자 갱신 */

  const playersKey = players.join(',');
  useEffect(() => {
    const current = gameRef.current;
    if (current && current.phase !== 'playing' && current.players.join(',') !== playersKey) {
      commit(setPlayers(current, playersKey.split(',')));
    }
  }, [playersKey, commit]);

  /* 시간 흐름: 종료 예정 시각을 주기적으로 확인 */

  const playing = game?.phase === 'playing';
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const current = gameRef.current;
      if (!current) return;
      const step = tick(current, t, pickWord);
      if (step.state !== current) commit(step.state, step.events);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, commit]);

  /* 연습 상대가 그리는 차례: 미리 만든 그림을 한 획씩 */

  const turn = game?.phase === 'playing' ? game.turn : null;
  const drawing = turn !== null && turn.revealUntil === null;
  const botDrawWord = drawing && turn.drawerId === BOT.id ? `${game!.round}:${turn.word}` : null;
  useEffect(() => {
    if (!botDrawWord) return;
    const word = botDrawWord.slice(botDrawWord.indexOf(':') + 1);
    const next = createPlayback(BOT_DRAWINGS[word] ?? [], 20_000, BOT_DRAW_TICK_MS);
    const id = window.setInterval(() => {
      const frame = next();
      if (frame === null) window.clearInterval(id);
      else setStrokes(frame);
    }, BOT_DRAW_TICK_MS);
    return () => window.clearInterval(id);
  }, [botDrawWord]);

  /* 내가 그리는 차례: 연습 상대가 가끔 맞혀본다. 시간이 지날수록 잘 맞힌다 */

  const botGuessKey =
    drawing && turn.drawerId === ME.id && game!.players.includes(BOT.id) && !turn.guessedIds.includes(BOT.id)
      ? `${game!.round}:${turn.word}`
      : null;
  useEffect(() => {
    if (!botGuessKey) return;
    let timer = 0;
    let teased = false;
    const schedule = () => {
      timer = window.setTimeout(attempt, 5_000 + Math.random() * 4_000);
    };
    const attempt = () => {
      const current = gameRef.current?.turn;
      if (!current || current.revealUntil !== null) return;
      if (strokesRef.current.length === 0) {
        if (!teased) botSay(BOT_LINES.yourTurnEmpty, 0);
        teased = true;
        schedule();
        return;
      }
      if (Math.random() < botGuessChance(Date.now() - current.startedAt, CATCHMIND_RULES.roundMs)) {
        guess(BOT.id, current.word);
        return;
      }
      botSay(botWrongGuess(current.word, WORDS), 0);
      schedule();
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [botGuessKey, botSay, guess]);

  const view = useMemo(() => (game ? viewFor(game, ME.id, now) : null), [game, now]);

  return { game, view, strokes, select, start, quit, toWaiting, guess, addStroke, undo, clear, canDraw: myTurnToDraw };
}

export type CatchMindController = ReturnType<typeof useCatchMind>;
