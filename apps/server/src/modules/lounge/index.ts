/*
 * 라운지 서버 로직의 입구. 방·채팅·음악·게임 처리는 이 폴더 안에 둔다.
 * 상태는 서버 메모리가 아니라 Redis에 둔다 (서버가 여러 대여도 동작하게).
 */
import type { Logger } from '../../shared/logger.ts';
import type { Counter } from '../../shared/rateLimit.ts';
import type { RedisConnections } from '../../shared/redis.ts';
import type { IoServer } from '../../shared/realtime/socket.ts';
import { createRoomHandlers } from './rooms/handlers.ts';
import { startPresence } from './rooms/presence.ts';
import { createRoomStore } from './rooms/roomStore.ts';

type Deps = {
  redis: RedisConnections['client'];
  counter: Counter;
  logger: Logger;
  trustProxy: boolean;
};

/** 소켓 이벤트를 붙이고, 접속 확인 청소를 시작한다. 돌려준 함수로 청소를 멈춘다 (종료할 때) */
export function registerLoungeHandlers(io: IoServer, { redis, counter, logger, trustProxy }: Deps): () => void {
  const store = createRoomStore(redis);
  const rooms = createRoomHandlers({ io, store, counter, logger, trustProxy });

  io.on('connection', (socket) => {
    socket.on('time:sync', (ack) => {
      if (typeof ack === 'function') ack({ data: { serverTime: new Date().toISOString() } });
    });
    rooms.register(socket);
  });

  return startPresence({ io, store, handlers: rooms, logger });
}
