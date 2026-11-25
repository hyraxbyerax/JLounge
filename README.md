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

준비물: Git, Node 24, Docker Desktop (켜 두기).

```bash
git clone https://github.com/hyraxbyerax/JLounge.git
cd JLounge
npm install                   # 설정 파일 .env 도 이때 자동으로 만들어진다 (.env.example 의 내 컴퓨터용 기본값)
docker compose up -d          # Valkey(Redis) + PostgreSQL
npm run db:migrate            # 테이블 만들기 (처음 한 번, 마이그레이션이 추가될 때마다)
npm run dev                   # 서버(3000) + 화면(5173)
```

http://localhost:5173 으로 접속한다. 개발 중에는 화면 서버가 `/api`, `/socket.io`, `/health`를 3000번 서버로 넘겨준다.

- 설정을 직접 채울 필요는 없다. 유튜브 검색을 쓰려면 `.env`의 `YOUTUBE_API_KEY`만 채운다 (비우면 예시 곡만 검색).
- `.env.example`의 비밀번호·`AUTH_SECRET`은 각자 컴퓨터 안에서만 쓰는 개발용이다. 운영(`NODE_ENV=production`)에서 개발용 `AUTH_SECRET`을 그대로 쓰면 서버가 켜지지 않는다.

> Windows PowerShell에서 `npm` 실행이 막히면 `npm.cmd`로 실행한다.

## 꼭 기억할 점

**받아서 바로 되는 것**: 방·채팅·초대, 음악 같이 듣기(재생·대기열·방장 명령어), 캐치마인드와 연습 상대, 회원가입·로그인, 친구·1:1 대화, 캠퍼스 플래너, 서버 여러 대 확인. 인터넷은 연결돼 있어야 한다 (유튜브 영상, 글꼴).

**유튜브 검색은 API 키가 있어야 진짜 검색이 된다**

- 키가 없으면 예시 곡 6개(Queen, BTS, 강남스타일 등)만 검색된다. 영상 재생·같이 듣기는 키 없이도 된다 (키는 검색에만 쓴다).
- 키 발급(무료, 5분): Google Cloud Console → 새 프로젝트 → API 및 서비스 → "YouTube Data API v3" 사용 설정 → 사용자 인증 정보 → API 키 만들기 → `.env`의 `YOUTUBE_API_KEY=` 뒤에 붙여넣고 서버 다시 켜기.
- 키 하나로 하루 **검색 약 100번**까지 된다 (같은 검색어는 6시간 저장해 두고 다시 쓴다). 여럿이 키 하나를 나눠 쓰면 금방 찬다 → 각자 발급하는 것을 권장.
- 키는 GitHub·단톡방에 올리지 않는다 (`.env`는 저장소에 올라가지 않는다).

**설정·보안**

- `.env`는 `npm install` 때 `.env.example`을 복사해 자동으로 만들어진다. 안의 DB 비밀번호·`AUTH_SECRET`은 **각자 컴퓨터 안에서만 쓰는 개발용**이다 (공개돼 있음).
- 로컬 DB·Redis는 내 컴퓨터 안(127.0.0.1)에서만 열린다 (같은 와이파이의 다른 기기는 접속 불가).
- **운영(AWS)에서는 진짜 값**을 넣는다. `NODE_ENV=production`인데 `AUTH_SECRET`이 개발용 값이면 서버가 켜지지 않는다.
- **https 없이 배포하면 로그인 비밀번호가 암호화되지 않고 전송된다.** Learner Lab에서 ALB 주소(`http://`)로 시연할 때는 "평소 쓰는 비밀번호 말고 테스트용 비밀번호로 가입"하도록 안내한다 (Cognito로 바꾸면 로그인은 AWS의 https 화면에서 처리된다).

**코드를 새로 받았을 때 (`git pull` 후)**

- `npm install` — 라이브러리가 바뀌었을 수 있다
- `npm run db:migrate` — 새 테이블이 생겼을 수 있다 (이미 한 것은 건너뛴다)
- `docker compose up -d` — `docker-compose.yml`이 바뀌었으면 새 설정으로 다시 켠다 (저장된 데이터는 그대로)

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

## AWS 배포 가이드 (AWS 담당 팀원용)

이 가이드대로 하면 **ALB 주소 하나(`http://...elb.amazonaws.com`)로 사이트 전체가 열린다.** 코드는 고칠 필요 없고, AWS 자원을 만들어 환경 변수만 넣으면 된다. 우리는 **AWS Academy Learner Lab** 계정을 쓰므로, 모든 내용은 Learner Lab 기준이다.

위에서부터 순서대로 읽으면 된다: 구조를 이해하고(1) → Learner Lab의 제약을 알고(2) → 순서대로 만들고(3) → 막히면 문제 해결(4)을 본다.

