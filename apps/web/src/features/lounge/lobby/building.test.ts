import { describe, expect, it } from 'vitest';
import type { RoomInfo } from '../model/room';
import { buildingFloors, orderRooms, pageCount, ROOMS_PER_BUILDING } from './building';

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

describe('공과대학 7호관 로비', () => {
  it('먼저 만든 방부터 1층 101호 → 102호 순으로 채운다', () => {
    const ordered = orderRooms([room('c', 30), room('a', 10), room('b', 20)]);
    const floors = buildingFloors(ordered, 0);
    expect(floors.map((f) => f.floor)).toEqual([6, 5, 4, 3, 2, 1]);
    const first = floors.at(-1)!;
    expect(first.slots.map((s) => s.number)).toEqual(['101호', '102호', '103호', '104호', '105호', '106호']);
    expect(first.slots.slice(0, 3).map((s) => s.room?.id)).toEqual(['a', 'b', 'c']);
    expect(floors[0]!.slots[0]!.number).toBe('601호');
    expect(floors[0]!.slots.every((s) => s.room === null)).toBe(true);
  });

  it('7번째 방은 2층 201호', () => {
    const ordered = orderRooms(Array.from({ length: 7 }, (_, i) => room(`r${i}`, i)));
    const second = buildingFloors(ordered, 0).find((f) => f.floor === 2)!;
    expect(second.slots[0]).toMatchObject({ number: '201호', room: { id: 'r6' } });
  });

  it('36개가 넘으면 다음 페이지(다음 건물)로', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(ROOMS_PER_BUILDING)).toBe(1);
    expect(pageCount(ROOMS_PER_BUILDING + 1)).toBe(2);
    const ordered = orderRooms(Array.from({ length: 40 }, (_, i) => room(`r${String(i).padStart(2, '0')}`, i)));
    const page2 = buildingFloors(ordered, 1);
    expect(
      page2
        .at(-1)!
        .slots.slice(0, 4)
        .map((s) => s.room?.id),
    ).toEqual(['r36', 'r37', 'r38', 'r39']);
    expect(page2.at(-1)!.slots[4]!.room).toBeNull();
  });
});
