# JLounge

Cloud Computing Course Team Project — 전북대학교 휴식 라운지

공강 시간에 들르는 온라인 휴게실. 방을 만들어 채팅하고, 유튜브 음악을 같이 듣고, 미니게임(캐치마인드)을 한다. 로그인하면 친구 기능과 **캠퍼스 플래너**(일정·시간표, 팀원 작품)를 쓸 수 있다.

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
| `WEB_DIST_DIR` | | 화면 빌드 폴더. 주면 서버가 화면까지 같은 주소로 내보냄. Docker 이미지에는 이미 설정됨, 개발 중에는 비움 |

## AWS 배포 담당에게

코드는 AWS 없이 개발했고, 아래만 맞추면 올라가도록 만들어 두었다. 대부분은 AWS 자원을 만들고 환경 변수를 넣는 일이다.

우리는 **AWS Academy Learner Lab** 계정으로 배포한다. 일반 AWS 계정과 제약이 달라서, 아래 구조와 순서는 Learner Lab 기준으로 정했다. Learner Lab에서 쓸 수 있는 서비스는 바뀔 수 있으니 시작 전에 랩 콘솔에서 직접 확인한다.

| 서비스 | 우리 랩에서 확인한 결과 (2026-11-25) |
| --- | --- |
| CloudFront | ❌ 막혀 있음 (`cloudfront:ListDistributions` 권한 없음) → 화면은 서버가 함께 내보낸다 |
| ElastiCache | Valkey 캐시 생성 화면까지 열림 (us-east-1). ⚠ 기본값 "서버리스"가 아니라 **노드 기반**으로 만든다 (아래 표) |
| ECS·Fargate | "Fargate 전용" 클러스터 생성 화면까지 열림. 빈 클러스터는 무료라 먼저 만들어 확정해도 된다 |
| Cognito | 콘솔 열림. 사용자 풀이 만들어지는지는 배포 때 확인 |

### Learner Lab 제약과 대응

| 제약 | 영향 | 대응 |
| --- | --- | --- |
| 리전은 `us-east-1`, `us-west-2`만 | 다른 리전 자원 생성 불가 | 모든 자원을 `us-east-1` 한곳에 만든다 |
| IAM 역할·사용자를 새로 못 만듦 | 역할이 필요한 설정에서 막힘 | 미리 있는 **`LabRole`** 을 쓴다. ECS 작업 실행 역할·작업 역할 = `LabRole`, EC2 = `LabInstanceProfile`. 새 역할이 필요한 기능(ECS 자동 확장 등)은 안 될 수 있다 |
| 세션은 최대 4시간 | 세션이 끝나면 EC2 등 실행 중인 자원이 멈출 수 있다 (만든 자원 자체는 남음) | 시연 전에 랩을 시작하고 서버가 다시 떴는지(`/health`) 확인한다 |
| 예산이 정해져 있음 (보통 $100) | 다 쓰면 랩이 막힌다 | ALB·RDS·ElastiCache는 켜 두기만 해도 요금이 나간다. 가장 작은 사양, NAT 게이트웨이 만들지 않기, 시연이 끝나면 삭제. 사용 금액은 랩 화면에서 확인 (Budgets는 못 쓸 수 있음) |
| 접속 키가 임시 (세션마다 바뀜) | 로컬 AWS CLI 설정이 세션마다 만료 | 랩 화면 "AWS Details"에서 키를 세션마다 다시 복사. GitHub Actions 자동 배포는 비추천 |
| 도메인 구입·인증서 발급이 어려움 | https 정식 주소를 만들기 어렵다 | ALB 주소(`http://...elb.amazonaws.com`)로 접속한다. 사이트 기능은 http에서도 모두 동작 (복사 버튼만 링크를 화면에 보여주는 방식으로 바뀜) |
| 일부 서비스가 막혀 있음 (CloudFront 확인됨) | S3 + CloudFront로 화면을 올릴 수 없다 | 서버 이미지에 화면을 넣어 같은 주소로 내보낸다. 아래 기본 구조는 CloudFront·Route 53·Cognito 없이도 돌아간다 |

### 전체 구조 (Learner Lab 기본안)

```
사용자 브라우저
   │ http://<ALB 주소>
   ▼
ALB ──▶ ECS Fargate 서버 2대 (화면 파일 + API + 실시간) ──▶ ElastiCache (실시간 상태: 방·채팅·음악·게임)
            │                                       └──▶ RDS PostgreSQL (회원·친구·일정·시간표)
            └── CloudWatch Logs (서버 로그)
```

