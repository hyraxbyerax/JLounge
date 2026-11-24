/*
 * 라운지 서버 로직의 입구. 방·채팅·음악·게임·친구 처리는 이 폴더 안에 둔다.
 * 상태는 서버 메모리가 아니라 Redis(·친구 관계는 PostgreSQL)에 둔다 (서버가 여러 대여도 동작하게).
 */
import type { GameRandom } from '@lounge/shared';
import type { Pool } from 'pg';
import type { AuthProvider } from '../../shared/auth/AuthProvider.ts';
import type { Logger } from '../../shared/logger.ts';
import type { Counter } from '../../shared/rateLimit.ts';
import type { RedisConnections } from '../../shared/redis.ts';
import { userChannel, type IoServer } from '../../shared/realtime/socket.ts';
import { createActivityStore } from './friends/activity.ts';
import { friendsRouter } from './friends/friendsRoutes.ts';
import { createFriendsSocket } from './friends/friendsSocket.ts';
import { createGameHandlers } from './games/gameHandlers.ts';
import { createGameStore } from './games/gameStore.ts';
import { createMusicHandlers } from './music/musicHandlers.ts';
import { createMusicStore } from './music/musicStore.ts';
import type { MusicSearchProvider } from './music/search.ts';
import { createRoomHandlers } from './rooms/handlers.ts';
import { startPresence } from './rooms/presence.ts';
import { createRoomStore } from './rooms/roomStore.ts';

type Deps = {
  auth: AuthProvider;
  db: Pool;
  redis: RedisConnections['client'];
  counter: Counter;
  musicSearch: MusicSearchProvider;
  logger: Logger;
  trustProxy: boolean;
  /** 테스트에서 제시어를 정해 두려고 */
  gameRandom?: GameRandom;
};

/**
 * 소켓 이벤트를 붙이고, 주기적인 확인(접속 정리, 다음 곡, 게임 진행)을 시작한다.
 * 친구 API 라우터(/api/lounge/friends)와, 확인을 멈추는 함수(종료할 때)를 돌려준다.
 */
export function registerLoungeHandlers(
  io: IoServer,
  { auth, db, redis, counter, musicSearch, logger, trustProxy, gameRandom }: Deps,
) {
  const store = createRoomStore(redis);
  const music = createMusicStore(redis);
  const activity = createActivityStore(redis);
  const rooms = createRoomHandlers({ io, auth, store, music, counter, logger, trustProxy });
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
  const friends = createFriendsSocket({ io, db, redis, activity, roomStore: store, rooms, logger });

  io.on('connection', (socket) => {
    socket.on('time:sync', (ack) => {
      if (typeof ack === 'function') ack({ data: { serverTime: new Date().toISOString() } });
    });
    rooms.register(socket);
    songs.register(socket);
    games.register(socket);
    friends.register(socket);
  });

  const router = friendsRouter({
    auth,
    db,
    activity,
    counter,
    notify: {
      request: (to, from) => io.to(userChannel(to)).emit('friend:request', { from }),
      changed: (to) => io.to(userChannel(to)).emit('friend:changed'),
    },
  });

  const stops = [startPresence({ io, store, handlers: rooms, logger }), songs.startTicker(), games.startTicker()];
  return { friendsRouter: router, stop: () => stops.forEach((stop) => stop()) };
}
