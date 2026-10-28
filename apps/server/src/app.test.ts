import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createLocalAuth } from './shared/auth/localAuth.ts';
import type { AuthUser } from './shared/auth/AuthProvider.ts';
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
  const app = createApp({
    issuer: auth,
    db: {} as Pool, // 이 테스트에서는 DB를 쓰는 경로를 부르지 않는다
    healthChecks: options.checks ?? { redis: ok, db: ok },
    isShuttingDown: () => options.shuttingDown ?? false,
    logger: createLogger('error'),
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
