/*
 * 게임 공통 틀 (명세 8장): 모든 게임을 같은 방식으로 다룬다. 지금 게임은 캐치마인드 하나.
 * 단계 waiting → playing → result → waiting, 공통 상태(종류·단계·참가자·점수·라운드)는 같은 모양.
 * 서버는 상태 전체를 갖고, 화면에는 gameView(모두에게)와 privateView(받을 자격이 있는 사람에게만)를 보낸다.
 * 게임을 추가하려면 GameState·GameEvent 에 넣고 아래 함수들에서 type 으로 나눈다.
 */
import { z } from 'zod';
import {
  CATCHMIND_RULES,
  createCatchMind,
  setPlayers as setCatchMindPlayers,
  startGame as startCatchMind,
  submitGuess,
  tick as tickCatchMind,
  viewFor,
  type CatchMindEvent,
  type CatchMindState,
  type PickWord,
} from './catchmind.ts';
import { GAME_TYPES, gameName, rankPlayers, type GamePhase, type GameType, type RankEntry } from './common.ts';
import { INKS, type Stroke } from './drawing.ts';
import { WORD_TOPICS, type WordTopic } from './words.ts';

export type GameState = CatchMindState;
export type GameEvent = CatchMindEvent;

/** 모두에게 보내는 게임 화면 정보 (제시어처럼 숨길 것은 넣지 않는다) */
export type GameView = {
  type: GameType;
  name: string;
  phase: GamePhase;
  players: string[];
  scores: Record<string, number>;
  round: number;
  totalRounds: number;
  /** 라운드가 끝나는 서버 시각(ms). 남은 시간은 화면이 계산한다. 대기·결과·정답 공개 중이면 null */
  endsAt: number | null;
  /** 라운드 길이(ms) */
  roundMs: number;
  revealing: boolean;
  /** 그리는 사람 */
  drawerId: string | null;
  /** 이번 라운드에 맞힌 사람 */
  guessedIds: string[];
  /** 맞히는 사람에게 보이는 힌트 "_ _ _" */
  prompt: string | null;
  /** 정답 공개 중에만 */
  answer: string | null;
  /** 결과 단계에서만 */
  ranking: RankEntry[] | null;
  /** 방장이 고른 제시어 주제 */
  topic: WordTopic | null;
};

/** 받을 자격이 있는 사람에게만: 캐치마인드 제시어 (그리는 사람·이미 맞힌 사람) */
export type GamePrivate = { word: string } | null;

export type GameRandom = { pickWord: PickWord };

/** 저장된 상태가 지금 있는 게임인지 (예전 버전의 다른 게임 상태가 Redis에 남아 있을 수 있다) */
export function isKnownGame(state: { type: string } | null | undefined): state is GameState {
  return !!state && (GAME_TYPES as readonly string[]).includes(state.type);
}

export function createGame(_type: GameType, players: string[], topic?: WordTopic): GameState {
  return createCatchMind(players, topic);
}

/** 대기 중에는 지금 방에 있는 사람이 참가자 (진행 중에 들어온 사람은 다음 판부터) */
export function withPlayers(state: GameState, players: string[]): GameState {
  if (state.phase === 'playing') return state;
  return setCatchMindPlayers(state, players);
}

export function startAnyGame(state: GameState, now: number, random: GameRandom, present?: string[]) {
  return startCatchMind(state, now, random.pickWord, present);
}

export function tickAnyGame(
  state: GameState,
  now: number,
  random: GameRandom,
  present?: string[],
): { state: GameState; events: GameEvent[] } {
  return tickCatchMind(state, now, random.pickWord, present);
}

/** 채팅을 정답으로 판정한다. blocked: 정답을 흘리는 말 (그리는 사람·맞힌 사람) */
export function guessAnyGame(
  state: GameState,
  userId: string,
  text: string,
  now: number,
): { state: GameState; events: GameEvent[]; result: 'correct' | 'chat' | 'blocked' } {
  return submitGuess(state, userId, text, now);
}

/** 라운드가 진행 중인지 (정답 공개 중이 아닌) — 채팅 3초 제한, 그림 그리기 */
export function isRoundLive(state: GameState): boolean {
  return state.phase === 'playing' && state.turn !== null && state.turn.revealUntil === null;
}

export function gameView(state: GameState, now: number): GameView {
  const turn = state.turn;
  const revealing = turn?.revealUntil != null;
  // 플레이어가 아닌 사람의 눈으로 본 화면 = 모두에게 보여도 되는 것만
  const view = viewFor(state, '', now);
  return {
    type: state.type,
    name: gameName(state.type),
    phase: state.phase,
    players: state.players,
    scores: state.scores,
    round: state.round,
    totalRounds: state.totalRounds,
    ranking: state.phase === 'result' ? rankPlayers(state) : null,
    topic: state.topic ?? 'all',
    endsAt: turn && !revealing ? turn.endsAt : null,
    roundMs: CATCHMIND_RULES.roundMs,
    revealing,
    drawerId: view.drawerId,
    guessedIds: view.guessedIds,
    prompt: view.hint,
    answer: revealing ? view.word : null,
  };
}

export function privateView(state: GameState, userId: string): GamePrivate {
  if (!state.turn) return null;
  const { turn } = state;
  return turn.drawerId === userId || turn.guessedIds.includes(userId) ? { word: turn.word } : null;
}

/* 입력 검증 */

export const gameSelectInput = z.object({ type: z.enum(GAME_TYPES) });
export const gameTopicInput = z.object({ topic: z.enum(WORD_TOPICS) });

const point = z.tuple([z.number().int().min(-50).max(850), z.number().int().min(-50).max(550)]);
export const strokeInput = z.object({
  ink: z.enum([...INKS, 'paper']),
  width: z.number().min(1).max(40),
  points: z.array(point).min(1).max(2000),
});
export type StrokeInput = z.infer<typeof strokeInput> & Stroke;
