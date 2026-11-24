// 캠퍼스 플래너 server/test/schema.test.ts 를 Vitest로 옮긴 것 (내용은 그대로)
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../shared/auth/password.ts';
import { withObjectParticle, withTopicParticle } from '../../shared/http/validate.ts';
import { toScheduleDto } from './schedules/repo.ts';
import { doneInput, idParam, listQuery, scheduleInput } from './schedules/schema.ts';
import { toTimetableDto } from './timetable/repo.ts';
import { timetableInput } from './timetable/schema.ts';

const valid = {
  subject: '클라우드 컴퓨팅',
  type: 'assignment',
  title: '기말 프로젝트 제안서',
  dueAt: '2026-11-05T14:59:00.000Z',
  memo: '',
};

describe('일정 입력 검증', () => {
  it('정상 입력은 통과하고 dueAt 은 Date(UTC 순간)로 변환된다', () => {
    const r = scheduleInput.parse(valid);
    expect(r.dueAt).toBeInstanceOf(Date);
    expect(r.dueAt.toISOString()).toBe('2026-11-05T14:59:00.000Z');
  });

  it('KST(+09:00) 오프셋 입력도 같은 UTC 순간으로 저장된다', () => {
    const r = scheduleInput.parse({ ...valid, dueAt: '2026-11-05T23:59:00+09:00' });
    expect(r.dueAt.toISOString()).toBe('2026-11-05T14:59:00.000Z');
  });

  it('시간대 없는 날짜/시각은 거부한다', () => {
    for (const dueAt of ['2026-11-05', '2026-11-05T23:59:00', '11월 5일', '', 'abc']) {
      expect(scheduleInput.safeParse({ ...valid, dueAt }).success, dueAt).toBe(false);
    }
  });

  it('존재하지 않는 날짜(2월 31일)와 범위 밖 연도는 거부한다', () => {
    expect(scheduleInput.safeParse({ ...valid, dueAt: '2026-02-31T00:00:00Z' }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...valid, dueAt: '1999-12-31T00:00:00Z' }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...valid, dueAt: '2101-01-01T00:00:00Z' }).success).toBe(false);
  });

  it('빈 제목/공백 제목은 한국어 메시지로 거부한다', () => {
    for (const title of ['', '   ']) {
      const r = scheduleInput.safeParse({ ...valid, title });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toBe('일정명을 입력해주세요.');
    }
  });

  it('구분은 assignment/exam 만, 필수값 누락과 모르는 필드는 거부', () => {
    expect(scheduleInput.safeParse({ ...valid, type: 'quiz' }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...valid, subject: undefined }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...valid, userId: 'x' }).success).toBe(false);
    expect(scheduleInput.parse({ ...valid, memo: undefined }).memo).toBe('');
  });

  it('앞뒤 공백은 제거되고 길이 제한을 건다', () => {
    expect(scheduleInput.parse({ ...valid, title: '  과제  ' }).title).toBe('과제');
    expect(scheduleInput.safeParse({ ...valid, title: 'a'.repeat(101) }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...valid, memo: 'a'.repeat(1001) }).success).toBe(false);
  });

  it('완료 체크 / 목록 쿼리 / id 파라미터', () => {
    expect(doneInput.safeParse({ isDone: true }).success).toBe(true);
    expect(doneInput.safeParse({ isDone: 'true' }).success).toBe(false);
    expect(doneInput.safeParse({}).success).toBe(false);
    const empty = listQuery.parse({});
    expect(empty.subject).toBeUndefined();
    expect(empty.done).toBeUndefined();
    expect(listQuery.parse({ done: 'false' }).done).toBe(false);
    expect(listQuery.safeParse({ done: 'maybe' }).success).toBe(false);
    expect(idParam.parse({ id: '12' }).id).toBe(12);
    for (const id of ['0', '-1', 'abc', '1.5', '99999999999'])
      expect(idParam.safeParse({ id }).success, id).toBe(false);
  });
});

describe('시간표 입력 검증', () => {
  it('종료가 시작보다 늦어야 하고 HH:MM 형식만 허용', () => {
    const ok = { courseName: '운영체제', weekday: 1, startTime: '09:00', endTime: '10:15', location: '공대 7호관' };
    expect(timetableInput.safeParse(ok).success).toBe(true);
    expect(timetableInput.safeParse({ ...ok, endTime: '09:00' }).success).toBe(false);
    expect(timetableInput.safeParse({ ...ok, endTime: '08:00' }).success).toBe(false);
    expect(timetableInput.safeParse({ ...ok, startTime: '9:00' }).success).toBe(false);
    expect(timetableInput.safeParse({ ...ok, startTime: '24:00' }).success).toBe(false);
    expect(timetableInput.safeParse({ ...ok, weekday: 0 }).success).toBe(false);
    expect(timetableInput.safeParse({ ...ok, weekday: 8 }).success).toBe(false);
  });
});

describe('DTO와 공통 도구', () => {
  it('모든 시각이 UTC ISO 문자열(Z)로 나간다', () => {
    const d = new Date('2026-11-05T14:59:00.000Z');
    const dto = toScheduleDto({
      id: 1,
      subject: 's',
      type: 'exam',
      title: 't',
      due_at: d,
      memo: '',
      is_done: false,
      completed_at: null,
      created_at: d,
      updated_at: d,
    });
    expect(dto.dueAt).toBe('2026-11-05T14:59:00.000Z');
    expect(dto.completedAt).toBeNull();
    expect(dto.createdAt).toMatch(/Z$/);
    expect(
      toTimetableDto({
        id: 3,
        course_name: 'c',
        weekday: 2,
        start_time: '09:00:00',
        end_time: '10:15:00',
        location: '',
      }).startTime,
    ).toBe('09:00');
  });

  it('비밀번호: 해시는 매번 달라도 검증은 통과, 틀린 비밀번호는 실패', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('wrong', a)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('한국어 조사: 받침 유무에 따라 을/를, 은/는', () => {
    expect(withObjectParticle('과목명')).toBe('과목명을');
    expect(withObjectParticle('일정명')).toBe('일정명을');
    expect(withObjectParticle('닉네임')).toBe('닉네임을');
    expect(withObjectParticle('메모')).toBe('메모를');
    expect(withTopicParticle('강의실')).toBe('강의실은');
    expect(withTopicParticle('메모')).toBe('메모는');
    expect(scheduleInput.safeParse({ ...valid, subject: '' }).error?.issues[0]?.message).toBe('과목명을 입력해주세요.');
  });
});
