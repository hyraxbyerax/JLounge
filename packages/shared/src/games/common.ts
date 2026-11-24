/*
 * 모든 게임이 따르는 공통 틀 (명세 8장).
 * 단계: waiting → playing → result → waiting
 */

export type GamePhase = 'waiting' | 'playing' | 'result';

export type GameCommon = {
  type: string;
  phase: GamePhase;
  /** 이번 판 참가자. 진행 중에 들어온 사람은 다음 판부터 */
  players: string[];
  scores: Record<string, number>;
  round: number;
  totalRounds: number;
};

export type RankEntry = { userId: string; score: number; rank: number };

/** 점수 높은 순. 같은 점수는 같은 등수 */
export function rankPlayers(game: GameCommon): RankEntry[] {
  const sorted = game.players
    .map((userId) => ({ userId, score: game.scores[userId] ?? 0 }))
    .sort((a, b) => b.score - a.score);
  return sorted.map((entry) => ({ ...entry, rank: sorted.findIndex((e) => e.score === entry.score) + 1 }));
}

export const GAME_CATALOG = [
  { type: 'catchmind', name: '캐치마인드', description: '한 사람이 그리고, 나머지가 채팅으로 맞혀요' },
  { type: 'chosung', name: '초성 퀴즈', description: '분류와 초성을 보고 가장 먼저 단어를 맞혀요' },
] as const;

export type GameType = (typeof GAME_CATALOG)[number]['type'];

export const gameName = (type: GameType) => GAME_CATALOG.find((g) => g.type === type)!.name;
