import { describe, expect, it } from 'vitest';
import { brightness, isEnterable, sortRooms, toMembers, windowState, type RoomInfo } from './room';

const room = (over: Partial<RoomInfo> = {}): RoomInfo => ({
  id: 'r',
  code: 'ABC123',
  name: '방',
  hasPassword: false,
  locked: false,
  members: 2,
  maxMembers: 6,
  game: null,
  nowPlaying: null,
  ...over,
});

describe('로비 창문', () => {
  it('잠금 > 가득 참 > 게임 중 > 입장 가능 순으로 상태를 정한다', () => {
    expect(windowState(room({ locked: true, members: 6 }))).toBe('locked');
    expect(windowState(room({ members: 6 }))).toBe('full');
    expect(windowState(room({ game: '캐치마인드' }))).toBe('game');
    expect(windowState(room())).toBe('open');
    expect(isEnterable(room({ game: '캐치마인드' }))).toBe(true);
    expect(isEnterable(room({ members: 6 }))).toBe(false);
  });

  it('입장 가능한 방이 앞, 가득 찬 방, 잠긴 방이 뒤', () => {
    const sorted = sortRooms([
      room({ id: 'locked', locked: true }),
      room({ id: 'full', members: 6 }),
      room({ id: 'open' }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['open', 'full', 'locked']);
  });

  it('인원이 많을수록 밝다', () => {
    expect(brightness(room({ members: 1 }))).toBe(1);
    expect(brightness(room({ members: 3 }))).toBe(2);
    expect(brightness(room({ members: 5 }))).toBe(3);
  });
});

describe('참가자 목록', () => {
  it('서버가 준 순서 그대로, 방장·연습 상대를 표시한다', () => {
    const members = toMembers({
      id: 'r',
      code: 'ABC123',
      name: '방',
      isPublic: true,
      hasPassword: false,
      locked: false,
      maxMembers: 6,
      hostId: 'b',
      members: [
        { userId: 'a', nickname: '가', isGuest: true, isBot: false },
        { userId: 'b', nickname: '나', isGuest: false, isBot: false },
        { userId: 'bot', nickname: '새벽코딩', isGuest: true, isBot: true },
      ],
    });
    expect(members.map((m) => [m.id, m.isHost, m.isBot])).toEqual([
      ['a', false, false],
      ['b', true, false],
      ['bot', false, true],
    ]);
  });
});
