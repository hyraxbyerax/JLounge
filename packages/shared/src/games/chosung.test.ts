import { describe, expect, it } from 'vitest';
import {
  CHOSUNG_RULES,
  chosungOf,
  chosungPrompt,
  createChosung,
  startChosung,
  submitChosung,
  tickChosung,
  type PickChosung,
} from './chosung.ts';
import { gameView } from './index.ts';

const pick: PickChosung = (used) => ({ category: '음식', word: used.length === 0 ? '라면' : '떡볶이' });
const started = () => startChosung(createChosung(['a', 'b']), 0, pick).state;
const { roundMs, revealMs } = CHOSUNG_RULES;

describe('초성 뽑기', () => {
  it('한글은 초성만, 그 밖의 글자는 그대로', () => {
    expect(chosungOf('라면')).toBe('ㄹㅁ');
    expect(chosungOf('떡볶이')).toBe('ㄸㅂㅇ');
    expect(chosungOf('A형 간염')).toBe('Aㅎ ㄱㅇ');
  });
});

describe('초성 퀴즈 진행', () => {
  it('혼자서는 시작할 수 없다', () => {
    expect(startChosung(createChosung(['a']), 0, pick).state.phase).toBe('waiting');
  });

  it('문제는 분류와 초성, 남은 시간이 적으면 첫 글자를 열어준다', () => {
    const s = started();
    expect(chosungPrompt(s.turn!)).toBe('음식 · ㄹㅁ');
    const hinted = tickChosung(s, roundMs - CHOSUNG_RULES.hintAtRemainingMs, pick);
    expect(hinted.events).toEqual([{ type: 'hint' }]);
    expect(chosungPrompt(hinted.state.turn!)).toBe('음식 · 라ㅁ');
  });

  it('가장 먼저 맞힌 사람이 점수를 받고 라운드가 끝난다 (띄어쓰기 무시)', () => {
    const step = submitChosung(started(), 'b', '라 면', 0);
    expect(step.result).toBe('correct');
    expect(step.state.scores.b).toBe(CHOSUNG_RULES.points + CHOSUNG_RULES.speedBonusMax);
    expect(step.events.map((e) => e.type)).toEqual(['correct', 'roundEnded']);
    // 공개 중에는 더 맞혀도 점수 없음
    expect(submitChosung(step.state, 'a', '라면', 100).result).toBe('chat');
  });

  it('정답 공개는 모두에게 보이고, 진행 중에는 정답이 보이지 않는다', () => {
    const s = started();
    expect(gameView(s, 0).answer).toBeNull();
    expect(JSON.stringify(gameView(s, 0))).not.toContain('라면');
    const ended = tickChosung(s, roundMs, pick).state;
    expect(gameView(ended, roundMs).answer).toBe('라면');
  });

  it('공개 시간이 지나면 다음 문제, 마지막 라운드 뒤에는 결과', () => {
    let s = started();
    let t = 0;
    for (let round = 1; round <= CHOSUNG_RULES.totalRounds; round++) {
      s = tickChosung(s, (t += roundMs), pick).state;
      const step = tickChosung(s, (t += revealMs), pick);
      s = step.state;
      if (round < CHOSUNG_RULES.totalRounds) expect(s.round).toBe(round + 1);
    }
    expect(s.phase).toBe('result');
    expect(gameView(s, t).ranking).toHaveLength(2);
  });
});
