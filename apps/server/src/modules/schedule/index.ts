/*
 * 캠퍼스 플래너(스케줄러 파트) 서버의 입구. 팀원이 만든 campus-planner 를 옮겨 왔다.
 * 로그인한 회원만 쓸 수 있다 (게스트는 403 LOGIN_REQUIRED).
 * 상태는 DB에만 둔다 (서버가 여러 대여도 동작하게).
 */
import os from 'node:os';
import { Router } from 'express';
import type { AuthProvider } from '../../shared/auth/AuthProvider.ts';
import { requireAuth, requireMember } from '../../shared/auth/middleware.ts';
import type { Queryable } from '../../shared/db/pool.ts';
import { schedulesRouter } from './schedules/routes.ts';
import { timetableRouter } from './timetable/routes.ts';

type Deps = {
  auth: AuthProvider;
  db: Queryable;
  /** 화면 아래 "응답 서버" 표시용 (로드 밸런싱 시연). 없으면 컴퓨터 이름 */
  instanceName?: string;
};

/** /api/schedule/* : items(일정), timetable(시간표), server-info */
export function scheduleRouter({ auth, db, instanceName }: Deps): Router {
  const router = Router();
  const instance = instanceName ?? os.hostname();

  router.use(requireAuth(auth), requireMember);
  router.get('/server-info', (_req, res) => {
    res.json({ data: { instance } });
  });
  router.use('/items', schedulesRouter(db));
  router.use('/timetable', timetableRouter(db));
  return router;
}
