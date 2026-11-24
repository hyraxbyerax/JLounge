// 실제 Redis(Valkey) + Socket.IO 로 방 입장 조건·방장 권한·채팅을 확인한다.
// 실행: TEST_REDIS_URL=redis://localhost:6379 npm run test   (없으면 건너뛴다)
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  AckResult,
  ClientToServerEvents,
  RoomJoined,
  RoomSummary,
  RoomView,
  ServerChatMessage,
  ServerToClientEvents,
} from '@lounge/shared';
import { io as connectClient, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser } from '../../../shared/auth/AuthProvider.ts';
import { createLocalAuth } from '../../../shared/auth/localAuth.ts';
import { createLogger } from '../../../shared/logger.ts';
import { redisCounter } from '../../../shared/rateLimit.ts';
import { connectRedis, type RedisConnections } from '../../../shared/redis.ts';
import { createSocketServer, type IoServer } from '../../../shared/realtime/socket.ts';
import { registerLoungeHandlers } from '../index.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const url = process.env.TEST_REDIS_URL;
const auth = createLocalAuth('t'.repeat(32));
const logger = createLogger('error');
const run = Math.random().toString(36).slice(2, 8);

let redis: RedisConnections;
let http: HttpServer;
let io: IoServer;
let stop: () => void;
let base: string;
const clients: Client[] = [];

async function connect(name: string, isGuest = true): Promise<Client & { user: AuthUser }> {
  const user: AuthUser = { userId: `${isGuest ? 'guest' : 'local'}_${run}_${name}`, nickname: name, isGuest };
  const socket = connectClient(base, { transports: ['websocket'], auth: { token: await auth.issue(user) } }) as Client;
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return Object.assign(socket, { user });
}

/** 응답 콜백을 기다려 { data } / { error } 를 돌려준다 */
function call<T>(socket: Client, event: string, ...args: unknown[]): Promise<AckResult<T>> {
  return new Promise((resolve) => (socket.emit as (...a: unknown[]) => void)(event, ...args, resolve));
}
async function ok<T>(socket: Client, event: string, ...args: unknown[]): Promise<T> {
  const res = await call<T>(socket, event, ...args);
  if ('error' in res) throw new Error(`${event}: ${res.error.code} ${res.error.message}`);
  return res.data;
}
async function errorCode(socket: Client, event: string, ...args: unknown[]): Promise<string> {
  const res = await call(socket, event, ...args);
  return 'error' in res ? res.error.code : 'OK';
}

function next<E extends keyof ServerToClientEvents>(
  socket: Client,
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
}

const settings = (over: Record<string, unknown> = {}) => ({
  name: `테스트방 ${run}`,
  isPublic: true,
  password: null,
  locked: false,
  maxMembers: 4,
  ...over,
});

