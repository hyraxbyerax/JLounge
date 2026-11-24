// 실제 PostgreSQL 을 대상으로 하는 통합 테스트 (캠퍼스 플래너 repo.integration.test.ts 를 옮긴 것).
// 실행: TEST_DATABASE_URL=postgres://...  npm run test   (먼저 npm run db:migrate 로 테이블을 만들어 둔다)
// 테스트는 자기가 만든 사용자만 지운다.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMember, findMemberByEmail } from '../../shared/auth/users.ts';
import type { Queryable } from '../../shared/db/pool.ts';
import { createSchedule, deleteSchedule, listSchedules, setScheduleDone, updateSchedule } from './schedules/repo.ts';
import { scheduleInput } from './schedules/schema.ts';
import { createTimetableEntry, deleteTimetableEntry, listTimetable, updateTimetableEntry } from './timetable/repo.ts';

const url = process.env.TEST_DATABASE_URL;
const run = `t${Date.now()}${Math.floor(Math.random() * 1e4)}`;

const input = (over: Record<string, unknown> = {}) =>
  scheduleInput.parse({
    subject: '클라우드 컴퓨팅',
    type: 'assignment',
    title: '제안서',
    dueAt: '2026-11-05T14:59:00.000Z',
    ...over,
  });

const member = async (db: Queryable, name: string) =>
  (await createMember(db, { email: `${name}-${run}@example.com`, nickname: name, passwordHash: 'x' })).user_id;

const pgCode = (code: string) => expect.objectContaining({ code });