### 1. 한눈에 보는 구조

```
사용자 브라우저
   │  http://<ALB 주소>
   ▼
ALB (로드밸런서)
   │
   ▼
ECS Fargate 서버 2대  ── 화면 + API + 실시간(WebSocket)을 한 이미지가 모두 담당
   ├──▶ ElastiCache (Valkey)   방·채팅·음악·게임처럼 실시간으로 바뀌는 상태
   ├──▶ RDS (PostgreSQL)        회원·친구·1:1 대화·일정처럼 오래 남는 데이터
   └──▶ CloudWatch Logs         서버 로그
```

이렇게 짠 이유는 세 가지다.

- **서버가 화면까지 내보낸다.** Learner Lab에서는 CloudFront가 막혀 있어서, 화면 파일을 Docker 이미지 안에 넣어 두었다. 화면이 API를 같은 주소의 `/api`, `/socket.io`로 부르므로 따로 설정할 것이 없다.
- **서버는 계속 켜져 있어야 한다(ECS).** 방에 있는 동안 WebSocket 연결을 붙잡고, 1초·0.5초마다 음악·게임 시간을 확인하기 때문에 요청이 올 때만 켜지는 Lambda는 맞지 않는다.
- **서버를 여러 대로 늘려도 된다.** 상태는 전부 Redis·DB에 있어서 어느 서버에 붙어도 같은 화면을 본다. 소켓은 WebSocket만 써서 **고정 세션(sticky)도 필요 없다.** (로컬에서 서버 2대 + nginx로 확인했다: `docker compose --profile multi up`)

### 2. 시작 전에: Learner Lab에서 알아둘 것

| Learner Lab의 제약 | 우리가 하는 일 |
| --- | --- |
| 리전은 `us-east-1`, `us-west-2`만 된다 | 모든 자원을 **`us-east-1`** 한곳에 만든다 |
| IAM 역할을 새로 만들 수 없다 | 미리 있는 **`LabRole`** 을 쓴다 (ECS 작업 실행 역할·작업 역할 모두). ECS 자동 확장처럼 새 역할이 필요한 기능은 막힐 수 있어서 서버는 **2대로 고정**한다 |
| CloudFront가 막혀 있다 (2026-11-25 확인) | 화면은 서버가 내보낸다 (위 구조) |
| 세션은 최대 4시간, 끝나면 서버가 멈출 수 있다 | 시연 전에 랩을 시작하고 `/health`로 서버가 살아 있는지 확인한다 |
| 접속 키가 세션마다 바뀐다 | 로컬 AWS CLI는 세션마다 랩 화면 "AWS Details"의 키로 다시 설정한다 |
| 예산이 정해져 있다 (보통 $100) | 가장 작은 사양으로 만들고, **NAT 게이트웨이는 만들지 않고**, 시연이 끝나면 지운다. ALB·RDS·ElastiCache는 켜 두기만 해도 요금이 나간다 |
| 도메인·인증서를 만들기 어렵다 | ALB 주소(`http://`)로 접속한다. https가 없으므로 시연 때 **"평소 쓰는 비밀번호 말고 테스트용 비밀번호로 가입"** 하도록 안내한다 |

### 3. 배포 순서

**① 랩 시작** — 랩을 시작하고 리전을 `us-east-1`로 맞춘다.

**② 네트워크와 보안 그룹** — 기본 VPC와 퍼블릭 서브넷을 그대로 쓴다. 보안 그룹은 네 개를 만들고, 각자 바로 앞 단계에서 오는 연결만 허용한다.

| 보안 그룹 | 들어오는 연결 허용 |
| --- | --- |
| `jlounge-alb` | 80번, 어디서나 (0.0.0.0/0) |
| `jlounge-server` | 3000번, `jlounge-alb`에서만 |
| `jlounge-db` | 5432번, `jlounge-server`에서만 |
| `jlounge-redis` | 6379번, `jlounge-server`에서만 |

**③ RDS와 ElastiCache 만들기** — 만들어지는 데 10분 넘게 걸리므로 가장 먼저 시작해 둔다.

| RDS (PostgreSQL) | 선택 |
| --- | --- |
| 엔진 버전 | PostgreSQL 16 이상 (로컬은 18) |
| 템플릿·사양 | 프리 티어 또는 가장 작은 사양, 단일 AZ |
| 마스터 사용자·비밀번호 | 정해서 적어 둔다 (나중에 `DATABASE_URL`에 넣음) |
| **초기 데이터베이스 이름** | **`lounge`** (비워 두면 DB가 만들어지지 않는다) |
| 퍼블릭 액세스 / 보안 그룹 | 아니요 / `jlounge-db` |

