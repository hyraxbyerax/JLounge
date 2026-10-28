/*
 * 캐치마인드 규칙. 화면·시간·난수에 의존하지 않는 순수 함수라서,
 * 서버를 붙일 때 이 파일을 그대로 서버로 옮겨 판정에 쓴다.
 * 시간이 흐르는 처리는 tick()이 "종료 예정 시각"을 확인하는 방식이다 (서버 메모리 타이머 없이).
 */
import { rankPlayers, type GameCommon, type RankEntry } from '../types';

export const CATCHMIND_RULES = {
  totalRounds: 6,
  roundMs: 80_000,
  /** 라운드가 끝나고 정답을 보여주는 시간 */
  revealMs: 4_000,
  /** 남은 시간이 이보다 적으면 첫 글자를 힌트로 보여준다 */
  hintAtRemainingMs: 40_000,
  guessPoints: 10,
  speedBonusMax: 10,
  /** 그린 사람은 맞힌 사람 한 명마다 */
  drawerPoints: 5,
} as const;

export type CatchMindTurn = {
  drawerId: string;
  /** 제시어. 그리는 사람에게만 보낸다 (viewFor 참고) */
  word: string;
  startedAt: number;
  endsAt: number;
  guessedIds: string[];
  /** 정답 공개 중이면 공개가 끝나는 시각 */
  revealUntil: number | null;
};

export type CatchMindState = GameCommon & {
  type: 'catchmind';
  turn: CatchMindTurn | null;
  usedWords: string[];
};

export type CatchMindEvent =
  | { type: 'started' }
  | { type: 'roundStarted'; round: number; drawerId: string }
  | { type: 'correct'; userId: string; points: number }
  | { type: 'roundEnded'; word: string; guessedIds: string[] }
  | { type: 'finished'; ranking: RankEntry[] };

export type Step = { state: CatchMindState; events: CatchMindEvent[] };

/** 그리는 사람에 맞는 제시어를 고른다 (이미 쓴 단어 제외) */
export type PickWord = (drawerId: string, usedWords: string[]) => string;

export type GuessResult =
  /** 정답 */
  | 'correct'
  /** 평범한 채팅으로 보내면 되는 메시지 (오답 포함) */
  | 'chat'
  /** 정답을 흘리는 메시지라 채팅에 올리면 안 됨 (그리는 사람·이미 맞힌 사람) */
  | 'blocked';

const zeroScores = (players: string[]) => Object.fromEntries(players.map((id) => [id, 0]));

export function createCatchMind(players: string[]): CatchMindState {
  return {
    type: 'catchmind',
    phase: 'waiting',
    players,
    scores: zeroScores(players),
    round: 0,
    totalRounds: CATCHMIND_RULES.totalRounds,
    turn: null,
    usedWords: [],
  };
}

/** 대기 중일 때 참가자 목록을 바꾼다 (입장·퇴장). 진행 중이면 다음 판부터 반영 */
export function setPlayers(state: CatchMindState, players: string[]): CatchMindState {
  if (state.phase === 'playing') return state;
  return { ...state, players, scores: zeroScores(players) };
}

export function canStart(state: CatchMindState): boolean {
  return state.phase !== 'playing' && state.players.length >= 2;
}

export function startGame(state: CatchMindState, now: number, pickWord: PickWord): Step {
  if (!canStart(state)) return { state, events: [] };
  const fresh: CatchMindState = { ...state, phase: 'playing', scores: zeroScores(state.players), round: 0, usedWords: [] };
  const next = beginRound(fresh, 1, now, pickWord);
  return { state: next.state, events: [{ type: 'started' }, ...next.events] };
}

function beginRound(state: CatchMindState, round: number, now: number, pickWord: PickWord): Step {
  const drawerId = state.players[(round - 1) % state.players.length]!;
  const word = pickWord(drawerId, state.usedWords);
  return {
    state: {
      ...state,
      round,
      usedWords: [...state.usedWords, word],
      turn: { drawerId, word, startedAt: now, endsAt: now + CATCHMIND_RULES.roundMs, guessedIds: [], revealUntil: null },
    },
    events: [{ type: 'roundStarted', round, drawerId }],
  };
}

