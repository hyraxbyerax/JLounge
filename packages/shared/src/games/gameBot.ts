/*
 * 연습 상대가 게임 안에서 하는 일 (순수 함수 — 서버가 매초 확인할 때 쓴다).
 * - 캐치마인드에서 그릴 차례: 미리 만든 그림을 20초에 걸쳐 한 획씩
 * - 맞히는 차례: 처음엔 엉뚱한 오답, 시간이 지날수록 맞힐 확률이 오른다
 */
import { pickRandom } from './words.ts';

/** 연습 상대가 그림을 다 그리는 데 걸리는 시간 */
export const BOT_DRAW_MS = 20_000;

/** 그리기 시작한 지 elapsedMs 지났을 때까지 보여줄 획 수 */
export function botStrokesDue(totalStrokes: number, elapsedMs: number): number {
  if (totalStrokes === 0) return 0;
  return Math.min(totalStrokes, Math.max(1, Math.ceil((elapsedMs / BOT_DRAW_MS) * totalStrokes)));
}

/** 엉뚱한 오답 (정답이 아닌 단어) */
export function botWrongGuess(answer: string, pool: readonly string[], random: () => number = Math.random): string {
  const candidates = pool.filter((w) => w !== answer);
  const word = pickRandom(candidates, random);
  return random() < 0.3 ? `${word}?` : word;
}

/** 라운드가 elapsedMs 만큼 지났을 때 맞힐 확률 */
export function botGuessChance(elapsedMs: number, roundMs: number): number {
  return Math.min(0.85, 0.08 + (elapsedMs / roundMs) * 0.9);
}

/** 다음에 맞혀볼 시각까지 기다리는 시간 (5~9초) */
export const botGuessDelay = (random: () => number = Math.random) => 5_000 + random() * 4_000;
