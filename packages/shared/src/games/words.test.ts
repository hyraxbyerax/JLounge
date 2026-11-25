import { describe, expect, it } from 'vitest';
import { BOT_DRAWINGS } from './botDrawings.ts';
import { createCatchMind, setTopic, startGame, type PickWord } from './catchmind.ts';
import { botWordsFor, WORD_TOPICS, WORDS, WORDS_BY_TOPIC, wordsFor } from './words.ts';

describe('제시어 목록', () => {
  it('주제마다 25개 이상, 전체는 중복 없이 모두', () => {
    for (const list of Object.values(WORDS_BY_TOPIC)) expect(list.length).toBeGreaterThanOrEqual(25);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    expect(wordsFor('all')).toBe(WORDS);
  });

  it('주제 안에 같은 단어가 두 번 들어가지 않고, 띄어쓰기 없이 2~6글자', () => {
    for (const list of Object.values(WORDS_BY_TOPIC)) {
      expect(new Set(list).size).toBe(list.length);
    }
    for (const word of WORDS) expect(word).toMatch(/^\S{1,6}$/);
  });

  it('연습 상대가 그릴 수 있는 단어는 모두 어느 주제엔가 들어 있다', () => {
    for (const word of Object.keys(BOT_DRAWINGS)) expect(WORDS).toContain(word);
  });

  it('연습 상대는 주제에 맞는 그림이 있으면 그중에서, 없으면 그릴 수 있는 아무 단어', () => {
    expect(botWordsFor('food')).toEqual(['사과']);
    expect(botWordsFor('campus')).toEqual(Object.keys(BOT_DRAWINGS));
    for (const topic of WORD_TOPICS) {
      for (const word of botWordsFor(topic)) expect(BOT_DRAWINGS[word]).toBeDefined();
    }
  });
});

describe('주제 고르기', () => {
  const seen: string[] = [];
  const pick: PickWord = (_drawer, used, topic) => {
    seen.push(topic);
    return wordsFor(topic).find((w) => !used.includes(w))!;
  };

  it('고른 주제로 제시어를 뽑는다 (기본은 전체)', () => {
    expect(createCatchMind(['a', 'b']).topic).toBe('all');
    const s = startGame(setTopic(createCatchMind(['a', 'b']), 'campus'), 0, pick).state;
    expect(seen.at(-1)).toBe('campus');
    expect(WORDS_BY_TOPIC.campus).toContain(s.turn!.word);
  });

  it('진행 중에는 주제를 바꿀 수 없다', () => {
    const playing = startGame(createCatchMind(['a', 'b']), 0, pick).state;
    expect(setTopic(playing, 'food')).toBe(playing);
  });
});
