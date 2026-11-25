import { describe, expect, it } from 'vitest';
import type { RoomInfo } from '../model/room';
import { orderRooms, pageCount, pageView, ROOMS_PER_PAGE } from './building';

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

describe('로비 건물 (한 페이지 3개 층 × 4개)', () => {
  it('먼저 만든 방부터 1층 왼쪽에서 채운다', () => {
    const view = pageView(orderRooms([room('c', 30), room('a', 10), room('b', 20)]), 0);
    expect([view.lowest, view.highest]).toEqual([1, 3]);
    expect(view.floors.map((f) => f.floor)).toEqual([3, 2, 1]);
    expect(view.floors.at(-1)!.rooms.map((r) => r?.id ?? null)).toEqual(['a', 'b', 'c', null]);
    expect(view.floors[0]!.rooms.every((r) => r === null)).toBe(true);
  });

  it('5번째 방은 2층 첫 칸', () => {
    expect(pageView(rooms(5), 0).floors[1]!.rooms[0]?.id).toBe('r04');
  });

  it('12개까지 1페이지, 13번째 방부터 2페이지(4~6층)', () => {
    expect(ROOMS_PER_PAGE).toBe(12);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(12)).toBe(1);
    expect(pageCount(13)).toBe(2);
    const second = pageView(rooms(14), 1);
    expect([second.lowest, second.highest]).toEqual([4, 6]);
    expect(second.floors.at(-1)!.rooms.map((r) => r?.id ?? null)).toEqual(['r12', 'r13', null, null]);
  });
});
