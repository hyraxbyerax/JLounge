import { describe, expect, it } from 'vitest';
import { createMemoryGuestNames, pickGuestName } from './guestNames.ts';
import { GUEST_NAME, randomGuestName } from './localAuth.ts';

describe('게스트 이름', () => {
  it('Guest + 다섯 자리 숫자 (앞자리 0도 채운다)', () => {
    for (let i = 0; i < 200; i++) expect(randomGuestName()).toMatch(/^Guest\d{5}$/);
  });

  it('이미 쓰는 이름이 나오면 다시 뽑는다', async () => {
    const names = createMemoryGuestNames();
    const queue = ['Guest00001', 'Guest00001', 'Guest00002'];
    const pick = () => queue.shift()!;
    expect(await pickGuestName(names, 'guest_a', pick)).toBe('Guest00001');
    expect(await pickGuestName(names, 'guest_b', pick)).toBe('Guest00002');
  });

  it('회원 닉네임으로는 쓸 수 없는 모양인지 알아본다', () => {
    expect(GUEST_NAME.test('Guest12345')).toBe(true);
    expect(GUEST_NAME.test('guest00000')).toBe(true);
    expect(GUEST_NAME.test('Guest1234')).toBe(false);
    expect(GUEST_NAME.test('게스트12345')).toBe(false);
  });
});