describe.skipIf(!url)('PostgreSQL 저장소 (TEST_DATABASE_URL 이 있을 때만)', () => {
  let pool: pg.Pool;
  let db: Queryable;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 2, options: '-c timezone=UTC' });
    db = pool;
    alice = await member(db, 'alice');
    bob = await member(db, 'bob');
  });

  afterAll(async () => {
    await db.query('delete from users where user_id = any($1::text[])', [[alice, bob]]);
    await pool.end();
  });

  it('이메일은 대소문자 구분 없이 중복 불가(23505)', async () => {
    await expect(
      createMember(db, { email: `ALICE-${run}@example.com`, nickname: 'dup', passwordHash: 'x' }),
    ).rejects.toEqual(pgCode('23505'));
    expect((await findMemberByEmail(db, `Alice-${run}@Example.com`))?.user_id).toBe(alice);
  });

  it('마감 시각은 timestamptz 에 UTC 순간으로 저장되고 UTC ISO 로 돌아온다', async () => {
    const kst = await createSchedule(db, alice, input({ title: 'KST 입력', dueAt: '2026-11-05T23:59:00+09:00' }));
    expect(kst.dueAt).toBe('2026-11-05T14:59:00.000Z');
    expect(kst.createdAt).toMatch(/Z$/);
    const { rows } = await db.query(
      `select pg_typeof(due_at)::text as t, pg_typeof(created_at)::text as c,
              to_char(due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as utc
         from schedules where id = $1`,
      [kst.id],
    );
    expect(rows[0]).toEqual({ t: 'timestamp with time zone', c: 'timestamp with time zone', utc: '2026-11-05T14:59' });
  });

  it('목록은 마감이 가까운 순, 필터, 사용자별 분리', async () => {
    const u = await member(db, 'list');
    try {
      const late = await createSchedule(db, u, input({ title: 'late', dueAt: '2026-12-01T00:00:00Z' }));
      const early = await createSchedule(
        db,
        u,
        input({ title: 'early', dueAt: '2026-11-01T00:00:00Z', subject: '운영체제' }),
      );
      const mid = await createSchedule(db, u, input({ title: 'mid', dueAt: '2026-11-15T00:00:00Z', type: 'exam' }));
      await setScheduleDone(db, u, mid.id, true);

      expect((await listSchedules(db, u, {})).map((s) => s.title)).toEqual(['early', 'mid', 'late']);
      expect((await listSchedules(db, u, { done: false })).map((s) => s.title)).toEqual(['early', 'late']);
      expect((await listSchedules(db, u, { done: true })).map((s) => s.title)).toEqual(['mid']);
      expect((await listSchedules(db, u, { subject: '운영체제' })).map((s) => s.id)).toEqual([early.id]);
      expect(await listSchedules(db, u, { subject: '운영체제', done: true })).toEqual([]);
      expect(await listSchedules(db, bob, {})).toEqual([]);
      expect(late.id).toBeGreaterThan(0);
    } finally {
      await db.query('delete from users where user_id = $1', [u]);
    }
  });

  it('수정·완료 체크·삭제는 소유자만 가능하다', async () => {
    const s = await createSchedule(db, alice, input({ title: '내 일정' }));
    expect(await updateSchedule(db, bob, s.id, input({ title: '탈취' }))).toBeNull();
    expect(await setScheduleDone(db, bob, s.id, true)).toBeNull();
    expect(await deleteSchedule(db, bob, s.id)).toBe(false);
    expect((await listSchedules(db, alice, {})).find((x) => x.id === s.id)?.title).toBe('내 일정');

    const updated = await updateSchedule(
      db,
      alice,
      s.id,
      input({ title: '수정됨', dueAt: '2026-11-06T01:00:00Z', memo: '메모', type: 'exam' }),
    );
    expect(updated).toMatchObject({ title: '수정됨', dueAt: '2026-11-06T01:00:00.000Z', type: 'exam', memo: '메모' });
    expect(await updateSchedule(db, alice, 2_000_000_000, input())).toBeNull();

    expect(await deleteSchedule(db, alice, s.id)).toBe(true);
    expect(await deleteSchedule(db, alice, s.id)).toBe(false);
  });

  it('완료 체크: 지정한 값으로 설정, 완료 시각은 처음 완료한 때를 유지, 해제하면 비운다', async () => {
    const s = await createSchedule(db, alice, input({ title: '완료 테스트' }));
    expect(s.isDone).toBe(false);
    expect(s.completedAt).toBeNull();

    const done1 = await setScheduleDone(db, alice, s.id, true);
    expect(done1?.isDone).toBe(true);
    expect(done1?.completedAt ?? '').toMatch(/Z$/);
    await new Promise((r) => setTimeout(r, 15));
    const done2 = await setScheduleDone(db, alice, s.id, true); // 중복 요청이어도 결과가 같다
    expect(done2?.completedAt).toBe(done1?.completedAt);

    const undone = await setScheduleDone(db, alice, s.id, false);
    expect(undone?.isDone).toBe(false);
    expect(undone?.completedAt).toBeNull();
    expect(undone && undone.updatedAt >= undone.createdAt).toBe(true);
  });

  it('DB 제약: 빈 제목·잘못된 구분은 앱 검증을 우회해도 거부된다(23514)', async () => {
    await expect(
      db.query(
        `insert into schedules (user_id, subject, type, title, due_at) values ($1, 's', 'assignment', '   ', now())`,
        [alice],
      ),
    ).rejects.toEqual(pgCode('23514'));
    await expect(
      db.query(`insert into schedules (user_id, subject, type, title, due_at) values ($1, 's', 'quiz', 't', now())`, [
        alice,
      ]),
    ).rejects.toEqual(pgCode('23514'));
  });

  it('시간표: 요일·시작 시각 순 정렬, 소유자 분리, 시간 순서 제약', async () => {
    const mk = (over: Record<string, unknown>) =>
      ({ courseName: '과목', weekday: 1, startTime: '09:00', endTime: '10:15', location: '', ...over }) as Parameters<
        typeof createTimetableEntry
      >[2];
    const b = await createTimetableEntry(
      db,
      alice,
      mk({ courseName: '수요일 오후', weekday: 3, startTime: '13:00', endTime: '14:15' }),
    );
    const a2 = await createTimetableEntry(
      db,
      alice,
      mk({ courseName: '월요일 오후', startTime: '13:00', endTime: '14:15' }),
    );
    const a1 = await createTimetableEntry(db, alice, mk({ courseName: '월요일 오전', location: '공대 7호관' }));
    const list = await listTimetable(db, alice);
    expect(list.map((e) => e.courseName)).toEqual(['월요일 오전', '월요일 오후', '수요일 오후']);
    expect(list[0]?.startTime).toBe('09:00');
    expect(list[0]?.location).toBe('공대 7호관');
    expect(await listTimetable(db, bob)).toEqual([]);

    expect(await updateTimetableEntry(db, bob, a1.id, mk({}))).toBeNull();
    expect(
      (await updateTimetableEntry(db, alice, a1.id, mk({ courseName: '바뀜', weekday: 5, endTime: '11:00' })))?.endTime,
    ).toBe('11:00');
    expect(await deleteTimetableEntry(db, bob, b.id)).toBe(false);
    expect(await deleteTimetableEntry(db, alice, b.id)).toBe(true);
    expect(await deleteTimetableEntry(db, alice, a2.id)).toBe(true);

    await expect(
      db.query(
        `insert into timetable_entries (user_id, course_name, weekday, start_time, end_time) values ($1, 'x', 1, '10:00', '09:00')`,
        [alice],
      ),
    ).rejects.toEqual(pgCode('23514'));
  });

  it('사용자를 지우면 그 사용자의 일정·시간표도 함께 지워진다(CASCADE)', async () => {
    const u = await member(db, 'casc');
    await createSchedule(db, u, input());
    await createTimetableEntry(db, u, {
      courseName: 'c',
      weekday: 1,
      startTime: '09:00',
      endTime: '10:00',
      location: '',
    });
    await db.query('delete from users where user_id = $1', [u]);
    expect((await db.query('select 1 from schedules where user_id = $1', [u])).rows).toHaveLength(0);
    expect((await db.query('select 1 from timetable_entries where user_id = $1', [u])).rows).toHaveLength(0);
  });
});
