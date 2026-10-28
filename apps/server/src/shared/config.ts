/*
 * 설정값은 전부 환경 변수에서 이 파일 한 곳에서만 읽는다.
 * 새 변수를 추가하면 루트의 .env.example 도 같이 고친다.
 */
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  REDIS_URL: z.url(),
  DATABASE_URL: z.url(),
  /** 로컬 인증(게스트·개발용 로그인) 토큰 서명 키. 32자 이상 */
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET은 32자 이상이어야 해요'),
  /** 화면을 다른 주소에서 띄울 때 허용할 출처 (쉼표로 구분). 같은 주소면 비워둔다 */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  /** SIGTERM 후 연결을 정리하며 기다리는 최대 시간 */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`환경 변수 설정이 잘못됐어요. .env.example을 참고해 .env를 만들어주세요.\n${problems}`);
  }
  return parsed.data;
}
