import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEV_AUTH_SECRET, loadConfig } from './config.ts';

const base = {
  REDIS_URL: 'redis://localhost:6379',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  AUTH_SECRET: 'x'.repeat(32),
};

describe('설정', () => {
  it('기본값을 채운다', () => {
    const config = loadConfig(base);
    expect(config.PORT).toBe(3000);
    expect(config.CORS_ORIGINS).toEqual([]);
  });

  it('쉼표로 구분한 허용 출처를 나눈다', () => {
    expect(loadConfig({ ...base, CORS_ORIGINS: 'http://a.com, http://b.com' }).CORS_ORIGINS).toEqual([
      'http://a.com',
      'http://b.com',
    ]);
  });

  it('.env.example 의 개발용 키는 개발에서는 되고, 운영에서는 막는다', () => {
    expect(loadConfig({ ...base, AUTH_SECRET: DEV_AUTH_SECRET }).AUTH_SECRET).toBe(DEV_AUTH_SECRET);
    expect(() => loadConfig({ ...base, AUTH_SECRET: DEV_AUTH_SECRET, NODE_ENV: 'production' })).toThrow(/운영/);
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });

  it('.env.example 의 기본값만으로 설정이 통과한다 (받자마자 켜지게)', () => {
    const example = Object.fromEntries(
      readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8')
        .split('\n')
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
    expect(example.AUTH_SECRET).toBe(DEV_AUTH_SECRET);
    expect(() => loadConfig(example)).not.toThrow();
    expect(example.DATABASE_URL).toContain(`:${example.POSTGRES_PASSWORD}@`);
  });

  it('필수 값이 없거나 짧으면 알아보기 쉬운 오류를 낸다', () => {
    expect(() => loadConfig({ ...base, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
    expect(() => loadConfig({ AUTH_SECRET: 'x'.repeat(32) })).toThrow(/REDIS_URL/);
  });
});
