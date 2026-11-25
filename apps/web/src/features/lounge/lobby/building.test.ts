import { describe, expect, it } from 'vitest';
import type { RoomInfo } from '../model/room';
import { buildingCount, buildingView, orderRooms, ROOMS_PER_BUILDING, viewCount } from './building';

const room = (id: string, createdAt: number): RoomInfo => ({
  id,
  code: id.toUpperCase().padEnd(6, 'X'),
  name: `${id}님의 방`,
  hasPassword: false,
  locked: false,
  members: 1,
  maxMembers: 8,
  game: null,
  nowPlaying: null,
  createdAt,
});
const rooms = (n: number) => orderRooms(Array.from({ length: n }, (_, i) => room(`r${String(i).padStart(2, '0')}`, i)));

describe('공과대학 7호관 로비 (6층 × 한 층 4호실, 한 화면에 3개 층)', () => {
  it('첫 화면은 1~3층, 먼저 만든 방부터 101호 → 102호', () => {
    const view = buildingView(orderRooms([room('c', 30), room('a', 10), room('b', 20)]), 0);
    expect([view.lowest, view.highest]).toEqual([1, 3]);
    expect(view.floors.map((f) => f.floor)).toEqual([3, 2, 1]);
    const ground = view.floors.at(-1)!;
    expect(ground.slots.map((s) => s.number)).toEqual(['101호', '102호', '103호', '104호']);
    expect(ground.slots.slice(0, 3).map((s) => s.room?.id)).toEqual(['a', 'b', 'c']);
  });

  it('5번째 방은 2층 201호, 두 번째 화면은 4~6층', () => {
    expect(buildingView(rooms(5), 0).floors.find((f) => f.floor === 2)!.slots[0]).toMatchObject({
      number: '201호',
      room: { id: 'r04' },
    });
    const upper = buildingView(rooms(13), 1);
    expect(upper.floors.map((f) => f.floor)).toEqual([6, 5, 4]);
    expect(upper.floors.at(-1)!.slots[0]).toMatchObject({ number: '401호', room: { id: 'r12' } });
  });

  it('건물마다 두 화면, 24개가 넘으면 다음 건물', () => {
    expect(ROOMS_PER_BUILDING).toBe(24);
    expect(viewCount(0)).toBe(2);
    expect(viewCount(24)).toBe(2);
    expect(buildingCount(25)).toBe(2);
    expect(viewCount(25)).toBe(4);
    const next = buildingView(rooms(26), 2);
    expect(next.building).toBe(1);
    expect(
      next.floors
        .at(-1)!
        .slots.slice(0, 3)
        .map((s) => s.room?.id),
    ).toEqual(['r24', 'r25', undefined]);
  });
});
