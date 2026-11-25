import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, errorMessage } from '../api';
import { dateKeyOf, dueState, endOfDayInput, tomorrowEndOfDayInput } from '../time';
import type { Schedule, ScheduleInput, User } from '../types';
import { Calendar } from './Calendar';
import { FriendsPanel } from './FriendsPanel';
import { ScheduleForm } from './ScheduleForm';
import { ScheduleList } from './ScheduleList';
import { Timetable } from './Timetable';

type StatusFilter = 'open' | 'done' | 'all';

export interface PlannerPageProps {
  user: User;
  onLogout: () => void;
  /** 오른쪽 패널. 라운지의 친구·접속 현황 컴포넌트를 넣는 자리 (기본: 안내 문구가 있는 FriendsPanel) */
  sidebar?: ReactNode;
  /** 첫 화면으로 (왼쪽 위 JLounge 간판을 누르면. 라운지 사이트에 합치며 추가) */
  onBack?: () => void;
}

const sortByDue = (list: Schedule[]) => [...list].sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id - b.id); // 서버 정렬(due_at, id)과 같은 기준

function formatDateKey(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

export function PlannerPage({ user, onLogout, sidebar, onBack }: PlannerPageProps) {
  const [tab, setTab] = useState<'schedule' | 'timetable'>('schedule');
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSchedules(await api.listSchedules());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
    api
      .serverInfo()
      .then((i) => setInstance(i.instance))
      .catch(() => undefined);
  }, [load]);

  const subjects = useMemo(
    () => Array.from(new Set((schedules ?? []).map((s) => s.subject))).sort((a, b) => a.localeCompare(b, 'ko')),
    [schedules],
  );

  // 필터로 걸어 둔 과목의 일정이 모두 사라지면 필터를 푼다
  useEffect(() => {
    if (subjectFilter && schedules && !subjects.includes(subjectFilter)) setSubjectFilter('');
  }, [subjects, subjectFilter, schedules]);

  const bySubject = useMemo(
    () => (schedules ?? []).filter((s) => !subjectFilter || s.subject === subjectFilter),
    [schedules, subjectFilter],
  );
  const listItems = useMemo(
    () =>
      bySubject
        .filter((s) => (status === 'all' ? true : status === 'open' ? !s.isDone : s.isDone))
        .filter((s) => !selectedDate || dateKeyOf(s.dueAt) === selectedDate),
    [bySubject, status, selectedDate],
  );

  const stats = useMemo(() => {
    const now = new Date();
    let open = 0;
    let soon = 0;
    let overdue = 0;
    for (const s of bySubject) {
      const st = dueState(s.dueAt, s.isDone, now);
      if (st !== 'done') open += 1;
      if (st === 'soon') soon += 1;
      if (st === 'overdue') overdue += 1;
    }
    return { open, soon, overdue };
  }, [bySubject]);

  const upsert = (saved: Schedule) =>
    setSchedules((prev) => sortByDue([...(prev ?? []).filter((s) => s.id !== saved.id), saved]));

  const save = async (input: ScheduleInput) => {
    const saved =
      editing && editing !== 'new' ? await api.updateSchedule(editing.id, input) : await api.createSchedule(input);
    upsert(saved);
    setEditing(null);
  };

  const toggle = async (s: Schedule) => {
    try {
      upsert(await api.setDone(s.id, !s.isDone));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async (s: Schedule) => {
    if (!window.confirm(`'${s.title}' 일정을 삭제할까요?`)) return;
    try {
      await api.deleteSchedule(s.id);
      setSchedules((prev) => (prev ?? []).filter((x) => x.id !== s.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const emptyText =
    schedules && schedules.length === 0
      ? '등록된 일정이 없습니다. “+ 일정 추가”로 첫 일정을 등록해보세요.'
      : '조건에 맞는 일정이 없습니다.';

  return (
    <div className="planner">
      <header className="topbar">
        {/* 사이트 간판: 누르면 첫 화면으로 (라운지·플래너는 첫 화면에서만 고른다) */}
        <h1>
          {onBack ? (
            <button type="button" className="brand-link jlounge-logo is-small" onClick={onBack} title="첫 화면으로">
              JLounge
            </button>
          ) : (
            'JLounge'
          )}
        </h1>
        <nav className="tabs" aria-label="화면 전환">
          <button className={tab === 'schedule' ? 'on' : ''} onClick={() => setTab('schedule')}>
            일정
          </button>
          <button className={tab === 'timetable' ? 'on' : ''} onClick={() => setTab('timetable')}>
            시간표
          </button>
        </nav>
        <div className="who">
          <span className="small muted">{user.nickname}</span>
          <button className="btn small" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </header>

      <div className="split">
        <main className="main">
          {tab === 'timetable' ? (
            <Timetable />
          ) : (
            <>
              <Calendar schedules={bySubject} selectedDate={selectedDate} onSelect={setSelectedDate} />

              <section className="panel" aria-label="일정표">
                <header className="panel-head">
                  <h2>일정표</h2>
                  <button className="btn primary" onClick={() => setEditing('new')}>
                    + 일정 추가
                  </button>
                </header>

                <div className="filters">
                  <select
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                    aria-label="과목 필터"
                  >
                    <option value="">모든 과목</option>
                    {subjects.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <div className="seg" role="group" aria-label="완료 여부 필터">
                    {(
                      [
                        ['open', '미완료'],
                        ['done', '완료'],
                        ['all', '전체'],
                      ] as const
                    ).map(([v, label]) => (
                      <button key={v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {selectedDate && (
                    <button className="chip" onClick={() => setSelectedDate(null)}>
                      {formatDateKey(selectedDate)}만 보는 중 ✕
                    </button>
                  )}
                </div>

                <p className="stats small muted">
                  미완료 {stats.open}건 · <span className="soon-text">마감 임박 {stats.soon}건</span> ·{' '}
                  <span className="overdue-text">기한 지남 {stats.overdue}건</span>
                </p>

                {error && (
                  <p className="form-error" role="alert">
                    {error}{' '}
                    <button className="link" onClick={() => void load()}>
                      다시 불러오기
                    </button>
                  </p>
                )}
                {schedules === null && !error ? (
                  <p className="muted">불러오는 중…</p>
                ) : (
                  <ScheduleList
                    items={listItems}
                    emptyText={emptyText}
                    onToggle={toggle}
                    onEdit={(s) => setEditing(s)}
                    onDelete={remove}
                  />
                )}
              </section>
            </>
          )}
        </main>

        <aside className="side">{sidebar ?? <FriendsPanel />}</aside>
      </div>

      <footer className="foot small muted">{instance ? `응답 서버: ${instance}` : ' '}</footer>

      {editing && (
        <ScheduleForm
          initial={editing === 'new' ? null : editing}
          defaultDue={selectedDate ? endOfDayInput(selectedDate) : tomorrowEndOfDayInput()}
          subjects={subjects}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