- 화면과 서버를 **같은 주소(ALB)** 에서 내보낸다. 화면은 API를 같은 주소의 `/api`, `/socket.io`로 부르기 때문에 이렇게 하면 추가 설정이 없다.
- Docker 이미지에 화면 빌드(`apps/web/dist`)가 들어 있고, 서버가 `/`, `/room/{코드}` 같은 화면 주소에 화면을 내보낸다 (`WEB_DIST_DIR`, `apps/server/src/shared/http/webApp.ts`). 그래서 **ALB 주소 하나로 사이트 전체가 열린다.** 따로 할 일 없음.
- 라운지 본체는 실시간 연결(WebSocket)을 계속 붙잡고, 1초·0.5초마다 음악·게임 타이머를 확인하므로 **계속 켜져 있는 서버(ECS)** 가 맞다. Lambda는 본체에 맞지 않는다.
- ECS Fargate를 못 쓰면 **EC2 2대**(`LabInstanceProfile`)에 Docker로 같은 이미지를 띄우고 ALB에 붙인다. 구조는 같다.

### 쓰는 AWS 기능

| 구분 | AWS 기능 | 어디에 | 메모 |
| --- | --- | --- | --- |
| 필수 | ECR | 서버 이미지 보관 | ECS가 여기서 가져감 |
| 필수 | ECS Fargate (안 되면 EC2) | 서버 + 화면 파일 | `Dockerfile` 기반. 2대로 "서버 여러 대" 시연. 역할은 `LabRole` |
| 필수 | ALB | 서버 앞단, 사이트 주소 | 상태 확인 `/health`, WebSocket 지원, sticky 불필요 |
| 필수 | ElastiCache (Valkey) | 실시간 상태 | **노드 기반 캐시**(서버리스 ❌), **클러스터 모드 끔**, 노드 1개, 가장 작은 사양 |
| 필수 | RDS (PostgreSQL) | 회원·친구·일정 | 가장 작은 사양, 단일 AZ. 18이 없으면 16·17도 된다 (18 전용 기능 안 씀) |
| 필수 | CloudWatch Logs | 서버 로그 | ECS 로그 설정만 켜면 됨. 로그가 한 줄 JSON이라 검색이 쉬움 |
| 랩에서 되면 | Cognito | 로그인·회원가입 | 코드 교체 필요 (아래 "Cognito로 바꿀 때"). 안 되면 지금 이메일 로그인 그대로 |
| 랩에서 되면 | Secrets Manager | `AUTH_SECRET`, DB 비밀번호, `YOUTUBE_API_KEY` | 안 되면 ECS 작업 정의의 환경 변수에 직접 넣는다 (저장소에는 절대 커밋하지 않음) |
| 랩에서 되면 | CloudWatch 알람 | 서버 이상 알림 | `/health` 실패, 작업 수 감소 |
| 어려움 | Route 53 + ACM | 도메인 + https | 도메인 구입이 필요해 Learner Lab에선 생략 |
| 어려움 | ECS 자동 확장, Budgets, WAF | | 역할·권한 제약으로 막힐 수 있다. 서버 대수는 손으로 2대 고정 |
| 어려움 | GitHub Actions 자동 배포 | | 접속 키가 세션마다 바뀐다 |

### 추천 순서

1. **랩 확인**: 랩 시작 → 리전 `us-east-1` → ECS 클러스터 만들기, ElastiCache 만들기가 되는지 확인
2. **네트워크**: 기본 VPC와 퍼블릭 서브넷 사용 (NAT 게이트웨이 만들지 않기). 보안 그룹 4개: ALB(80 공개) / 서버(3000, ALB에서만) / RDS(5432, 서버에서만) / ElastiCache(6379, 서버에서만)
3. **RDS, ElastiCache 만들기**: 가장 작은 사양. 만들어지는 데 시간이 걸리니 먼저 시작해 둔다
4. **이미지 올리기**: 로컬에서 `docker build` → 랩 "AWS Details"의 키로 AWS CLI 설정 → ECR에 push
5. **ECS**: 클러스터 → 작업 정의 (이미지, 3000번 포트, 환경 변수, 실행 역할·작업 역할 `LabRole`, 로그 켜기) → 서비스 2개 작업 (퍼블릭 IP 켜기, ALB 대상 그룹 상태 확인 경로 `/health`)
6. **DB 테이블 만들기**: 같은 작업 정의를 명령만 바꿔 한 번 실행 (`node --disable-warning=ExperimentalWarning apps/server/src/shared/db/migrate.ts`)
7. **확인**: `http://<ALB 주소>/health`가 200 → 브라우저 두 개로 같은 방에서 채팅·음악·게임 → 작업 하나를 멈춰도 이어지는지
8. **여유 있으면**: Cognito, Secrets Manager, 알람
9. **끝나면 삭제**: ECS 서비스(작업 0개) → ALB → ElastiCache → RDS → ECR 이미지 순서. 남겨 두면 예산이 계속 줄어든다

