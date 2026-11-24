/*
 * 연습 상대(가상 사람) "새벽코딩". 방장이 부르면 서버 쪽 참가자로 들어오고 채팅 대답은 서버가 한다.
 * 3단계 전까지 캐치마인드는 방장 화면 안에서 돌기 때문에, 게임 속 행동(오답·정답 확률)만 여기에 둔다.
 */
import { pickRandom } from '../game/catchmind/words';

export { BOT, BOT_LINES } from '@lounge/shared';

/** 엉뚱한 오답 (정답이 아닌 단어) */
export function botWrongGuess(answer: string, pool: readonly string[], random: () => number = Math.random): string {
  const candidates = pool.filter((w) => w !== answer);
  const word = pickRandom(candidates, random);
  return random() < 0.3 ? `${word}?` : word;
}

/** 내가 그리는 동안 시간이 지날수록 맞힐 확률이 오른다 */
export function botGuessChance(elapsedMs: number, roundMs: number): number {
  return Math.min(0.85, 0.08 + (elapsedMs / roundMs) * 0.9);
}
