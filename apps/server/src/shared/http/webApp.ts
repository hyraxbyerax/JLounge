/*
 * 화면(빌드된 React 앱)을 서버가 같은 주소로 내보낸다.
 * - /assets/* 는 파일 이름에 내용 해시가 붙어 있어 오래 캐시한다
 * - 그 밖의 화면 주소(/, /room/ABC123 등)는 index.html 을 돌려주고, 화면이 주소를 보고 알아서 연다
 * - /api, /health, /socket.io 는 건드리지 않는다 (없는 API는 JSON 404 그대로)
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';

// 화면 주소가 아닌 것: 없는 화면 파일(/assets/옛날파일.js)에 index.html 을 주면 브라우저가 헷갈리므로 404로 둔다
const NOT_PAGES = /^\/(api|health|socket\.io|assets)(\/|$)/;

export function webAppRouter(webDir: string): Router {
  const dir = path.resolve(webDir);
  const indexFile = path.join(dir, 'index.html');
  if (!existsSync(indexFile)) throw new Error(`화면 빌드 파일이 없어요: ${indexFile} (npm run build -w @lounge/web)`);

  const router = Router();
  router.use('/assets', express.static(path.join(dir, 'assets'), { immutable: true, maxAge: '1y' }));
  router.use(express.static(dir, { index: false, maxAge: '1h' }));
  router.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || NOT_PAGES.test(req.path)) return next();
    // 새로 배포하면 바로 새 화면을 받도록 index.html 은 캐시하지 않는다
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });
  return router;
}
