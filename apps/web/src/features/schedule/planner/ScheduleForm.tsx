import { useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../api';
import { localInputToUtcIso, utcIsoToLocalInput } from '../time';
import { TYPE_LABEL, type Schedule, type ScheduleInput, type ScheduleType } from '../types';
import { Modal } from './Modal';

interface Props {
  initial: Schedule | null; // null 이면 새 일정
  defaultDue: string; // datetime-local 값
  subjects: string[]; // 자동완성용 기존 과목명
  onSubmit: (input: ScheduleInput) => Promise<void>;
  onClose: () => void;
}

export function ScheduleForm({ initial, defaultDue, subjects, onSubmit, onClose }: Props) {
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [type, setType] = useState<ScheduleType>(initial?.type ?? 'assignment');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [due, setDue] = useState(initial ? utcIsoToLocalInput(initial.dueAt) : defaultDue);
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!subject.trim()) next.subject = '과목명을 입력해주세요.';
    if (!title.trim()) next.title = '일정명을 입력해주세요.';
    const dueAt = localInputToUtcIso(due); // 사용자 시간대 → UTC
    if (!dueAt) next.dueAt = '마감일을 올바르게 입력해주세요.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length || !dueAt) return;

    setBusy(true);
    try {
      await onSubmit({ subject: subject.trim(), type, title: title.trim(), dueAt, memo: memo.trim() });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? '일정 수정' : '일정 추가'} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <fieldset className="seg" aria-label="구분">
          {(Object.keys(TYPE_LABEL) as ScheduleType[]).map((t) => (
            <label key={t} className={type === t ? 'on' : ''}>
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} />
              {TYPE_LABEL[t]}
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span>과목명</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            list="subject-options"
            maxLength={50}
            autoFocus
          />
          <datalist id="subject-options">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {errors.subject && <em className="field-error">{errors.subject}</em>}
        </label>

        <label className="field">
          <span>일정명</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="예) 중간 보고서 제출"
          />
          {errors.title && <em className="field-error">{errors.title}</em>}
        </label>

        <label className="field">
          <span>마감</span>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          {errors.dueAt && <em className="field-error">{errors.dueAt}</em>}
        </label>

        <label className="field">
          <span>메모 (선택)</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={1000} />
          {errors.memo && <em className="field-error">{errors.memo}</em>}
        </label>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <footer className="modal-actions">
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
