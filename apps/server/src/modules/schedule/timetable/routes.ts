import { Router } from 'express';
import { currentUser } from '../../../shared/auth/middleware.ts';
import type { Queryable } from '../../../shared/db/pool.ts';
import { AppError } from '../../../shared/http/errors.ts';
import { validate } from '../../../shared/http/validate.ts';
import { idParam } from '../schedules/schema.ts';
import { createTimetableEntry, deleteTimetableEntry, listTimetable, updateTimetableEntry } from './repo.ts';
import { timetableInput } from './schema.ts';

const notFound = () => new AppError('NOT_FOUND', '시간표 항목을 찾을 수 없습니다.', 404);

/** 시간표 API (/api/schedule/timetable) */
export function timetableRouter(db: Queryable): Router {
  const router = Router();
  const userId = (res: Parameters<typeof currentUser>[0]) => currentUser(res).userId;

  router.get('/', async (_req, res) => {
    res.json({ data: await listTimetable(db, userId(res)) });
  });

  router.post('/', async (req, res) => {
    const input = validate(timetableInput, req.body);
    res.status(201).json({ data: await createTimetableEntry(db, userId(res), input) });
  });

  router.put('/:id', async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(timetableInput, req.body);
    const updated = await updateTimetableEntry(db, userId(res), id, input);
    if (!updated) throw notFound();
    res.json({ data: updated });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = validate(idParam, req.params);
    if (!(await deleteTimetableEntry(db, userId(res), id))) throw notFound();
    res.status(204).end();
  });

  return router;
}
