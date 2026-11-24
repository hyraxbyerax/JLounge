# 라운지 서버 이미지 (AWS ECS/EC2 등에서 실행). 저장소 루트에서:
#   docker build -t lounge-server .
#   docker run --env-file .env -p 3000:3000 lounge-server
# 화면(apps/web)은 들어가지 않는다 (정적 파일로 따로 배포: S3 + CloudFront 등).
# DB 마이그레이션은 서버 시작과 따로 한 번 실행한다:
#   docker run --env-file .env lounge-server node --disable-warning=ExperimentalWarning apps/server/src/shared/db/migrate.ts
FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

# 의존성 먼저 (소스만 바뀌면 이 단계는 캐시를 쓴다)
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev -w @lounge/server -w @lounge/shared && npm cache clean --force

COPY packages/shared/src packages/shared/src
COPY apps/server/src apps/server/src

USER node
EXPOSE 3000
# SIGTERM 을 받으면 새 연결을 받지 않고 정리한 뒤 종료한다 (apps/server/src/index.ts)
CMD ["node", "--disable-warning=ExperimentalWarning", "apps/server/src/index.ts"]
