import { describe, expect, it } from 'vitest';
import {
  CATCHMIND_RULES,
  createCatchMind,
  drawerLeft,
  startGame,
  submitGuess,
  tick,
  viewFor,
  type CatchMindState,
  type PickWord,
} from './catchmind.ts';

const { roundMs, revealMs, totalRounds } = CATCHMIND_RULES;
const pickWord: PickWord = (_drawer, used) => `단어${used.length + 1}`;

function started(players = ['a', 'b'], now = 0): CatchMindState {
  return startGame(createCatchMind(players), now, pickWord).state;
}

describe('시작', () => {
  it('혼자서는 시작할 수 없다', () => {
    const step = startGame(createCatchMind(['a']), 0, pickWord);
    expect(step.state.phase).toBe('waiting');
  });

  it('1라운드는 첫 참가자가 그린다', () => {
    const s = started();
    expect(s.phase).toBe('playing');
    expect(s.round).toBe(1);
    expect(s.turn?.drawerId).toBe('a');
    expect(s.turn?.word).toBe('단어1');
  });
});

describe('정답 판정', () => {
  it('정답이면 맞힌 사람과 그린 사람이 점수를 받는다 (빠를수록 보너스)', () => {
    const s = started(['a', 'b', 'c']);
    const step = submitGuess(s, 'b', '단어 1', 0);
    expect(step.result).toBe('correct');
    expect(step.state.scores.b).toBe(CATCHMIND_RULES.guessPoints + CATCHMIND_RULES.speedBonusMax);
    expect(step.state.scores.a).toBe(CATCHMIND_RULES.drawerPoints);

    const late = submitGuess(s, 'b', '단어1', roundMs - 1);
    expect(late.state.scores.b).toBe(CATCHMIND_RULES.guessPoints + 1);
  });

  it('오답은 평범한 채팅이다', () => {
    const step = submitGuess(started(), 'b', '사과', 0);
    expect(step.result).toBe('chat');
    expect(step.state.scores.b).toBe(0);
  });

  it('그리는 사람은 맞힐 수 없고, 제시어를 채팅에 쓰면 막는다', () => {
    const s = started();
    expect(submitGuess(s, 'a', '정답은 단어1', 0).result).toBe('blocked');
    expect(submitGuess(s, 'a', '힌트 줄까요?', 0).result).toBe('chat');
  });

  it('이미 맞힌 사람이 다시 정답을 쓰면 점수 없이 막는다', () => {
    const s = submitGuess(started(['a', 'b', 'c']), 'b', '단어1', 0).state;
    const again = submitGuess(s, 'b', '단어1', 1000);
    expect(again.result).toBe('blocked');
    expect(again.state.scores.b).toBe(s.scores.b);
  });

  it('모두 맞히면 라운드가 바로 끝나고 정답을 공개한다', () => {
    const step = submitGuess(started(), 'b', '단어1', 5000);
    expect(step.events.map((e) => e.type)).toEqual(['correct', 'roundEnded']);
    expect(step.state.turn?.revealUntil).toBe(5000 + revealMs);
  });
});

describe('시간 흐름', () => {
  it('시간이 다 되면 라운드가 끝나고, 공개 시간이 지나면 다음 사람이 그린다', () => {
    const s = started();
    expect(tick(s, roundMs - CATCHMIND_RULES.hintAtRemainingMs - 1, pickWord).state).toBe(s);

    const ended = tick(s, roundMs, pickWord);
    expect(ended.events[0]).toMatchObject({ type: 'roundEnded', word: '단어1', guessedIds: [] });

    const next = tick(ended.state, roundMs + revealMs, pickWord);
    expect(next.state.round).toBe(2);
    expect(next.state.turn?.drawerId).toBe('b');
    expect(next.state.turn?.word).toBe('단어2');
  });

  it('남은 시간이 힌트 시점이 되면 한 번만 알린다 (서버가 그때 모두에게 다시 보낸다)', () => {
    const at = roundMs - CATCHMIND_RULES.hintAtRemainingMs;
    const hinted = tick(started(), at, pickWord);
    expect(hinted.events).toEqual([{ type: 'hint' }]);
    expect(tick(hinted.state, at + 1000, pickWord).events).toEqual([]);
  });

  it('방을 나간 사람의 차례는 건너뛰고, 그리던 사람이 나가면 라운드를 바로 끝낸다', () => {
    const s = startGame(createCatchMind(['a', 'b', 'c']), 0, pickWord, ['b', 'c']).state;
    expect(s.turn?.drawerId).toBe('b');
    const left = drawerLeft(s, 'b', 1000);
    expect(left.events[0]).toMatchObject({ type: 'roundEnded' });
    expect(drawerLeft(s, 'c', 1000).events).toEqual([]);
  });

  it('마지막 라운드가 끝나면 결과 단계가 되고 순위를 알려준다', () => {
    let s = started();
    let t = 0;
    for (let round = 1; round <= totalRounds; round++) {
      if (s.turn?.drawerId === 'a') s = submitGuess(s, 'b', s.turn.word, t).state;
      else s = tick(s, (t += roundMs), pickWord).state;
      const step = tick(s, (t += revealMs), pickWord);
      s = step.state;
      if (round === totalRounds) {
        expect(step.events[0]).toMatchObject({ type: 'finished' });
      }
    }
    expect(s.phase).toBe('result');
    expect(s.scores.b).toBeGreaterThan(0);
  });
});

describe('보는 사람별 정보', () => {
  it('제시어는 그리는 사람에게만 보인다', () => {
    const s = started();
    expect(viewFor(s, 'a', 0).word).toBe('단어1');
    expect(viewFor(s, 'b', 0).word).toBeNull();
    expect(viewFor(s, 'b', 0).hint).toBe('_ _ _');
  });

  it('남은 시간이 적으면 첫 글자를 힌트로 준다', () => {
    const s = started();
    const late = roundMs - CATCHMIND_RULES.hintAtRemainingMs;
    expect(viewFor(s, 'b', late).hint).toBe('단 _ _');
  });

  it('정답 공개 중에는 모두에게 보인다', () => {
    const ended = tick(started(), roundMs, pickWord).state;
    expect(viewFor(ended, 'b', roundMs).word).toBe('단어1');
  });
});