| ElastiCache | 선택 |
| --- | --- |
| 엔진 | Valkey |
| **배포 옵션** | **노드 기반 캐시** (기본값인 "서버리스" ❌) |
| **클러스터 모드** | **비활성화** |
| 노드 유형 / 복제본 / 다중 AZ | `cache.t3.micro` 또는 `cache.t4g.micro` / 0개 / 끔 |
| 전송 중 암호화 | 끄면 `REDIS_URL=redis://...`, 켜면 `rediss://...` |
| 보안 그룹 | `jlounge-redis` |

서버리스·클러스터 모드를 피하는 이유: 서버는 방·참가자·채팅처럼 여러 값을 한 번에 함께 바꾸는데, 서버리스·클러스터 모드는 값을 여러 칸에 나눠 저장해서 이 작업이 `CROSSSLOT` 오류로 실패한다. 서버리스는 쓰지 않아도 최소 요금이 나가는 점도 있다.

**④ 이미지 만들어 ECR에 올리기** — 저장소 루트에서 실행한다. 랩 "AWS Details"의 키로 AWS CLI를 먼저 설정하고, `<계정ID>`는 랩 화면에 보이는 12자리 숫자로 바꾼다.

```bash
aws ecr create-repository --repository-name jlounge --region us-east-1
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <계정ID>.dkr.ecr.us-east-1.amazonaws.com
docker build --platform linux/amd64 -t jlounge .
docker tag jlounge:latest <계정ID>.dkr.ecr.us-east-1.amazonaws.com/jlounge:latest
docker push <계정ID>.dkr.ecr.us-east-1.amazonaws.com/jlounge:latest
```

이미지 하나에 서버와 화면이 모두 들어 있다 (Node 24, 3000번 포트). `--platform linux/amd64`는 맥(M 칩)에서 만들 때 Fargate와 맞추기 위한 것이다.

**⑤ ECS 작업 정의** — Fargate, 이미지는 ④에서 올린 주소, 컨테이너 포트 3000, 작업 실행 역할·작업 역할은 `LabRole`, 로그 수집(CloudWatch Logs) 켜기. 환경 변수는 이렇게 넣는다.

| 환경 변수 | 값 |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `TRUST_PROXY` | `true` (ALB 뒤라서) |
| `DATABASE_URL` | `postgres://<마스터 사용자>:<비밀번호>@<RDS 엔드포인트>:5432/lounge?sslmode=no-verify` |
| `REDIS_URL` | `redis://<ElastiCache 기본 엔드포인트>:6379` |
| `AUTH_SECRET` | 32자 이상 무작위 값: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `YOUTUBE_API_KEY` | 유튜브 Data API 키 (없으면 예시 곡만 검색. 발급은 위 "꼭 기억할 점") |

- `?sslmode=no-verify`는 꼭 붙인다. RDS(PostgreSQL 15 이상)는 암호화 연결만 받는데, 이 옵션이 있어야 암호화해서 접속한다.
- `AUTH_SECRET`은 로그인 도장(서명) 키다. 서버 여러 대가 **모두 같은 값**이어야 하고, `.env.example`의 개발용 값을 넣으면 서버가 일부러 켜지지 않는다.
- 비밀 값(`AUTH_SECRET`, DB 비밀번호, 유튜브 키)은 Secrets Manager가 되면 거기에 두고, 안 되면 작업 정의에 직접 넣는다. 저장소에는 절대 올리지 않는다.

**⑥ DB 테이블 만들기 (한 번만)** — 같은 작업 정의로 "새 태스크 실행"을 하되, 명령만 아래로 바꿔서 한 번 돌린다. 로그에 "마이그레이션 완료"가 보이면 끝이다. 나중에 새 버전을 올릴 때도 이것만 다시 돌리면 된다 (이미 만든 테이블은 건너뛴다).

```
node,--disable-warning=ExperimentalWarning,apps/server/src/shared/db/migrate.ts
```

**⑦ ALB와 ECS 서비스** — ALB(인터넷 연결, 보안 그룹 `jlounge-alb`, 리스너 HTTP 80)를 만들고, 대상 그룹(대상 유형 IP, 포트 3000, 상태 확인 경로 **`/health`**)에 연결한다. 그다음 ECS 서비스를 원하는 작업 수 **2**, 퍼블릭 IP 켜기, 보안 그룹 `jlounge-server`, 위 대상 그룹으로 만든다. ALB 유휴 시간 제한은 기본 60초 그대로 두면 된다.

**⑧ 확인**

