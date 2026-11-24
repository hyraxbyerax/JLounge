import { describe, expect, it } from 'vitest';
import { botReply } from './bot.ts';
import { chatSendInput, roomCreateInput, roomJoinInput, roomUpdateInput } from './lounge.ts';

const valid = { name: '공강방', isPublic: true, password: null, locked: false, maxMembers: 8 };

describe('방 입력 검증', () => {
  it('정상 입력은 통과하고 이름 앞뒤 공백을 지운다', () => {
    expect(roomCreateInput.parse({ ...valid, name: '  공강방  ' }).name).toBe('공강방');
  });

  it('이름은 1~20자, 인원은 2~12명', () => {
    expect(roomCreateInput.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(roomCreateInput.safeParse({ ...valid, name: 'a'.repeat(21) }).success).toBe(false);
    expect(roomCreateInput.safeParse({ ...valid, maxMembers: 1 }).success).toBe(false);
    expect(roomCreateInput.safeParse({ ...valid, maxMembers: 13 }).success).toBe(false);
    expect(roomCreateInput.safeParse({ ...valid, maxMembers: 2.5 }).success).toBe(false);
  });

  it('비밀번호: 만들 때는 null 또는 문자열, 바꿀 때는 생략(그대로)도 된다', () => {
    expect(roomCreateInput.safeParse({ ...valid, password: '' }).success).toBe(false);
    expect(roomCreateInput.safeParse({ ...valid, password: undefined }).success).toBe(false);
    expect(roomUpdateInput.parse({ ...valid, password: undefined }).password).toBeUndefined();
    expect(roomUpdateInput.parse({ ...valid, password: null }).password).toBeNull();
  });

  it('방 코드는 대소문자 상관없이 6자리', () => {
    expect(roomJoinInput.parse({ code: ' ab12cd ' }).code).toBe('AB12CD');
    expect(roomJoinInput.safeParse({ code: 'ABC' }).success).toBe(false);
    expect(roomJoinInput.safeParse({ code: 'ABC-12' }).success).toBe(false);
  });
});

describe('채팅 입력 검증', () => {
  it('공백만 있거나 200자를 넘으면 거부', () => {
    expect(chatSendInput.safeParse({ text: '   ' }).success).toBe(false);
    expect(chatSendInput.safeParse({ text: 'a'.repeat(201) }).success).toBe(false);
    expect(chatSendInput.parse({ text: ' 안녕 ' }).text).toBe('안녕');
  });
});

describe('연습 상대 대답', () => {
  it('인사·게임·음악에는 항상 대답하고, 그 밖에는 가끔만', () => {
    expect(botReply('안녕하세요')).toBe('안녕하세요 😊');
    expect(botReply('게임 할래?')).toContain('캐치마인드');
    expect(botReply('노래 틀어줘')).toContain('곡 신청');
    expect(botReply('오늘 날씨', () => 0.9)).toBeNull();
    expect(botReply('오늘 날씨', () => 0.1)).not.toBeNull();
  });
});
