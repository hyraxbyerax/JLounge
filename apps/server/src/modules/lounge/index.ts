/*
 * 라운지 서버 로직의 입구. 방·채팅·음악·게임 처리는 이 폴더 안에 둔다.
 * 상태는 서버 메모리가 아니라 Redis에 둔다 (서버가 여러 대여도 동작하게).
 */
import type { GameRandom } from '@lounge/shared';
import type { Logger } from '../../shared/logger.ts';
import type { Counter } from '../../shared/rateLimit.ts';
import type { RedisConnections } from '../../shared/redis.ts';
import type { IoServer } from '../../shared/realtime/socket.ts';
import { createGameHandlers } from './games/gameHandlers.ts';
import { createGameStore } from './games/gameStore.ts';
import { createMusicHandlers } from './music/musicHandlers.ts';
import { createMusicStore } from './music/musicStore.ts';
import type { MusicSearchProvider } from './music/search.ts';
import { createRoomHandlers } from './rooms/handlers.ts';
import { startPresence } from './rooms/presence.ts';
import { createRoomStore } from './rooms/roomStore.ts';

type Deps = {
  redis: RedisConnections['client'];
  counter: Counter;
  musicSearch: MusicSearchProvider;
  logger: Logger;
  trustProxy: boolean;
  /** 테스트에서 제시어를 정해 두려고 */
  gameRandom?: GameRandom;
};

/** 소켓 이벤트를 붙이고, 주기적인 확인(접속 정리, 다음 곡)을 시작한다. 돌려준 함수로 멈춘다 (종료할 때) */
export function registerLoungeHandlers(
  io: IoServer,
  { redis, counter, musicSearch, logger, trustProxy, gameRandom }: Deps,
): () => void {
  const store = createRoomStore(redis);
  const music = createMusicStore(redis);
  const rooms = createRoomHandlers({ io, store, music, counter, logger, trustProxy });
  const songs = createMusicHandlers({ io, music, rooms, search: musicSearch, logger });
  const games = createGameHandlers({
    io,
    games: createGameStore(redis),
    rooms,
    roomStore: store,
    counter,
    logger,
    random: gameRandom,
  });

  io.on('connection', (socket) => {
    socket.on('time:sync', (ack) => {
      if (typeof ack === 'function') ack({ data: { serverTime: new Date().toISOString() } });
    });
    rooms.register(socket);
    songs.register(socket);
    games.register(socket);
  });

  const stops = [startPresence({ io, store, handlers: rooms, logger }), songs.startTicker(), games.startTicker()];
  return () => stops.forEach((stop) => stop());
}
