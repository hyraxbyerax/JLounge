import { describe, expect, it } from 'vitest';
import {
  createGame,
  gameView,
  guessAnyGame,
  isRoundLive,
  privateView,
  startAnyGame,
  tickAnyGame,
  withPlayers,
  type GameRandom,
} from './index.ts';
import { CATCHMIND_RULES } from './catchmind.ts';

// 방 전체에 보내는 화면(gameView)에는 정답이 절대 들어가면 안 된다. 다른 브라우저로 제시어가 새지 않게 하는 핵심 규칙
const random: GameRandom = {
  pickWord: () => '고양이',
  pickChosung: () => ({ category: '동물', word: '기린' }),
};

describe('캐치마인드 정답 숨기기', () => {
  const started = () => startAnyGame(createGame('catchmind', ['a', 'b', 'c']), 0, random).state;

  it('진행 중에는 모두에게 보내는 화면에 제시어가 없다', () => {
    const view = gameView(started(), 1_000);
    expect(JSON.stringify(view)).not.toContain('고양이');
    expect(view.answer).toBeNull();
    expect(view.drawerId).toBe('a');
  });

  it('제시어는 그리는 사람과 맞힌 사람에게만', () => {
    const s = started();
    expect(privateView(s, 'a')).toEqual({ word: '고양이' });
    expect(privateView(s, 'b')).toBeNull();
    const after = guessAnyGame(s, 'b', '고양이', 1_000);
    expect(after.result).toBe('correct');
    expect(privateView(after.state, 'b')).toEqual({ word: '고양이' });
    expect(privateView(after.state, 'c')).toBeNull();
    expect(JSON.stringify(gameView(after.state, 1_000))).not.toContain('고양이');
  });

  it('그리는 사람이 채팅으로 정답을 말하면 막는다', () => {
    expect(guessAnyGame(started(), 'a', '고양이', 1_000).result).toBe('blocked');
  });

  it('라운드가 끝나 공개할 때만 정답이 보인다', () => {
    const ended = tickAnyGame(started(), CATCHMIND_RULES.roundMs, random).state;
    expect(isRoundLive(ended)).toBe(false);
    expect(gameView(ended, CATCHMIND_RULES.roundMs).answer).toBe('고양이');
  });
});

describe('초성 퀴즈 정답 숨기기', () => {
  it('진행 중에는 초성만, 정답을 받는 사람은 없다', () => {
    const s = startAnyGame(createGame('chosung', ['a', 'b']), 0, random).state;
    expect(JSON.stringify(gameView(s, 0))).not.toContain('기린');
    expect(privateView(s, 'a')).toBeNull();
    expect(privateView(s, 'b')).toBeNull();
  });
});

describe('참가자', () => {
  it('대기 중에는 방에 있는 사람으로 바뀌고, 진행 중에 들어온 사람은 다음 판부터', () => {
    const waiting = createGame('chosung', ['a']);
    expect(withPlayers(waiting, ['a', 'b']).players).toEqual(['a', 'b']);
    const playing = startAnyGame(createGame('chosung', ['a', 'b']), 0, random).state;
    expect(withPlayers(playing, ['a', 'b', 'c']).players).toEqual(['a', 'b']);
  });
});
