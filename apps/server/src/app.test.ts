import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { scheduleRouter } from './modules/schedule/index.ts';
import { createGuest, createLocalAuth } from './shared/auth/localAuth.ts';
import type { AuthUser } from './shared/auth/AuthProvider.ts';
import type { Queryable } from './shared/db/pool.ts';
import type { HealthCheck } from './shared/health.ts';
import { createLogger } from './shared/logger.ts';

const auth = createLocalAuth('t'.repeat(32));
const ok: HealthCheck = async () => {};
const down: HealthCheck = async () => {
  throw new Error('down');
};

/** 테스트에서 보는 응답 모양 */
type Body = { data: Record<string, string> & { token: string; user: AuthUser }; error: { code: string } };
const body = async (res: Response) => (await res.json()) as Body;

let server: Server | null = null;

async function start(options: { checks?: Record<string, HealthCheck>; shuttingDown?: boolean } = {}) {
  const db = {} as Queryable; // 이 테스트에서는 DB를 쓰는 경로를 부르지 않는다
  const app = createApp({
    auth,
    db,
    healthChecks: options.checks ?? { redis: ok, db: ok },
    isShuttingDown: () => options.shuttingDown ?? false,
    logger: createLogger('error'),
    schedule: scheduleRouter({ auth, db }),
  });
  server = app.listen(0);
  await new Promise((resolve) => server!.once('listening', resolve));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

afterEach(() => {
  server?.close();
  server = null;
});

describe('GET /health', () => {
  it('모두 정상이면 200', async () => {
    const res = await fetch(`${await start()}/health`);
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ data: { redis: 'ok', db: 'ok' } });
  });

  it('하나라도 안 되면 503과 어느 쪽인지 알려준다', async () => {
    const res = await fetch(`${await start({ checks: { redis: ok, db: down } })}/health`);
    expect(res.status).toBe(503);
    const json = await body(res);
    expect(json.error.code).toBe('UNHEALTHY');
    expect(json.data).toEqual({ redis: 'ok', db: 'down' });
  });

  it('종료 중이면 503 (로드밸런서가 새 요청을 보내지 않게)', async () => {
    const res = await fetch(`${await start({ shuttingDown: true })}/health`);
    expect(res.status).toBe(503);
  });
});

describe('POST /api/users/guest', () => {
  it('게스트 토큰을 발급하고, 그 토큰으로 사용자를 확인할 수 있다', async () => {
    const res = await fetch(`${await start()}/api/users/guest`, { method: 'POST' });
    expect(res.status).toBe(201);
    const { data } = await body(res);
    expect(data.user.userId).toMatch(/^guest_/);
    expect(await auth.verify(data.token)).toEqual(data.user);
  });
});

describe('POST /api/users/signup', () => {
  it('입력이 잘못되면 칸별 한국어 오류를 돌려준다 (DB까지 가지 않는다)', async () => {
    const res = await fetch(`${await start()}/api/users/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'short', nickname: '' }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string; fields: Record<string, string> } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.fields).toMatchObject({
      email: '올바른 이메일 형식이 아닙니다.',
      password: '비밀번호는 8자 이상이어야 합니다.',
      nickname: '닉네임을 입력해주세요.',
    });
  });
});

describe('캠퍼스 플래너 /api/schedule (로그인한 회원만)', () => {
  it('토큰이 없으면 401', async () => {
    const res = await fetch(`${await start()}/api/schedule/items`);
    expect(res.status).toBe(401);
  });

  it('게스트는 403 LOGIN_REQUIRED', async () => {
    const token = await auth.issue(createGuest());
    const res = await fetch(`${await start()}/api/schedule/items`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
    expect((await body(res)).error.code).toBe('LOGIN_REQUIRED');
  });

  it('회원은 통과한다', async () => {
    const token = await auth.issue({ userId: 'local_test', nickname: '테스트', isGuest: false });
    const res = await fetch(`${await start()}/api/schedule/server-info`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect((await body(res)).data.instance).toBeTruthy();
  });
});

describe('공통 응답 형식', () => {
  it('없는 주소는 { error: { code, message } }', async () => {
    const res = await fetch(`${await start()}/api/nothing`);
    expect(res.status).toBe(404);
    expect((await body(res)).error.code).toBe('NOT_FOUND');
  });

  it('잘못된 JSON은 400', async () => {
    const res = await fetch(`${await start()}/api/users/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad',
    });
    expect(res.status).toBe(400);
    expect((await body(res)).error.code).toBe('BAD_REQUEST');
  });
});
