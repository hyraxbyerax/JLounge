import { Router } from 'express';
import { currentUser } from '../../../shared/auth/middleware.ts';
import type { Queryable } from '../../../shared/db/pool.ts';
import { AppError } from '../../../shared/http/errors.ts';
import { validate } from '../../../shared/http/validate.ts';
import { createSchedule, deleteSchedule, listSchedules, setScheduleDone, updateSchedule } from './repo.ts';
import { doneInput, idParam, listQuery, scheduleInput } from './schema.ts';

const notFound = () => new AppError('NOT_FOUND', '일정을 찾을 수 없습니다.', 404);

/** 일정 API (/api/schedule/items). 로그인 확인은 상위 라우터(modules/schedule/index.ts)가 한다 */
export function schedulesRouter(db: Queryable): Router {
  const router = Router();
  const userId = (res: Parameters<typeof currentUser>[0]) => currentUser(res).userId;

  // F-02 목록 조회 (마감일 가까운 순) + F-06 필터(?subject=&done=)
  router.get('/', async (req, res) => {
    const filter = validate(listQuery, req.query);
    res.json({ data: await listSchedules(db, userId(res), filter) });
  });

  // F-01 등록
  router.post('/', async (req, res) => {
    const input = validate(scheduleInput, req.body);
    res.status(201).json({ data: await createSchedule(db, userId(res), input) });
  });

  // F-03 수정
  router.put('/:id', async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(scheduleInput, req.body);
    const updated = await updateSchedule(db, userId(res), id, input);
    if (!updated) throw notFound();
    res.json({ data: updated });
  });

  // F-05 완료 체크
  router.patch('/:id/done', async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { isDone } = validate(doneInput, req.body);
    const updated = await setScheduleDone(db, userId(res), id, isDone);
    if (!updated) throw notFound();
    res.json({ data: updated });
  });

  // F-04 삭제
  router.delete('/:id', async (req, res) => {
    const { id } = validate(idParam, req.params);
    const deleted = await deleteSchedule(db, userId(res), id);
    if (!deleted) throw notFound();
    res.status(204).end();
  });

  return router;
}
