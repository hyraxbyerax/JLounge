/*
 * 방에 있는 사람이 아직 접속해 있는지 확인하고, 사라진 사람을 내보낸다.
 * 서버 메모리 대신 Redis(rooms:alive)에 "마지막 확인 시각"을 두므로, 어느 서버가 꺼져도
 * 남은 서버가 대신 정리한다. 같은 사람을 두 서버가 동시에 처리하지 않게 꺼낼 때 원자적으로 꺼낸다.
 */
import type { Logger } from '../../../shared/logger.ts';
import type { IoServer } from '../../../shared/realtime/socket.ts';
import { socketRoomId } from './channels.ts';
import type { RoomHandlers } from './handlers.ts';
import type { RoomStore } from './roomStore.ts';

/** 이 시간 동안 확인이 안 되면 나간 것으로 본다 (서버가 갑자기 꺼진 경우) */
export const ALIVE_TIMEOUT_MS = 30_000;
/** 탭을 닫은 사람은 이만큼만 기다린다 (새로고침으로 돌아올 시간) */
export const DISCONNECT_GRACE_MS = 5_000;
/** 내 서버에 붙은 사람들의 확인 시각을 갱신하는 주기 */
const REFRESH_MS = 10_000;
/** 기한 지난 사람을 찾는 주기 */
const SWEEP_MS = 2_000;

type Deps = {
  io: IoServer;
  store: RoomStore;
  handlers: RoomHandlers;
  logger: Logger;
  now?: () => number;
};

export function startPresence({ io, store, handlers, logger, now = Date.now }: Deps): () => void {
  async function refresh() {
    const at = now();
    for (const socket of await io.local.fetchSockets()) {
      const roomId = socketRoomId(socket);
      if (roomId) await store.touch(roomId, socket.data.user.userId, at);
    }
  }

  async function sweep() {
    for (const { roomId, userId } of await store.takeExpired(now() - ALIVE_TIMEOUT_MS)) {
      // 다른 탭·다른 서버로 아직 붙어 있으면 그대로 둔다
      if (await handlers.stillConnected(roomId, userId)) {
        await store.touch(roomId, userId, now());
        continue;
      }
      await handlers.expire(roomId, userId);
    }
  }

  const guard = (name: string, task: () => Promise<void>) => () => {
    task().catch((err: unknown) => logger.warn(`접속 확인 ${name} 실패`, { err }));
  };
  const timers = [setInterval(guard('갱신', refresh), REFRESH_MS), setInterval(guard('청소', sweep), SWEEP_MS)];
  return () => timers.forEach(clearInterval);
}
