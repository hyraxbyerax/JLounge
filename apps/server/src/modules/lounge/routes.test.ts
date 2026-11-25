import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { createGuest, createLocalAuth } from '../../shared/auth/localAuth.ts';
import { errorHandler } from '../../shared/http/errors.ts';
import { createLogger } from '../../shared/logger.ts';
import type { Counter } from '../../shared/rateLimit.ts';
import { createSampleSearch } from './music/sampleSearch.ts';
import { loungeRouter, SEARCH_LIMIT_PER_MINUTE } from './routes.ts';

const auth = createLocalAuth('r'.repeat(32));
let server: Server | null = null;

function memoryCounter(): Counter {
  const counts = new Map<string, number>();
  return {
    async hit(key) {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
  };
}

async function start() {
  const app = express();
  app.use('/api/lounge', loungeRouter({ auth, musicSearch: createSampleSearch(), counter: memoryCounter() }));
  app.use(errorHandler(createLogger('error')));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server!.once('listening', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/lounge`;
}

afterEach(() => {
  server?.close();
  server = null;
});

type Body = { data: { source: string; results: { title: string }[] }; error: { code: string } };
const body = async (res: Response) => (await res.json()) as Body;

describe('GET /api/lounge/music/search', () => {
  it('토큰이 없으면 401', async () => {
    const res = await fetch(`${await start()}/music/search?q=bts`);
    expect(res.status).toBe(401);
  });

  it('검색 결과와 어떤 검색인지(source)를 돌려준다', async () => {
    const token = await auth.issue(createGuest());
    const res = await fetch(`${await start()}/music/search?q=bts`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const { data } = await body(res);
    expect(data.source).toBe('sample');
    expect(data.results.map((r) => r.title)).toEqual(['BTS – Dynamite']);
  });

  it('빈 검색어는 400', async () => {
    const token = await auth.issue(createGuest());
    const res = await fetch(`${await start()}/music/search?q=%20`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(400);
  });

  it(`1분에 ${SEARCH_LIMIT_PER_MINUTE}번을 넘으면 429`, async () => {
    const base = await start();
    const headers = { authorization: `Bearer ${await auth.issue(createGuest())}` };
    for (let i = 0; i < SEARCH_LIMIT_PER_MINUTE; i++) {
      expect((await fetch(`${base}/music/search?q=a`, { headers })).status).toBe(200);
    }
    const res = await fetch(`${base}/music/search?q=a`, { headers });
    expect(res.status).toBe(429);
    expect((await body(res)).error.code).toBe('TOO_MANY_SEARCHES');
  });
});