- [ ] `http://<ALB 주소>/health` → `{"data":{"redis":"ok","db":"ok"}}`
- [ ] `http://<ALB 주소>` 에서 메인 화면(JLounge)이 열린다
- [ ] 브라우저 두 개(일반 창 + 시크릿 창)로 같은 방에 들어가 채팅·음악·게임이 실시간으로 된다
- [ ] 회원가입·로그인, 캠퍼스 플래너가 된다
- [ ] ECS 작업 하나를 멈춰도 방이 이어진다 (다른 서버로 자동 재접속 — "서버 여러 대" 시연)

**⑨ 시연이 끝나면 지우기** — ECS 서비스(작업 수 0 → 삭제) → ALB·대상 그룹 → ElastiCache → RDS → ECR 이미지 순서로 지운다. 남겨 두면 예산이 계속 줄어든다.

### 4. 막힐 때

| 증상 | 원인과 해결 |
| --- | --- |
| 작업이 켜졌다 바로 꺼지고, 로그에 "운영에서는 개발용 AUTH_SECRET 을 쓸 수 없어요" | `AUTH_SECRET`을 무작위 값으로 바꾼다 |
| 로그에 "환경 변수 설정이 잘못됐어요" | 로그에 빠진 이름이 나온다. ⑤ 표대로 채운다 |
| `/health`가 503이고 `"db":"down"` | `jlounge-db` 보안 그룹이 서버에서 오는 5432를 허용하는지, `DATABASE_URL` 끝에 `?sslmode=no-verify`가 있는지, 초기 DB 이름이 `lounge`인지 |
| `/health`가 503이고 `"redis":"down"` | `jlounge-redis` 보안 그룹, 전송 중 암호화를 켰다면 `rediss://`인지 |
| 방 만들기·채팅에서 `CROSSSLOT` 오류 | ElastiCache가 서버리스이거나 클러스터 모드다. 노드 기반·클러스터 모드 끔으로 다시 만든다 |
| 회원가입·플래너에서 오류 (테이블이 없다는 로그) | ⑥ DB 테이블 만들기를 안 했다 |
| 대상 그룹 상태가 계속 unhealthy | 상태 확인 경로가 `/health`인지, 포트 3000인지, `jlounge-server`가 ALB에서 오는 3000을 허용하는지 |
| 서버를 바꿔 붙으면 로그인이 풀린다 | 서버마다 `AUTH_SECRET`이 다르다. 모든 작업이 같은 값을 쓰게 한다 |
| 다음 날 사이트가 안 열린다 | Learner Lab 세션이 끝나 서버가 멈췄다. 랩을 시작하고 ECS 작업이 2개로 다시 떴는지 확인한다 |

### 5. 여유가 있으면

- **CloudWatch 알람**: `/health` 실패나 실행 중인 작업 수 감소를 알림으로.
- **Cognito로 로그인 바꾸기** (지금은 이메일+비밀번호 로그인)
  - 서버: `apps/server/src/shared/auth/AuthProvider.ts` 인터페이스의 Cognito 구현을 만들어 `localAuth.ts` 대신 끼운다. 회원은 `users.auth_sub`(Cognito `sub`)로 연결하고, `/api/users/signup`·`/login`은 없어진다.
  - 화면: `apps/web/src/shared/api/session.ts`의 `signIn`이 Cognito를 부르게 하고 `shared/auth/LoginPage.tsx` 폼을 맞춘다. 세션 저장·구독은 그대로 쓴다.
  - 게스트(로그인 없이 방 입장)는 서버가 직접 토큰을 주므로 그대로 둔다. 기존 이메일 계정은 Cognito로 옮겨지지 않는다.
  - Cognito를 쓰면 로그인이 AWS의 https 화면에서 처리되어, 2번의 "http 비밀번호" 걱정이 사라진다.
- **일반 AWS 계정이라면**: 화면을 S3 + CloudFront에 올리고 `/api`, `/socket.io`(WebSocket 허용), `/health`만 ALB로 넘기는 구성도 된다. Route 53 + ACM으로 https 정식 주소를 붙일 수 있다.

### 참고: 서버가 하는 일

- `GET /health`: Redis·DB가 정상이면 200, 아니면 503. 서버가 종료 중일 때도 503이라 ALB가 새 연결을 보내지 않는다.
- 종료: SIGTERM을 받으면 새 연결을 막고 정리한 뒤 끈다 (`SHUTDOWN_TIMEOUT_MS`, 기본 10초). 끊긴 사용자는 다른 서버로 자동 재접속한다.
- 로그: 한 줄 JSON으로 stdout에 남는다 → CloudWatch Logs에서 검색하기 쉽다.
- 이미지 로컬 확인: `docker build -t jlounge .` → `docker run --env-file .env -p 3000:3000 jlounge` → http://localhost:3000 (이때 `.env`의 `localhost`는 `host.docker.internal`로 바꾼다).
- 전체 환경 변수 목록은 위 "환경 변수 (서버)" 표에 있다.