/** 띄어쓰기·대소문자 차이는 무시한다 */
export function normalizeAnswer(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

function isDrawing(state: CatchMindState): state is CatchMindState & { turn: CatchMindTurn } {
  return state.phase === 'playing' && state.turn !== null && state.turn.revealUntil === null;
}

export function submitGuess(
  state: CatchMindState,
  userId: string,
  text: string,
  now: number,
): Step & { result: GuessResult } {
  if (!isDrawing(state) || !state.players.includes(userId)) return { state, events: [], result: 'chat' };

  const { turn } = state;
  const answer = normalizeAnswer(turn.word);
  const said = normalizeAnswer(text);
  const knowsAnswer = userId === turn.drawerId || turn.guessedIds.includes(userId);
  if (knowsAnswer) return { state, events: [], result: said.includes(answer) ? 'blocked' : 'chat' };
  if (said !== answer) return { state, events: [], result: 'chat' };

  const remaining = Math.max(turn.endsAt - now, 0);
  const points =
    CATCHMIND_RULES.guessPoints + Math.ceil((remaining / CATCHMIND_RULES.roundMs) * CATCHMIND_RULES.speedBonusMax);
  const scores = {
    ...state.scores,
    [userId]: (state.scores[userId] ?? 0) + points,
    [turn.drawerId]: (state.scores[turn.drawerId] ?? 0) + CATCHMIND_RULES.drawerPoints,
  };
  const guessedIds = [...turn.guessedIds, userId];
  const updated: CatchMindState = { ...state, scores, turn: { ...turn, guessedIds } };
  const events: CatchMindEvent[] = [{ type: 'correct', userId, points }];

  // 그리는 사람을 뺀 모두가 맞히면 라운드를 바로 끝낸다
  const everyoneGuessed = state.players.every((id) => id === turn.drawerId || guessedIds.includes(id));
  if (everyoneGuessed) {
    const ended = endRound(updated, now);
    return { state: ended.state, events: [...events, ...ended.events], result: 'correct' };
  }
  return { state: updated, events, result: 'correct' };
}

function endRound(state: CatchMindState, now: number): Step {
  const turn = state.turn!;
  return {
    state: { ...state, turn: { ...turn, revealUntil: now + CATCHMIND_RULES.revealMs } },
    events: [{ type: 'roundEnded', word: turn.word, guessedIds: turn.guessedIds }],
  };
}

/** 주기적으로 불러서 시간이 지난 라운드를 끝내고 다음 라운드로 넘긴다 */
export function tick(state: CatchMindState, now: number, pickWord: PickWord): Step {
  if (state.phase !== 'playing' || !state.turn) return { state, events: [] };
  const { turn } = state;

  if (turn.revealUntil === null) {
    return now >= turn.endsAt ? endRound(state, now) : { state, events: [] };
  }
  if (now < turn.revealUntil) return { state, events: [] };

  if (state.round < state.totalRounds) return beginRound(state, state.round + 1, now, pickWord);

  const finished: CatchMindState = { ...state, phase: 'result', turn: null };
  return { state: finished, events: [{ type: 'finished', ranking: rankPlayers(finished) }] };
}

export function backToWaiting(state: CatchMindState): CatchMindState {
  return { ...state, phase: 'waiting', round: 0, turn: null };
}

/* 보는 사람별 화면 정보 — 받을 자격이 없는 정보(제시어)는 넣지 않는다 */

export type CatchMindView = {
  phase: CatchMindState['phase'];
  round: number;
  totalRounds: number;
  drawerId: string | null;
  isDrawer: boolean;
  isRevealing: boolean;
  /** 그리는 사람이거나 정답 공개 중일 때만 */
  word: string | null;
  /** 맞히는 사람용: "_ _ _" 또는 시간이 지나면 "사 _ _" */
  hint: string | null;
  remainingSec: number;
  guessedIds: string[];
};

export function viewFor(state: CatchMindState, viewerId: string, now: number): CatchMindView {
  const { turn } = state;
  const isDrawer = turn?.drawerId === viewerId;
  const isRevealing = turn?.revealUntil != null;
  const remainingMs = turn && !isRevealing ? Math.max(turn.endsAt - now, 0) : 0;
  const showWord = turn !== null && (isDrawer || isRevealing || turn.guessedIds.includes(viewerId));

  let hint: string | null = null;
  if (turn && !showWord) {
    const letters = [...turn.word];
    const revealFirst = remainingMs <= CATCHMIND_RULES.hintAtRemainingMs;
    hint = letters.map((ch, i) => (ch === ' ' ? ' ' : revealFirst && i === 0 ? ch : '_')).join(' ');
  }

  return {
    phase: state.phase,
    round: state.round,
    totalRounds: state.totalRounds,
    drawerId: turn?.drawerId ?? null,
    isDrawer,
    isRevealing,
    word: showWord ? turn.word : null,
    hint,
    remainingSec: Math.ceil(remainingMs / 1000),
    guessedIds: turn?.guessedIds ?? [],
  };
}
