/*
 * 초성 퀴즈 규칙 (두 번째 게임, 2026-11-25 사용자가 맡겨서 정함 — 바꿀 수 있음).
 * 분류와 초성("음식 · ㄹㅁ")을 보고 단어를 채팅으로 맞힌다. 가장 먼저 맞힌 사람이 점수를 받고 라운드가 끝난다.
 * 캐치마인드처럼 화면·시간·난수에 의존하지 않는 순수 함수다 (서버가 판정에 쓴다).
 */
import { rankPlayers, type GameCommon, type RankEntry } from './common.ts';
import { normalizeAnswer } from './catchmind.ts';

export const CHOSUNG_RULES = {
  totalRounds: 10,
  roundMs: 30_000,
  /** 라운드가 끝나고 정답을 보여주는 시간 */
  revealMs: 3_000,
  /** 남은 시간이 이보다 적으면 첫 글자를 열어준다 */
  hintAtRemainingMs: 15_000,
  points: 10,
  speedBonusMax: 10,
} as const;

export type ChosungWord = { word: string; category: string };

export const CHOSUNG_WORDS: ChosungWord[] = [
  { category: '음식', word: '라면' },
  { category: '음식', word: '떡볶이' },
  { category: '음식', word: '김치찌개' },
  { category: '음식', word: '비빔밥' },
  { category: '음식', word: '치킨' },
  { category: '음식', word: '삼겹살' },
  { category: '음식', word: '붕어빵' },
  { category: '음식', word: '아이스크림' },
  { category: '동물', word: '호랑이' },
  { category: '동물', word: '코끼리' },
  { category: '동물', word: '다람쥐' },
  { category: '동물', word: '고양이' },
  { category: '동물', word: '펭귄' },
  { category: '동물', word: '부엉이' },
  { category: '캠퍼스', word: '도서관' },
  { category: '캠퍼스', word: '학생식당' },
  { category: '캠퍼스', word: '기숙사' },
  { category: '캠퍼스', word: '중간고사' },
  { category: '캠퍼스', word: '과제' },
  { category: '캠퍼스', word: '공강' },
  { category: '캠퍼스', word: '수강신청' },
  { category: '캠퍼스', word: '동아리' },
  { category: '물건', word: '노트북' },
  { category: '물건', word: '우산' },
  { category: '물건', word: '충전기' },
  { category: '물건', word: '텀블러' },
  { category: '물건', word: '이어폰' },
  { category: '물건', word: '형광펜' },
  { category: '날씨', word: '무지개' },
  { category: '날씨', word: '눈사람' },
  { category: '날씨', word: '장마' },
  { category: '날씨', word: '소나기' },
  { category: '전주', word: '한옥마을' },
  { category: '전주', word: '비빔밥축제' },
  { category: '전주', word: '덕진공원' },
  { category: '운동', word: '축구' },
  { category: '운동', word: '배드민턴' },
  { category: '운동', word: '줄넘기' },
  { category: '운동', word: '마라톤' },
  { category: '운동', word: '탁구' },
];

const INITIALS = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
];

/** "라면" → "ㄹㅁ". 한글 음절이 아니면 그대로 */
export function chosungOf(word: string): string {
  return [...word]
    .map((ch) => {
      const code = ch.charCodeAt(0) - 0xac00;
      return code >= 0 && code <= 11171 ? INITIALS[Math.floor(code / 588)]! : ch;
    })
    .join('');
}

export type ChosungTurn = {
  word: string;
  category: string;
  startedAt: number;
  endsAt: number;
  /** 맞힌 사람 (없으면 null) */
  winnerId: string | null;
  revealUntil: number | null;
  hintShown?: boolean;
};

export type ChosungState = GameCommon & {
  type: 'chosung';
  turn: ChosungTurn | null;
  usedWords: string[];
};

export type ChosungEvent =
  | { type: 'started' }
  | { type: 'roundStarted'; round: number }
  | { type: 'correct'; userId: string; points: number }
  | { type: 'hint' }
  | { type: 'roundEnded'; word: string; winnerId: string | null }
  | { type: 'finished'; ranking: RankEntry[] };

export type ChosungStep = { state: ChosungState; events: ChosungEvent[] };

