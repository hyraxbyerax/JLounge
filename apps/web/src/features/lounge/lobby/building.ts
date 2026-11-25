/*
 * 로비 건물 = 공과대학 7호관 (2026-11-25 사용자 결정).
 * 6층 × 한 층 4호실 = 건물 하나에 24개. 먼저 만든 방부터 101호 → 102호 → … → 104호 → 201호 … 순서로 불이 켜진다.
 * 문을 크게 보이려고 한 화면에는 3개 층씩(1~3층 → 4~6층) 보여주고, 건물이 다 차면 다음 건물로 넘어간다.
 */
import type { RoomInfo } from '../model/room';

export const FLOORS = 6;
export const ROOMS_PER_FLOOR = 4;
export const ROOMS_PER_BUILDING = FLOORS * ROOMS_PER_FLOOR;
/** 한 화면에 보이는 층 수 */
export const FLOORS_PER_VIEW = 3;
const VIEWS_PER_BUILDING = FLOORS / FLOORS_PER_VIEW;

export type Slot = { number: string; room: RoomInfo | null };
export type Floor = { floor: number; slots: Slot[] };
export type View = {
  /** 몇 번째 건물 (0부터) */
  building: number;
  /** 이 화면의 가장 낮은 층·높은 층 */
  lowest: number;
  highest: number;
  /** 화면처럼 위층부터 */
  floors: Floor[];
};

/** 먼저 만든 방이 앞 호실을 지킨다 (만든 시각이 같으면 id 순) */
export function orderRooms(rooms: readonly RoomInfo[]): RoomInfo[] {
  return [...rooms].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function buildingCount(rooms: number): number {
  return Math.max(1, Math.ceil(rooms / ROOMS_PER_BUILDING));
}

/** 전체 화면(페이지) 수: 건물마다 [1~3층], [4~6층] 두 화면 */
export function viewCount(rooms: number): number {
  return buildingCount(rooms) * VIEWS_PER_BUILDING;
}

/** 호실 번호: 층 + 두 자리 (1층 첫 방 = 101호) */
export const roomNumber = (floor: number, index: number) => `${floor}${String(index + 1).padStart(2, '0')}호`;

/** 화면 하나: 건물 안에서는 아래층 화면(1~3층)이 먼저. 방은 1층부터 채운다 */
export function buildingView(ordered: readonly RoomInfo[], view: number): View {
  const building = Math.floor(view / VIEWS_PER_BUILDING);
  const part = view % VIEWS_PER_BUILDING;
  const lowest = part * FLOORS_PER_VIEW + 1;
  const highest = lowest + FLOORS_PER_VIEW - 1;
  const inBuilding = ordered.slice(building * ROOMS_PER_BUILDING, (building + 1) * ROOMS_PER_BUILDING);
  const floors: Floor[] = [];
  for (let floor = highest; floor >= lowest; floor--) {
    const slots: Slot[] = [];
    for (let i = 0; i < ROOMS_PER_FLOOR; i++) {
      slots.push({ number: roomNumber(floor, i), room: inBuilding[(floor - 1) * ROOMS_PER_FLOOR + i] ?? null });
    }
    floors.push({ floor, slots });
  }
  return { building, lowest, highest, floors };
}