describe.skipIf(!url)('방과 채팅 (TEST_REDIS_URL 이 있을 때만)', () => {
  beforeAll(async () => {
    redis = await connectRedis(url!, logger);
    http = createServer();
    io = createSocketServer({ httpServer: http, auth, redis, corsOrigins: [], logger });
    stop = registerLoungeHandlers(io, {
      redis: redis.client,
      counter: redisCounter(redis.client),
      logger,
      trustProxy: false,
    });
    await new Promise<void>((r) => http.listen(0, r));
    base = `http://localhost:${(http.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    // 남은 방이 없도록 모두 나간다
    await Promise.all(clients.map((c) => (c.connected ? call(c, 'room:leave') : null)));
    clients.splice(0).forEach((c) => c.disconnect());
  });

  afterAll(async () => {
    stop();
    await io.close();
    await redis.close();
  });

  it('방을 만들면 로비에 나타나고, 다른 사람이 코드로 들어오면 입장 메시지와 참가자가 갱신된다', async () => {
    const host = await connect('방장');
    const watcher = await connect('구경꾼');
    await ok<RoomSummary[]>(watcher, 'lobby:watch');

    const lobbyUpdate = next(watcher, 'lobby:rooms', (rooms) => rooms.some((r) => r.name === `테스트방 ${run}`));
    const created = await ok<RoomJoined>(host, 'room:create', settings());
    expect(created.room.hostId).toBe(host.user.userId);
    expect(created.room.code).toMatch(/^[A-Z0-9]{6}$/);
    expect((await lobbyUpdate).find((r) => r.id === created.room.id)?.members).toBe(1);

    const guest = await connect('손님');
    const hostSees = next(host, 'chat:message', (m) => m.kind === 'system');
    const joined = await ok<RoomJoined>(guest, 'room:join', { code: created.room.code.toLowerCase() });
    expect(joined.room.members.map((m) => m.nickname)).toEqual(['방장', '손님']);
    // 들어온 사람은 들어온 뒤의 메시지만 받는다 (자기 입장 메시지부터)
    expect(joined.messages.map((m) => m.text)).toEqual(['손님님이 들어왔어요']);
    expect((await hostSees).text).toBe('손님님이 들어왔어요');
  });

  it('입장 조건: 비공개방은 로비에 안 보이고, 정원·자물쇠·없는 코드는 막는다', async () => {
    const host = await connect('방장');
    const room = (await ok<RoomJoined>(host, 'room:create', settings({ isPublic: false, maxMembers: 2 }))).room;
    expect((await ok<RoomSummary[]>(host, 'lobby:watch')).some((r) => r.id === room.id)).toBe(false);

    const a = await connect('가');
    await ok(a, 'room:join', { code: room.code });
    const b = await connect('나');
    expect(await errorCode(b, 'room:join', { code: room.code })).toBe('ROOM_FULL');
    expect(await errorCode(b, 'room:join', { code: 'ZZZZZZ' })).toBe('ROOM_NOT_FOUND');

    await ok(host, 'room:update', { ...settings({ isPublic: false, maxMembers: 3 }), locked: true });
    expect(await errorCode(b, 'room:join', { code: room.code })).toBe('ROOM_LOCKED');
  });

  it('비밀번호: 틀리면 남은 횟수를 알려주고 5번 틀리면 잠근다. 맞으면 들어간다', async () => {
    const host = await connect('방장');
    const room = (await ok<RoomJoined>(host, 'room:create', settings({ password: 'secret' }))).room;
    expect(room.hasPassword).toBe(true);

    const member = await connect('회원', false);
    expect(await errorCode(member, 'room:join', { code: room.code })).toBe('PASSWORD_REQUIRED');
    const first = await call(member, 'room:join', { code: room.code, password: 'nope' });
    expect('error' in first && first.error.message).toBe('비밀번호가 달라요. 4번 더 시도할 수 있어요');
    await ok(member, 'room:join', { code: room.code, password: 'secret' });

    const other = await connect('다른회원', false);
    for (let i = 0; i < 5; i++) await call(other, 'room:join', { code: room.code, password: 'nope' });
    expect(await errorCode(other, 'room:join', { code: room.code, password: 'secret' })).toBe('PASSWORD_LOCKED');
  });

  it('방장 권한: 방장이 아니면 설정·강퇴·위임을 못 하고, 강퇴된 사람은 다시 못 들어온다', async () => {
    const host = await connect('방장');
    const room = (await ok<RoomJoined>(host, 'room:create', settings())).room;
    const guest = await connect('손님');
    await ok(guest, 'room:join', { code: room.code });

    expect(await errorCode(guest, 'room:update', settings({ name: '뺏기' }))).toBe('ROOM_NOT_HOST');
    expect(await errorCode(guest, 'room:kick', { userId: host.user.userId })).toBe('ROOM_NOT_HOST');
    expect(await errorCode(guest, 'room:transfer', { userId: guest.user.userId })).toBe('ROOM_NOT_HOST');
    expect(await errorCode(host, 'room:kick', { userId: host.user.userId })).toBe('ROOM_SELF');

    const kicked = next(guest, 'room:kicked');
    await ok(host, 'room:kick', { userId: guest.user.userId });
    expect((await kicked).roomId).toBe(room.id);
    expect(await errorCode(guest, 'room:join', { code: room.code })).toBe('ROOM_BANNED');
  });

  it('최대 인원은 지금 인원보다 적게 못 바꾼다', async () => {
    const host = await connect('방장');
    const room = (await ok<RoomJoined>(host, 'room:create', settings())).room;
    const a = await connect('가');
    const b = await connect('나');
    await ok(a, 'room:join', { code: room.code });
    await ok(b, 'room:join', { code: room.code });
    expect(await errorCode(host, 'room:update', settings({ maxMembers: 2 }))).toBe('ROOM_TOO_SMALL');
  });

  it('방장이 나가면 가장 오래 있던 사람이 방장, 마지막 사람이 나가면 방이 사라진다', async () => {
    const host = await connect('방장');
    const room = (await ok<RoomJoined>(host, 'room:create', settings())).room;
    const first = await connect('먼저');
    const second = await connect('나중');
    await ok(first, 'room:join', { code: room.code });
    await ok(second, 'room:join', { code: room.code });

    const state = next(second, 'room:state', (v: RoomView) => v.members.length === 2);
    await ok(host, 'room:leave');
    expect((await state).hostId).toBe(first.user.userId);

    await ok(first, 'room:transfer', { userId: second.user.userId });
    await ok(first, 'room:leave');
    await ok(second, 'room:leave');
    expect(await errorCode(second, 'room:join', { code: room.code })).toBe('ROOM_NOT_FOUND');
  });

  it('채팅: 같은 방에만 가고, 5초에 5개를 넘으면 막고, 다시 연결하면 놓친 메시지를 받는다', async () => {
    const host = await connect('방장');
    const room = (await ok<RoomJoined>(host, 'room:create', settings())).room;
    const guest = await connect('손님');
    const joined = await ok<RoomJoined>(guest, 'room:join', { code: room.code });
    const lastSeq = joined.messages.at(-1)!.seq;

    const outsider = await connect('바깥');
    let leaked = false;
    outsider.on('chat:message', () => (leaked = true));

    const received = next(guest, 'chat:message', (m) => m.kind === 'user');
    await ok(host, 'chat:send', { text: '  안녕하세요  ' });
    const message = (await received) as Extract<ServerChatMessage, { kind: 'user' }>;
    expect(message).toMatchObject({ text: '안녕하세요', nickname: '방장', userId: host.user.userId });

    for (let i = 0; i < 4; i++) await ok(host, 'chat:send', { text: `도배 ${i}` });
    expect(await errorCode(host, 'chat:send', { text: '하나 더' })).toBe('CHAT_TOO_FAST');
    expect(await errorCode(host, 'chat:send', { text: 'a'.repeat(201) })).toBe('VALIDATION_ERROR');

    const replay = await ok<RoomJoined>(guest, 'room:join', { code: room.code, since: lastSeq });
    expect(replay.messages.map((m) => m.text)).toEqual(['안녕하세요', '도배 0', '도배 1', '도배 2', '도배 3']);
    expect(leaked).toBe(false);
  });

  it('연습 상대: 방장만 부를 수 있고, 방장이 될 수 없고, 사람이 다 나가면 방과 함께 사라진다', async () => {
    const host = await connect('방장');
    const room = (await ok<RoomJoined>(host, 'room:create', settings())).room;
    const guest = await connect('손님');
    await ok(guest, 'room:join', { code: room.code });

    expect(await errorCode(guest, 'room:bot')).toBe('ROOM_NOT_HOST');
    const greeted = next(guest, 'chat:message', (m) => m.kind === 'user' && m.userId === 'bot');
    await ok(host, 'room:bot');
    expect((await greeted).text).toContain('캐치마인드');
    expect(await errorCode(host, 'room:bot')).toBe('ROOM_ALREADY');
    expect(await errorCode(host, 'room:transfer', { userId: 'bot' })).toBe('ROOM_IS_BOT');

    const reply = next(guest, 'chat:message', (m) => m.kind === 'user' && m.userId === 'bot');
    await ok(guest, 'chat:send', { text: '안녕' });
    expect((await reply).text).toBe('안녕하세요 😊');

    await ok(host, 'room:leave');
    await ok(guest, 'room:leave');
    expect(await errorCode(guest, 'room:join', { code: room.code })).toBe('ROOM_NOT_FOUND');
  });

  it('탭을 닫으면 잠시 뒤 나간 것으로 처리하고, 방장이었다면 넘어간다', { timeout: 20_000 }, async () => {
    const host = await connect('방장');
    const room = (await ok<RoomJoined>(host, 'room:create', settings())).room;
    const guest = await connect('손님');
    await ok(guest, 'room:join', { code: room.code });

    const left = next(guest, 'chat:message', (m) => m.text === '방장님이 나갔어요');
    const startedAt = Date.now();
    host.disconnect();
    await left;
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(3_000); // 바로가 아니라 잠시 기다렸다가
    const view = await ok<RoomJoined>(guest, 'room:join', { code: room.code });
    expect(view.room.hostId).toBe(guest.user.userId);
  });

  it(
    '새로고침처럼 금방 다시 연결하면 방에 그대로 남는다 (비밀번호도 다시 묻지 않는다)',
    { timeout: 20_000 },
    async () => {
      const host = await connect('방장');
      const room = (await ok<RoomJoined>(host, 'room:create', settings({ password: 'secret' }))).room;
      host.disconnect();

      const again = await connect('방장');
      const back = await ok<RoomJoined>(again, 'room:join', { code: room.code });
      expect(back.room.members.map((m) => m.nickname)).toEqual(['방장']);
      await new Promise((r) => setTimeout(r, 8_000)); // 청소 주기가 지나도
      const still = await ok<RoomJoined>(again, 'room:join', { code: room.code });
      expect(still.room.hostId).toBe(again.user.userId);
    },
  );
});
