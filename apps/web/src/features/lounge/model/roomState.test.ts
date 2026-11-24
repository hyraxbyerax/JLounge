import { describe, expect, it } from 'vitest';
import {
  CHAT_COOLDOWN_MS,
  chatCooldownLeft,
  countsAsChat,
  createRoomState,
  isQuickEmoji,
  parseCommand,
  QUICK_EMOJIS,
  roomReducer,
} from './roomState';

const ME = { id: 'me', nickname: '전북곰' };

describe('방장 명령어 읽기 (판정은 서버)', () => {
  it('음악 명령어는 서버에 보낼 모양으로', () => {
    expect(parseCommand('/skip')).toEqual({ kind: 'music', name: 'skip', args: [] });
    expect(parseCommand('  /move 3 1 ')).toEqual({ kind: 'music', name: 'move', args: [3, 1] });
    expect(parseCommand('/remove 2')).toEqual({ kind: 'music', name: 'remove', args: [2] });
    expect(parseCommand('/endgame')).toEqual({ kind: 'endgame' });
  });

  it('번호가 빠졌거나 모르는 명령어면 나에게만 안내', () => {
    expect(parseCommand('/move 3')).toEqual({ kind: 'invalid', message: '이렇게 써주세요: /move 2 1' });
    expect(parseCommand('/remove 둘')).toEqual({ kind: 'invalid', message: '이렇게 써주세요: /remove 2' });
    expect(parseCommand('/dance').kind).toBe('invalid');
  });
});

describe('서버 채팅 받기', () => {
  it('서버가 보낸 메시지를 붙이고, 같은 메시지가 또 와도 한 번만 남긴다', () => {
    const message = {
      id: 'r:1',
      seq: 1,
      kind: 'user' as const,
      userId: 'a',
      nickname: '가',
      text: '안녕',
      sentAt: '2026-11-25T00:00:00.000Z',
    };
    const once = roomReducer(createRoomState(ME), { type: 'receive', messages: [message] });
    const twice = roomReducer(once, { type: 'receive', messages: [message] });
    expect(twice.messages.map((m) => m.text)).toEqual(['안녕']);
    expect(twice).toBe(once);
  });

  it('나에게만 보이는 안내는 화면에서 붙인다', () => {
    const s = roomReducer(createRoomState(ME, '방을 만들었어요'), {
      type: 'post',
      message: { kind: 'private', text: '방장만 쓸 수 있는 명령어예요' },
    });
    expect(s.messages.map((m) => [m.kind, m.text])).toEqual([
      ['system', '방을 만들었어요'],
      ['private', '방장만 쓸 수 있는 명령어예요'],
    ]);
  });
});

describe('채팅 제한', () => {
  it('보낸 뒤 3초 동안은 기다려야 한다', () => {
    expect(chatCooldownLeft(null, 1000)).toBe(0);
    expect(chatCooldownLeft(1000, 1000)).toBe(CHAT_COOLDOWN_MS);
    expect(chatCooldownLeft(1000, 2500)).toBe(1500);
    expect(chatCooldownLeft(1000, 1000 + CHAT_COOLDOWN_MS)).toBe(0);
  });

  it('명령어와 빈 메시지는 채팅 제한을 받지 않는다', () => {
    expect(countsAsChat('사과')).toBe(true);
    expect(countsAsChat('  /skip ')).toBe(false);
    expect(countsAsChat('   ')).toBe(false);
  });
});

describe('희노애락 이모지', () => {
  it('이모지 버튼 하나만 보낸 메시지를 알아본다', () => {
    expect(QUICK_EMOJIS.map((q) => q.emoji)).toEqual(['😄', '😠', '😢', '🤣']);
    expect(isQuickEmoji('🤣')).toBe(true);
    expect(isQuickEmoji('ㅋㅋ🤣')).toBe(false);
  });
});
