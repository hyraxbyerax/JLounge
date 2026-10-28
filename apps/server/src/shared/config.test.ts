import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

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

  it('필수 값이 없거나 짧으면 알아보기 쉬운 오류를 낸다', () => {
    expect(() => loadConfig({ ...base, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
    expect(() => loadConfig({ AUTH_SECRET: 'x'.repeat(32) })).toThrow(/REDIS_URL/);
  });
});
