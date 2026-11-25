/*
 * 로비 건물 = 공과대학 7호관 (2026-11-25 사용자 결정).
 * 6층 × 한 층 5호실 = 건물 하나에 30개. 먼저 만든 방부터 101호 → 102호 → … → 105호 → 201호 … 순서로 불이 켜지고,
 * 30개가 넘으면 다음 페이지(또 하나의 건물)로 넘어간다.
 */
import type { RoomInfo } from '../model/room';

export const FLOORS = 6;
export const ROOMS_PER_FLOOR = 5;
export const ROOMS_PER_BUILDING = FLOORS * ROOMS_PER_FLOOR;

export type Slot = { number: string; room: RoomInfo | null };
export type Floor = { floor: number; slots: Slot[] };

/** 먼저 만든 방이 앞 호실을 지킨다 (만든 시각이 같으면 id 순) */
export function orderRooms(rooms: readonly RoomInfo[]): RoomInfo[] {
  return [...rooms].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function pageCount(rooms: number): number {
  return Math.max(1, Math.ceil(rooms / ROOMS_PER_BUILDING));
}

/** 호실 번호: 층 + 두 자리 (1층 첫 방 = 101호) */
export const roomNumber = (floor: number, index: number) => `${floor}${String(index + 1).padStart(2, '0')}호`;

/** 한 페이지(건물 하나)의 층들. 화면처럼 위층부터 (6층 → 1층), 방은 1층부터 채운다 */
export function buildingFloors(ordered: readonly RoomInfo[], page: number): Floor[] {
  const onPage = ordered.slice(page * ROOMS_PER_BUILDING, (page + 1) * ROOMS_PER_BUILDING);
  const floors: Floor[] = [];
  for (let floor = FLOORS; floor >= 1; floor--) {
    const slots: Slot[] = [];
    for (let i = 0; i < ROOMS_PER_FLOOR; i++) {
      slots.push({ number: roomNumber(floor, i), room: onPage[(floor - 1) * ROOMS_PER_FLOOR + i] ?? null });
    }
    floors.push({ floor, slots });
  }
  return floors;
}
