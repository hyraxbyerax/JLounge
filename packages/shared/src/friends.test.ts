import { describe, expect, it } from 'vitest';
import { friendRequestInput } from './friends.ts';

describe('친구 요청 입력', () => {
  it('친구 코드는 대문자 8자리로 맞춘다', () => {
    expect(friendRequestInput.parse({ friendCode: ' ab12cd34 ' }).friendCode).toBe('AB12CD34');
    expect(friendRequestInput.safeParse({ friendCode: 'ABC' }).success).toBe(false);
  });

  it('닉네임은 앞뒤 공백을 지우고 20자까지', () => {
    expect(friendRequestInput.parse({ nickname: ' 새벽코딩 ' }).nickname).toBe('새벽코딩');
    expect(friendRequestInput.safeParse({ nickname: '가'.repeat(21) }).success).toBe(false);
  });

  it('누구에게 보낼지 하나는 있어야 한다', () => {
    expect(friendRequestInput.safeParse({}).success).toBe(false);
    expect(friendRequestInput.safeParse({ userId: 'u_1' }).success).toBe(true);
  });
});
