import { BOT_DRAWINGS } from './botDrawings';

/** 사람이 그릴 때 쓰는 제시어 */
export const WORDS = [
  ...Object.keys(BOT_DRAWINGS),
  '고양이',
  '강아지',
  '기린',
  '토끼',
  '거북이',
  '비행기',
  '기차',
  '자전거',
  '로켓',
  '피자',
  '햄버거',
  '바나나',
  '수박',
  '시계',
  '연필',
  '책',
  '노트북',
  '무지개',
  '구름',
  '라면',
];

export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T {
  return items[Math.floor(random() * items.length)]!;
}

/** 아직 안 쓴 단어 중 하나. 다 썼으면 아무거나 */
export function pickUnused(
  pool: readonly string[],
  used: readonly string[],
  random: () => number = Math.random,
): string {
  const fresh = pool.filter((w) => !used.includes(w));
  return pickRandom(fresh.length > 0 ? fresh : pool, random);
}
