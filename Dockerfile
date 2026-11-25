# 라운지 이미지: 서버 + 화면 파일 (AWS ECS/EC2 등에서 실행). 저장소 루트에서:
#   docker build -t lounge-server .
#   docker run --env-file .env -p 3000:3000 lounge-server   → http://localhost:3000 에서 화면까지 열린다
# 서버가 화면도 같은 주소로 내보낸다 (WEB_DIST_DIR). CloudFront를 못 쓰는 AWS Learner Lab 기준.
# DB 마이그레이션은 서버 시작과 따로 한 번 실행한다:
#   docker run --env-file .env lounge-server node --disable-warning=ExperimentalWarning apps/server/src/shared/db/migrate.ts

# 1) 화면 빌드 (빌드 도구가 필요해서 단계를 나눈다. 최종 이미지에는 결과물만 들어간다)
FROM node:24-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w @lounge/web -w @lounge/shared
COPY packages/shared/src packages/shared/src
COPY apps/web apps/web
RUN npm run build -w @lounge/web

# 2) 실행 이미지
FROM node:24-slim

ENV NODE_ENV=production
ENV WEB_DIST_DIR=/app/apps/web/dist
WORKDIR /app

# 의존성 먼저 (소스만 바뀌면 이 단계는 캐시를 쓴다)
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev -w @lounge/server -w @lounge/shared && npm cache clean --force

COPY packages/shared/src packages/shared/src
COPY apps/server/src apps/server/src
COPY --from=web /app/apps/web/dist apps/web/dist

USER node
EXPOSE 3000
# SIGTERM 을 받으면 새 연결을 받지 않고 정리한 뒤 종료한다 (apps/server/src/index.ts)
CMD ["node", "--disable-warning=ExperimentalWarning", "apps/server/src/index.ts"]
