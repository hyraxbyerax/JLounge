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
  /** 로컬 인증(게스트·이메일 로그인) 토큰 서명 키. 32자 이상 */
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
  /** 유튜브 Data API v3 키. 없으면 예시 곡만 검색된다 */
  YOUTUBE_API_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  /** 같은 검색어 결과를 Redis에 저장해 두는 시간 (기본 6시간) */
  SEARCH_CACHE_TTL_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(6 * 60 * 60),
  /** SIGTERM 후 연결을 정리하며 기다리는 최대 시간 */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /** 로드밸런서(ALB·nginx) 뒤에서 돌 때 true: X-Forwarded-For 의 주소를 접속 주소로 본다 (게스트 비밀번호 잠금 기준) */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * 화면 빌드 폴더(apps/web/dist). 주면 서버가 화면 파일까지 같은 주소로 내보낸다 (AWS Learner Lab처럼 CloudFront를 못 쓸 때).
   * Docker 이미지에는 미리 넣어 두었다. 개발 중에는 비워둔다 (화면은 Vite가 띄움)
   */
  WEB_DIST_DIR: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  /** 캠퍼스 플래너 화면 아래 "응답 서버" 이름 (로드 밸런싱 시연용). 비우면 컴퓨터 이름 */
  INSTANCE_NAME: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
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
