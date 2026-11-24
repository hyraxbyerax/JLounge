import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { ApiError, api, errorMessage } from '../api';
import { toMinutes } from '../time';
import { WEEKDAY_LABEL, type TimetableEntry, type TimetableInput } from '../types';
import { Modal } from './Modal';

const ROW_H = 48; // 1시간당 높이(px)

/** 과목명으로 항상 같은 색을 만든다 */
function hue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

export function Timetable() {
  const [entries, setEntries] = useState<TimetableEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TimetableEntry | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setEntries(await api.listTimetable());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const layout = useMemo(() => {
    const list = entries ?? [];
    const first = Math.min(9, ...list.map((e) => Math.floor(toMinutes(e.startTime) / 60)));
    const last = Math.max(18, ...list.map((e) => Math.ceil(toMinutes(e.endTime) / 60)));
    const maxDay = Math.max(5, ...list.map((e) => e.weekday));
    return {
      first,
      last,
      days: Array.from({ length: maxDay }, (_, i) => i + 1),
      hours: Array.from({ length: last - first }, (_, i) => first + i),
    };
  }, [entries]);

  const save = async (input: TimetableInput) => {
    const saved =
      editing && editing !== 'new' ? await api.updateTimetable(editing.id, input) : await api.createTimetable(input);
    setEntries((prev) => [...(prev ?? []).filter((e) => e.id !== saved.id), saved]);
    setEditing(null);
  };

  const remove = async (e: TimetableEntry) => {
    if (!window.confirm(`'${e.courseName}' 수업을 삭제할까요?`)) return;
    try {
      await api.deleteTimetable(e.id);
      setEntries((prev) => (prev ?? []).filter((x) => x.id !== e.id));
      setEditing(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const todayIso = ((new Date().getDay() + 6) % 7) + 1; // 1=월 … 7=일

  return (
    <section className="panel" aria-label="시간표">
      <header className="panel-head">
        <h2>시간표</h2>
        <button className="btn primary" onClick={() => setEditing('new')}>
          + 수업 추가
        </button>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {entries === null && !error && <p className="muted">불러오는 중…</p>}
      {entries !== null && entries.length === 0 && (
        <p className="empty">등록된 수업이 없습니다. 수업을 추가해보세요.</p>
      )}

      {entries !== null && (
        <div className="tt" style={{ '--cols': layout.days.length } as CSSProperties}>
          <div className="tt-head">
            <span />
            {layout.days.map((d) => (
              <span key={d} className={d === todayIso ? 'today' : ''}>
                {WEEKDAY_LABEL[d]}
              </span>
            ))}
          </div>
          <div className="tt-body" style={{ height: layout.hours.length * ROW_H }}>
            <div className="tt-hours">
              {layout.hours.map((h) => (
                <span key={h} style={{ height: ROW_H }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {layout.days.map((d) => (
              <div key={d} className={`tt-col${d === todayIso ? ' today' : ''}`}>
                {layout.hours.map((h) => (
                  <div key={h} className="tt-row" style={{ height: ROW_H }} />
                ))}
                {entries
                  .filter((e) => e.weekday === d)
                  .map((e) => {
                    const top = ((toMinutes(e.startTime) - layout.first * 60) / 60) * ROW_H;
                    const height = ((toMinutes(e.endTime) - toMinutes(e.startTime)) / 60) * ROW_H;
                    const h = hue(e.courseName);
                    return (
                      <button
                        key={e.id}
                        className="tt-block"
                        style={{ top, height, background: `hsl(${h} 40% 88%)`, borderColor: `hsl(${h} 30% 48%)` }}
                        onClick={() => setEditing(e)}
                        aria-label={`${e.courseName} ${WEEKDAY_LABEL[e.weekday]}요일 ${e.startTime}-${e.endTime}`}
                      >
                        <strong>{e.courseName}</strong>
                        <span>
                          {e.startTime}–{e.endTime}
                        </span>
                        {e.location && <span>{e.location}</span>}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <TimetableForm
          initial={editing === 'new' ? null : editing}
          onSubmit={save}
          onDelete={editing === 'new' ? undefined : () => remove(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function TimetableForm({
  initial,
  onSubmit,
  onDelete,
  onClose,
}: {
  initial: TimetableEntry | null;
  onSubmit: (input: TimetableInput) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [courseName, setCourseName] = useState(initial?.courseName ?? '');
  const [weekday, setWeekday] = useState(initial?.weekday ?? 1);
  const [startTime, setStartTime] = useState(initial?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(initial?.endTime ?? '10:15');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!courseName.trim()) next.courseName = '과목명을 입력해주세요.';
    if (!startTime) next.startTime = '시작 시간을 입력해주세요.';
    if (!endTime) next.endTime = '종료 시간을 입력해주세요.';
    else if (startTime && endTime <= startTime) next.endTime = '종료 시간은 시작 시간보다 늦어야 합니다.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await onSubmit({ courseName: courseName.trim(), weekday, startTime, endTime, location: location.trim() });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? '수업 수정' : '수업 추가'} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span>과목명</span>
          <input value={courseName} onChange={(e) => setCourseName(e.target.value)} maxLength={50} autoFocus />
          {errors.courseName && <em className="field-error">{errors.courseName}</em>}
        </label>
        <label className="field">
          <span>요일</span>
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABEL[d]}요일
              </option>
            ))}
          </select>
        </label>
        <div className="two">
          <label className="field">
            <span>시작</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            {errors.startTime && <em className="field-error">{errors.startTime}</em>}
          </label>
          <label className="field">
            <span>종료</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            {errors.endTime && <em className="field-error">{errors.endTime}</em>}
          </label>
        </div>
        <label className="field">
          <span>강의실 (선택)</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={50} />
        </label>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <footer className="modal-actions">
          {onDelete && (
            <button type="button" className="btn danger left" onClick={onDelete}>
              삭제
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
