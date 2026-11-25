/*
 * 로비 건물 (2026-11-25 사용자 결정: 층·호실 번호는 화면에 적지 않고, 불 켜진 방인지 빈 강의실인지만).
 * 한 페이지 = 복도 3줄 × 한 줄 4개 = 12개. 먼저 만든 방부터 아래 복도 왼쪽에서 채우고,
 * 방이 12개를 넘으면 페이지가 하나 늘어난다. (floor 값은 화면 순서·key 용으로만 쓴다)
 */
import type { RoomInfo } from '../model/room';

export const ROOMS_PER_FLOOR = 4;
export const FLOORS_PER_PAGE = 3;
export const ROOMS_PER_PAGE = ROOMS_PER_FLOOR * FLOORS_PER_PAGE;

export type Floor = { floor: number; rooms: (RoomInfo | null)[] };
export type PageView = {
  /** 이 페이지의 가장 낮은 층·높은 층 */
  lowest: number;
  highest: number;
  /** 화면처럼 위층부터 */
  floors: Floor[];
};

/** 먼저 만든 방이 앞(아래층 왼쪽)에 온다 (만든 시각이 같으면 id 순) */
export function orderRooms(rooms: readonly RoomInfo[]): RoomInfo[] {
  return [...rooms].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** 페이지 수: 12개까지 1페이지, 13개부터 2페이지 … */
export function pageCount(rooms: number): number {
  return Math.max(1, Math.ceil(rooms / ROOMS_PER_PAGE));
}

export function pageView(ordered: readonly RoomInfo[], page: number): PageView {
  const onPage = ordered.slice(page * ROOMS_PER_PAGE, (page + 1) * ROOMS_PER_PAGE);
  const lowest = page * FLOORS_PER_PAGE + 1;
  const highest = lowest + FLOORS_PER_PAGE - 1;
  const floors: Floor[] = [];
  for (let floor = highest; floor >= lowest; floor--) {
    const start = (floor - lowest) * ROOMS_PER_FLOOR;
    floors.push({
      floor,
      rooms: Array.from({ length: ROOMS_PER_FLOOR }, (_, i) => onPage[start + i] ?? null),
    });
  }
  return { lowest, highest, floors };
}
