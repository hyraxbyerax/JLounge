import type { Queryable } from '../../../shared/db/pool.ts';
import type { TimetableInput } from './schema.ts';

export interface TimetableRow {
  id: number;
  course_name: string;
  weekday: number;
  start_time: string; // 'HH:MM:SS'
  end_time: string;
  location: string;
}

export interface TimetableDto {
  id: number;
  courseName: string;
  weekday: number; // 1=월 … 7=일
  startTime: string; // 'HH:MM' (학교 달력 기준 시각, UTC 아님)
  endTime: string;
  location: string;
}

export function toTimetableDto(row: TimetableRow): TimetableDto {
  return {
    id: row.id,
    courseName: row.course_name,
    weekday: row.weekday,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    location: row.location,
  };
}

const COLUMNS = 'id, course_name, weekday, start_time, end_time, location';

export async function listTimetable(db: Queryable, userId: string): Promise<TimetableDto[]> {
  const { rows } = await db.query<TimetableRow>(
    `SELECT ${COLUMNS} FROM timetable_entries WHERE user_id = $1 ORDER BY weekday, start_time, id`,
    [userId],
  );
  return rows.map(toTimetableDto);
}

export async function createTimetableEntry(
  db: Queryable,
  userId: string,
  input: TimetableInput,
): Promise<TimetableDto> {
  const { rows } = await db.query<TimetableRow>(
    `INSERT INTO timetable_entries (user_id, course_name, weekday, start_time, end_time, location)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [userId, input.courseName, input.weekday, input.startTime, input.endTime, input.location],
  );
  return toTimetableDto(rows[0]!);
}

export async function updateTimetableEntry(
  db: Queryable,
  userId: string,
  id: number,
  input: TimetableInput,
): Promise<TimetableDto | null> {
  const { rows } = await db.query<TimetableRow>(
    `UPDATE timetable_entries
        SET course_name = $3, weekday = $4, start_time = $5, end_time = $6, location = $7, updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${COLUMNS}`,
    [id, userId, input.courseName, input.weekday, input.startTime, input.endTime, input.location],
  );
  return rows[0] ? toTimetableDto(rows[0]) : null;
}

export async function deleteTimetableEntry(db: Queryable, userId: string, id: number): Promise<boolean> {
  const { rows } = await db.query<{ id: number }>(
    'DELETE FROM timetable_entries WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId],
  );
  return rows.length > 0;
}