> 환경 변수 (ECS 작업 정의): `NODE_ENV=production`, `PORT=3000`, `TRUST_PROXY=true`, `REDIS_URL=redis://<ElastiCache 기본 엔드포인트>:6379`, `DATABASE_URL=postgres://<사용자>:<비밀번호>@<RDS 엔드포인트>:5432/<DB 이름>`, `AUTH_SECRET=<32자 이상, 두 서버 같은 값>`, `YOUTUBE_API_KEY=<선택>`. ElastiCache에서 전송 중 암호화를 켰다면 `rediss://`로 쓴다.

### 세부 사항

**서버**
- 이미지: 저장소 루트에서 `docker build -t lounge-server .` (Node 24, 3000번 포트, 서버 + 화면). ECS/EC2 어디든 같다. 로컬 확인: `docker run --env-file .env -p 3000:3000 lounge-server` → http://localhost:3000 (이때 `.env`의 `localhost` 주소는 `host.docker.internal`로 바꾼다)
- 상태 확인: `GET /health` → Redis·DB 정상이면 200, 아니면 503. 종료 중에도 503이라 로드밸런서가 새 연결을 보내지 않는다.
- 종료: SIGTERM을 받으면 새 연결을 막고 정리한 뒤 끈다 (`SHUTDOWN_TIMEOUT_MS`). 끊긴 사용자는 다른 서버로 자동 재접속.
- 마이그레이션은 서버 시작과 따로 한 번: `docker run --env-file .env lounge-server node --disable-warning=ExperimentalWarning apps/server/src/shared/db/migrate.ts`
- 서버 여러 대 OK: 서버 메모리에 상태를 두지 않는다. 소켓은 WebSocket만 써서 **고정 세션(sticky)이 필요 없다**. 로드밸런서 유휴 시간 제한은 60초 이상이면 된다.
- 로드밸런서 뒤에서는 `TRUST_PROXY=true`.

**Redis (ElastiCache)**: Valkey, **노드 기반 캐시 + 클러스터 모드 끔**(단일 샤드). 서버는 방·참가자·채팅처럼 여러 키를 Lua 스크립트 하나로 함께 바꾸는데, 서버리스나 클러스터 모드는 키를 여러 샤드에 나눠 두어 이 스크립트가 `CROSSSLOT` 오류로 실패한다. 서버리스는 쓰지 않아도 최소 요금이 나가는 점도 있다.

| ElastiCache 생성 화면 | 선택 |
| --- | --- |
| 엔진 | Valkey |
| 배포 옵션 | 노드 기반 캐시 |
| 클러스터 모드 | 비활성화 |
| 노드 유형 | `cache.t3.micro` 또는 `cache.t4g.micro` |
| 복제본 / 다중 AZ | 0개 / 끔 |
| 전송 중 암호화 | 끄면 `REDIS_URL=redis://...`, 켜면 `rediss://...` |

**PostgreSQL (RDS)**: 로컬은 18로 개발했고, 16 이상이면 된다. `DATABASE_URL` 하나로 접속.

**화면**: `npm run build -w @lounge/web` → `apps/web/dist`. 화면은 API를 **같은 주소의** `/api`, `/socket.io`, `/health`로 부른다. Learner Lab에서는 서버가 화면 파일까지 내보내는 방식(Docker 이미지 기본값)으로 같은 주소를 맞춘다. 일반 AWS 계정이라면 S3 + CloudFront에 화면을 올리고 세 경로를 ALB로 넘기는 방식도 된다(`/socket.io`는 WebSocket 허용). 화면과 서버를 다른 주소로 나누려면 화면에 서버 주소 설정을 추가해야 한다.

**Cognito로 바꿀 때** (지금은 이메일+비밀번호 로컬 로그인)
- 서버: `apps/server/src/shared/auth/AuthProvider.ts` 인터페이스의 Cognito 구현을 만들어 `localAuth.ts` 대신 끼운다. 사용자는 `users.auth_sub`(Cognito `sub`, unique)로 연결한다. `/api/users/signup`, `/login`은 없어진다.
- 화면: `apps/web/src/shared/api/session.ts`의 `signIn`이 Cognito를 부르게 바꾸고, `shared/auth/LoginPage.tsx` 폼을 맞춘다. 나머지(세션 저장·구독)는 그대로.
- 게스트(로그인 없이 방 입장)는 서버가 직접 발급하는 토큰이라 Cognito와 상관없이 그대로 둔다.
- 지금 로컬에서 가입한 계정은 Cognito로 옮겨지지 않는다.

**비밀 값**: `AUTH_SECRET`, DB 비밀번호, `YOUTUBE_API_KEY`는 Secrets Manager 등에 두고 환경 변수로 넣는다. `.env`는 커밋하지 않는다.