/** 이미 쓴 단어 제외하고 하나 */
export type PickChosung = (usedWords: string[]) => ChosungWord;

const zeroScores = (players: string[]) => Object.fromEntries(players.map((id) => [id, 0]));

export function createChosung(players: string[]): ChosungState {
  return {
    type: 'chosung',
    phase: 'waiting',
    players,
    scores: zeroScores(players),
    round: 0,
    totalRounds: CHOSUNG_RULES.totalRounds,
    turn: null,
    usedWords: [],
  };
}

export function startChosung(state: ChosungState, now: number, pick: PickChosung): ChosungStep {
  if (state.phase === 'playing' || state.players.length < 2) return { state, events: [] };
  const fresh: ChosungState = {
    ...state,
    phase: 'playing',
    scores: zeroScores(state.players),
    round: 0,
    usedWords: [],
  };
  const next = beginRound(fresh, 1, now, pick);
  return { state: next.state, events: [{ type: 'started' }, ...next.events] };
}

function beginRound(state: ChosungState, round: number, now: number, pick: PickChosung): ChosungStep {
  const { word, category } = pick(state.usedWords);
  return {
    state: {
      ...state,
      round,
      usedWords: [...state.usedWords, word],
      turn: {
        word,
        category,
        startedAt: now,
        endsAt: now + CHOSUNG_RULES.roundMs,
        winnerId: null,
        revealUntil: null,
      },
    },
    events: [{ type: 'roundStarted', round }],
  };
}

function endRound(state: ChosungState, now: number): ChosungStep {
  const turn = state.turn!;
  return {
    state: { ...state, turn: { ...turn, revealUntil: now + CHOSUNG_RULES.revealMs } },
    events: [{ type: 'roundEnded', word: turn.word, winnerId: turn.winnerId }],
  };
}

/** 정답이면 점수를 주고 라운드를 끝낸다. 아니면 평범한 채팅 */
export function submitChosung(
  state: ChosungState,
  userId: string,
  text: string,
  now: number,
): ChosungStep & { result: 'correct' | 'chat' } {
  const turn = state.turn;
  if (state.phase !== 'playing' || !turn || turn.revealUntil !== null || !state.players.includes(userId)) {
    return { state, events: [], result: 'chat' };
  }
  if (normalizeAnswer(text) !== normalizeAnswer(turn.word)) return { state, events: [], result: 'chat' };

  const remaining = Math.max(turn.endsAt - now, 0);
  const points = CHOSUNG_RULES.points + Math.ceil((remaining / CHOSUNG_RULES.roundMs) * CHOSUNG_RULES.speedBonusMax);
  const won: ChosungState = {
    ...state,
    scores: { ...state.scores, [userId]: (state.scores[userId] ?? 0) + points },
    turn: { ...turn, winnerId: userId },
  };
  const ended = endRound(won, now);
  return { state: ended.state, events: [{ type: 'correct', userId, points }, ...ended.events], result: 'correct' };
}

export function tickChosung(state: ChosungState, now: number, pick: PickChosung): ChosungStep {
  if (state.phase !== 'playing' || !state.turn) return { state, events: [] };
  const { turn } = state;
  if (turn.revealUntil === null) {
    if (now >= turn.endsAt) return endRound(state, now);
    if (!turn.hintShown && turn.endsAt - now <= CHOSUNG_RULES.hintAtRemainingMs) {
      return { state: { ...state, turn: { ...turn, hintShown: true } }, events: [{ type: 'hint' }] };
    }
    return { state, events: [] };
  }
  if (now < turn.revealUntil) return { state, events: [] };
  if (state.round < state.totalRounds) return beginRound(state, state.round + 1, now, pick);
  const finished: ChosungState = { ...state, phase: 'result', turn: null };
  return { state: finished, events: [{ type: 'finished', ranking: rankPlayers(finished) }] };
}

/** 모두에게 보이는 문제: "음식 · ㄹㅁ", 힌트가 열리면 "음식 · 라ㅁ" */
export function chosungPrompt(turn: ChosungTurn): string {
  const initials = [...chosungOf(turn.word)];
  if (turn.hintShown) initials[0] = [...turn.word][0]!;
  return `${turn.category} · ${initials.join('')}`;
}
