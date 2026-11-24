import type { Queryable } from '../../../shared/db/pool.ts';
import type { ListFilter, ScheduleInput, ScheduleType } from './schema.ts';

export interface ScheduleRow {
  id: number;
  subject: string;
  type: ScheduleType;
  title: string;
  due_at: Date;
  memo: string;
  is_done: boolean;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** API 로 내보내는 형태. 모든 시각은 UTC ISO 8601 문자열(…Z)이다. */
export interface ScheduleDto {
  id: number;
  subject: string;
  type: ScheduleType;
  title: string;
  dueAt: string;
  memo: string;
  isDone: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toScheduleDto(row: ScheduleRow): ScheduleDto {
  return {
    id: row.id,
    subject: row.subject,
    type: row.type,
    title: row.title,
    dueAt: row.due_at.toISOString(),
    memo: row.memo,
    isDone: row.is_done,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const COLUMNS = 'id, subject, type, title, due_at, memo, is_done, completed_at, created_at, updated_at';

// 모든 질의는 user_id 로 소유자를 확인한다. 남의 일정은 "없는 일정"(null)으로 취급한다.

export async function listSchedules(db: Queryable, userId: string, filter: ListFilter): Promise<ScheduleDto[]> {
  const { rows } = await db.query<ScheduleRow>(
    `SELECT ${COLUMNS} FROM schedules
      WHERE user_id = $1
        AND ($2::text    IS NULL OR subject = $2)
        AND ($3::boolean IS NULL OR is_done = $3)
      ORDER BY due_at ASC, id ASC`,
    [userId, filter.subject ?? null, filter.done ?? null],
  );
  return rows.map(toScheduleDto);
}

export async function createSchedule(db: Queryable, userId: string, input: ScheduleInput): Promise<ScheduleDto> {
  const { rows } = await db.query<ScheduleRow>(
    `INSERT INTO schedules (user_id, subject, type, title, due_at, memo)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [userId, input.subject, input.type, input.title, input.dueAt, input.memo],
  );
  return toScheduleDto(rows[0]!);
}

export async function updateSchedule(
  db: Queryable,
  userId: string,
  id: number,
  input: ScheduleInput,
): Promise<ScheduleDto | null> {
  const { rows } = await db.query<ScheduleRow>(
    `UPDATE schedules
        SET subject = $3, type = $4, title = $5, due_at = $6, memo = $7, updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${COLUMNS}`,
    [id, userId, input.subject, input.type, input.title, input.dueAt, input.memo],
  );
  return rows[0] ? toScheduleDto(rows[0]) : null;
}

/** 완료 여부를 "지정한 값"으로 설정한다(토글이 아니라 설정이라 요청이 중복돼도 결과가 같다). */
export async function setScheduleDone(
  db: Queryable,
  userId: string,
  id: number,
  isDone: boolean,
): Promise<ScheduleDto | null> {
  const { rows } = await db.query<ScheduleRow>(
    `UPDATE schedules
        SET is_done = $3::boolean,
            completed_at = CASE WHEN $3::boolean THEN COALESCE(completed_at, now()) ELSE NULL END,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${COLUMNS}`,
    [id, userId, isDone],
  );
  return rows[0] ? toScheduleDto(rows[0]) : null;
}

export async function deleteSchedule(db: Queryable, userId: string, id: number): Promise<boolean> {
  const { rows } = await db.query<{ id: number }>('DELETE FROM schedules WHERE id = $1 AND user_id = $2 RETURNING id', [
    id,
    userId,
  ]);
  return rows.length > 0;
}
