# 전북대학교 휴식 라운지

공강 시간에 들르는 온라인 휴게실. 방을 만들어 채팅하고, 유튜브 음악을 같이 듣고, 미니게임(캐치마인드·초성 퀴즈)을 한다. 로그인하면 친구 기능과 **캠퍼스 플래너**(일정·시간표, 팀원 작품)를 쓸 수 있다.

| 폴더 | 내용 |
| --- | --- |
| `apps/web` | 화면 (React 19 + Vite). 빌드하면 정적 파일 |
| `apps/server` | 서버 (Node 24 + Express 5 + Socket.IO). 상태는 전부 Redis·PostgreSQL에 있어 여러 대로 늘릴 수 있다 |
| `packages/shared` | 화면과 서버가 같이 쓰는 입력 검증·이벤트 모양·게임 규칙 |
| `docs/` | 기능 명세(`lounge-spec.md`), 디자인(`design.md`), 개발 순서(`roadmap.md`) |

## 로컬에서 실행하기

준비물: Node 24, Docker Desktop.

```bash
cp .env.example .env          # 값 채우기: AUTH_SECRET(32자 이상), POSTGRES_PASSWORD, DATABASE_URL 의 비밀번호
npm install
docker compose up -d          # Valkey(Redis) + PostgreSQL
npm run db:migrate            # 테이블 만들기 (처음 한 번, 마이그레이션이 추가될 때마다)
npm run dev                   # 서버(3000) + 화면(5173)
```

http://localhost:5173 으로 접속한다. 개발 중에는 화면 서버가 `/api`, `/socket.io`, `/health`를 3000번 서버로 넘겨준다.

> Windows PowerShell에서 `npm` 실행이 막히면 `npm.cmd`로 실행한다.

## 검사

```bash
npm run lint                  # ESLint + Prettier
npm run build                 # 타입 검사 + 화면 빌드
npm test                      # 단위 테스트
```

Redis·DB가 필요한 통합 테스트는 주소를 주면 함께 돈다 (없으면 건너뜀).

```bash
TEST_REDIS_URL=redis://localhost:6379 TEST_DATABASE_URL=<.env의 DATABASE_URL> npm test
```

**서버 여러 대 확인**: `npm run dev`를 끄고 `docker compose --profile multi up --build` → 다른 창에서 `npm run dev:web`. 서버 2대 + nginx 로드밸런서가 3000번에 뜬다. 서버 하나를 `docker stop` 해도 방·채팅·음악·게임이 이어지는지 확인할 수 있다.

## 환경 변수 (서버)

`.env.example`에 설명이 있다. 서버는 시작할 때 값을 검사하고, 틀리면 이유를 출력하고 멈춘다.

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `REDIS_URL` | ✔ | Valkey/Redis 주소. 암호화 연결이면 `rediss://` |
| `DATABASE_URL` | ✔ | PostgreSQL 주소 |
| `AUTH_SECRET` | ✔ | 로그인 토큰 서명 키 (32자 이상 무작위). 서버가 여러 대면 **모두 같은 값** |
| `PORT` | | 기본 3000 |
| `NODE_ENV` | | 운영은 `production` |
| `LOG_LEVEL` | | `debug`/`info`/`warn`/`error`. 로그는 한 줄 JSON (stdout) |
| `CORS_ORIGINS` | | 화면을 다른 주소에서 띄울 때만, 쉼표로 구분 |
| `TRUST_PROXY` | | 로드밸런서 뒤면 `true` (접속 주소 기준 잠금에 씀) |
| `YOUTUBE_API_KEY` | | 비우면 예시 곡만 검색됨 |
| `SEARCH_CACHE_TTL_SEC` | | 검색 결과 캐시 시간, 기본 6시간 |
| `SHUTDOWN_TIMEOUT_MS` | | 종료 신호 후 정리 대기, 기본 10초 |
| `INSTANCE_NAME` | | 플래너 화면 아래 "응답 서버" 이름 (시연용) |

## AWS 배포 담당에게

코드는 AWS 없이 개발했고, 아래만 맞추면 올라가도록 만들어 두었다.

**서버**
- 이미지: 저장소 루트에서 `docker build -t lounge-server .` (Node 24, 3000번 포트). ECS/EC2 어디든 같다.
- 상태 확인: `GET /health` → Redis·DB 정상이면 200, 아니면 503. 종료 중에도 503이라 로드밸런서가 새 연결을 보내지 않는다.
- 종료: SIGTERM을 받으면 새 연결을 막고 정리한 뒤 끈다 (`SHUTDOWN_TIMEOUT_MS`). 끊긴 사용자는 다른 서버로 자동 재접속.
- 마이그레이션은 서버 시작과 따로 한 번: `docker run --env-file .env lounge-server node --disable-warning=ExperimentalWarning apps/server/src/shared/db/migrate.ts`
- 서버 여러 대 OK: 서버 메모리에 상태를 두지 않는다. 소켓은 WebSocket만 써서 **고정 세션(sticky)이 필요 없다**. 로드밸런서 유휴 시간 제한은 60초 이상이면 된다.
- 로드밸런서 뒤에서는 `TRUST_PROXY=true`.

**Redis (ElastiCache)**: Valkey/Redis, **클러스터 모드 끔**(단일 샤드). Socket.IO Redis 어댑터와 Lua 스크립트를 쓴다.

**PostgreSQL (RDS)**: 18 기준. `DATABASE_URL` 하나로 접속.

**화면**: `npm run build -w @lounge/web` → `apps/web/dist`를 정적 호스팅(S3 + CloudFront 등). 화면은 API를 **같은 주소의** `/api`, `/socket.io`, `/health`로 부른다. 그래서 CloudFront에서 이 세 경로를 서버 로드밸런서로 넘기는 방식이 가장 간단하다 (`/socket.io`는 WebSocket 허용). 다른 도메인으로 나누려면 화면에 서버 주소 설정을 추가해야 한다.

**Cognito로 바꿀 때** (지금은 이메일+비밀번호 로컬 로그인)
- 서버: `apps/server/src/shared/auth/AuthProvider.ts` 인터페이스의 Cognito 구현을 만들어 `localAuth.ts` 대신 끼운다. 사용자는 `users.auth_sub`(Cognito `sub`, unique)로 연결한다. `/api/users/signup`, `/login`은 없어진다.
- 화면: `apps/web/src/shared/api/session.ts`의 `signIn`이 Cognito를 부르게 바꾸고, `shared/auth/LoginPage.tsx` 폼을 맞춘다. 나머지(세션 저장·구독)는 그대로.
- 게스트(로그인 없이 방 입장)는 서버가 직접 발급하는 토큰이라 Cognito와 상관없이 그대로 둔다.
- 지금 로컬에서 가입한 계정은 Cognito로 옮겨지지 않는다.

**비밀 값**: `AUTH_SECRET`, DB 비밀번호, `YOUTUBE_API_KEY`는 Secrets Manager 등에 두고 환경 변수로 넣는다. `.env`는 커밋하지 않는다.
