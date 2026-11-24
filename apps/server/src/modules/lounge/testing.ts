/*
 * 통합 테스트용: 실제 Redis + Socket.IO 서버를 띄우고, 사용자별 소켓을 만들어 이벤트를 주고받는다.
 * (테스트 파일에서만 쓴다)
 */
import { createServer, type Server as HttpServer } from 'node:http';
import express from 'express';
import type { Pool } from 'pg';
import { errorHandler } from '../../shared/http/errors.ts';
import type { AddressInfo } from 'node:net';
import type { AckResult, ClientToServerEvents, GameRandom, ServerToClientEvents } from '@lounge/shared';
import { io as connectClient, type Socket } from 'socket.io-client';
import type { AuthUser } from '../../shared/auth/AuthProvider.ts';
import { createLocalAuth } from '../../shared/auth/localAuth.ts';
import { createLogger } from '../../shared/logger.ts';
import { redisCounter } from '../../shared/rateLimit.ts';
import { connectRedis, type RedisConnections } from '../../shared/redis.ts';
import { createSocketServer, type IoServer } from '../../shared/realtime/socket.ts';
import { registerLoungeHandlers } from './index.ts';
import type { MusicSearchProvider } from './music/search.ts';
import { createSampleSearch } from './music/sampleSearch.ts';

export type TestClient = Socket<ServerToClientEvents, ClientToServerEvents> & { user: AuthUser };

export function createHarness(
  redisUrl: string,
  options: { musicSearch?: MusicSearchProvider; gameRandom?: GameRandom; db?: Pool } = {},
) {
  const auth = createLocalAuth('t'.repeat(32));
  const logger = createLogger('error');
  const run = Math.random().toString(36).slice(2, 8);
  let redis: RedisConnections;
  let http: HttpServer;
  let io: IoServer;
  let stop: () => void;
  let base = '';
  const clients: TestClient[] = [];

  async function call<T>(socket: TestClient, event: string, ...args: unknown[]): Promise<AckResult<T>> {
    return new Promise((resolve) => (socket.emit as (...a: unknown[]) => void)(event, ...args, resolve));
  }

  return {
    auth,
    run,
    get redis() {
      return redis;
    },

    async start() {
      redis = await connectRedis(redisUrl, logger);
      // 친구 API(/api/lounge/friends)도 같은 서버에서 받는다 (DB가 있을 때만 쓸 수 있다)
      const app = express();
      app.use(express.json());
      http = createServer(app);
      io = createSocketServer({ httpServer: http, auth, redis, corsOrigins: [], logger });
      const lounge = registerLoungeHandlers(io, {
        auth,
        db: options.db ?? ({} as Pool),
        redis: redis.client,
        counter: redisCounter(redis.client),
        musicSearch: options.musicSearch ?? createSampleSearch(),
        logger,
        trustProxy: false,
        gameRandom: options.gameRandom,
      });
      app.use('/api/lounge/friends', lounge.friendsRouter);
      app.use(errorHandler(logger));
      stop = lounge.stop;
      await new Promise<void>((r) => http.listen(0, r));
      base = `http://localhost:${(http.address() as AddressInfo).port}`;
    },

    /** 이 사람의 토큰으로 HTTP 요청 (친구 API) */
    async http(user: AuthUser, method: string, path: string, body?: unknown) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${await auth.issue(user)}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const json = res.status === 204 ? null : ((await res.json()) as { data?: unknown; error?: { code: string } });
      return { status: res.status, data: json?.data, code: json?.error?.code };
    },

    /** 테스트마다: 남은 방이 없도록 모두 나가고 연결을 끊는다 */
    async cleanup() {
      await Promise.all(clients.map((c) => (c.connected ? call(c, 'room:leave') : null)));
      clients.splice(0).forEach((c) => c.disconnect());
    },

    async stop() {
      stop();
      await io.close();
      await redis.close();
    },

    /** userId 를 정해 주면 그 사람으로 (DB에 있는 회원으로 접속할 때) */
    async connect(name: string, isGuest = true, userId?: string): Promise<TestClient> {
      const user: AuthUser = {
        userId: userId ?? `${isGuest ? 'guest' : 'local'}_${run}_${name}`,
        nickname: name,
        isGuest,
      };
      const socket = connectClient(base, {
        transports: ['websocket'],
        auth: { token: await auth.issue(user) },
      }) as unknown as TestClient;
      clients.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return Object.assign(socket, { user });
    },

    call,

    async ok<T>(socket: TestClient, event: string, ...args: unknown[]): Promise<T> {
      const res = await call<T>(socket, event, ...args);
      if ('error' in res) throw new Error(`${event}: ${res.error.code} ${res.error.message}`);
      return res.data;
    },

    async errorCode(socket: TestClient, event: string, ...args: unknown[]): Promise<string> {
      const res = await call(socket, event, ...args);
      return 'error' in res ? res.error.code : 'OK';
    },

    /** 조건에 맞는 다음 이벤트를 기다린다 */
    next<E extends keyof ServerToClientEvents>(
      socket: TestClient,
      event: E,
      match: (...args: Parameters<ServerToClientEvents[E]>) => boolean = () => true,
    ) {
      return new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) => {
        const handler = (...args: Parameters<ServerToClientEvents[E]>) => {
          if (!match(...args)) return;
          (socket.off as (e: string, h: unknown) => void)(event, handler);
          resolve(args[0]);
        };
        (socket.on as (e: string, h: unknown) => void)(event, handler);
      });
    },
  };
}
