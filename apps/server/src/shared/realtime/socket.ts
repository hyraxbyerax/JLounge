import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import type { AuthProvider, AuthUser } from '../auth/AuthProvider.ts';
import type { Logger } from '../logger.ts';
import type { RedisConnections } from '../redis.ts';
import type { ClientToServerEvents, ServerToClientEvents } from './events.ts';

export type SocketData = { user: AuthUser };
export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

type Options = {
  httpServer: HttpServer;
  auth: AuthProvider;
  redis: Pick<RedisConnections, 'pub' | 'sub'>;
  corsOrigins: string[];
  logger: Logger;
};

/**
 * Socket.IO 서버.
 * - 서버가 여러 대여도 같은 방에 메시지가 가도록 Redis 어댑터를 쓴다.
 * - 고정 세션(sticky session) 없이 동작하도록 websocket 전송만 쓴다.
 * - 연결할 때 토큰을 확인해 socket.data.user 에 넣는다.
 */
export function createSocketServer({ httpServer, auth, redis, corsOrigins, logger }: Options): IoServer {
  const io: IoServer = new Server(httpServer, {
    transports: ['websocket'],
    adapter: createAdapter(redis.pub, redis.sub),
    cors: corsOrigins.length > 0 ? { origin: corsOrigins } : undefined,
  });

  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth.token;
    const user = typeof token === 'string' ? await auth.verify(token) : null;
    if (!user) {
      next(Object.assign(new Error('UNAUTHORIZED'), { data: { code: 'UNAUTHORIZED', message: '다시 접속해주세요' } }));
      return;
    }
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const log = logger.child({ socketId: socket.id, userId: socket.data.user.userId });
    log.debug('소켓 연결');
    socket.on('disconnect', (reason) => log.debug('소켓 연결 끊김', { reason }));
  });

  return io;
}
