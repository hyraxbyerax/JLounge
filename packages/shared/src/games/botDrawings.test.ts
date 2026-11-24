import { describe, expect, it } from 'vitest';
import { BOT_DRAWINGS, createPlayback } from './botDrawings.ts';
import { BOARD_HEIGHT, BOARD_WIDTH } from './drawing.ts';
import { WORDS } from './words.ts';

describe('연습 상대 그림', () => {
  it('모든 그림이 그림판 안에 있다', () => {
    for (const [word, strokes] of Object.entries(BOT_DRAWINGS)) {
      for (const { points } of strokes) {
        for (const [x, y] of points) {
          expect(x, word).toBeGreaterThanOrEqual(0);
          expect(x, word).toBeLessThanOrEqual(BOARD_WIDTH);
          expect(y, word).toBeGreaterThanOrEqual(0);
          expect(y, word).toBeLessThanOrEqual(BOARD_HEIGHT);
        }
      }
    }
  });

  it('그림이 있는 단어는 모두 제시어 목록에 있고 중복이 없다', () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
    for (const word of Object.keys(BOT_DRAWINGS)) expect(WORDS).toContain(word);
  });

  it('재생이 끝나면 원래 그림과 같아진다', () => {
    const drawing = BOT_DRAWINGS['사과']!;
    const next = createPlayback(drawing, 1_000, 50);
    let last = null;
    for (let frame = next(); frame !== null; frame = next()) last = frame;
    expect(last).toEqual(drawing);
  });
});
