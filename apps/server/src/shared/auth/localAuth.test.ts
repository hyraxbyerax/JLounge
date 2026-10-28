import { describe, expect, it } from 'vitest';
import { createGuest, createLocalAuth } from './localAuth.ts';

const auth = createLocalAuth('s'.repeat(32));

describe('로컬 인증', () => {
  it('발급한 토큰을 확인하면 같은 사용자가 나온다', async () => {
    const guest = createGuest();
    const token = await auth.issue(guest);
    expect(await auth.verify(token)).toEqual(guest);
  });

  it('다른 키로 서명했거나 망가진 토큰은 거절한다', async () => {
    const other = createLocalAuth('o'.repeat(32));
    const token = await other.issue(createGuest());
    expect(await auth.verify(token)).toBeNull();
    expect(await auth.verify('not-a-token')).toBeNull();
  });

  it('게스트 ID는 guest_ 로 시작하고 매번 다르다', () => {
    const a = createGuest();
    const b = createGuest();
    expect(a.userId).toMatch(/^guest_/);
    expect(a.userId).not.toBe(b.userId);
    expect(a.isGuest).toBe(true);
  });
});
