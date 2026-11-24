import { dDayLabel, dueState, formatDue } from '../time';
import { TYPE_LABEL, type Schedule } from '../types';

interface Props {
  items: Schedule[];
  emptyText: string;
  onToggle: (s: Schedule) => void;
  onEdit: (s: Schedule) => void;
  onDelete: (s: Schedule) => void;
}

/** 서버가 마감일 가까운 순으로 내려준 순서 그대로 보여 준다. 3일 이내는 강조, 지난 일정은 빨간색. */
export function ScheduleList({ items, emptyText, onToggle, onEdit, onDelete }: Props) {
  if (items.length === 0) return <p className="empty">{emptyText}</p>;
  const now = new Date();
  return (
    <ul className="schedule-list">
      {items.map((s) => {
        const state = dueState(s.dueAt, s.isDone, now);
        return (
          <li key={s.id} className={`schedule ${state}`}>
            <input
              type="checkbox"
              className="check"
              checked={s.isDone}
              onChange={() => onToggle(s)}
              aria-label={`${s.title} 완료`}
            />
            <div className="schedule-body">
              <div className="schedule-title">
                <span className={`badge ${s.type}`}>{TYPE_LABEL[s.type]}</span>
                <span className="title-text">{s.title}</span>
              </div>
              <div className="schedule-meta small">
                <span>{s.subject}</span>
                <span className="sep">·</span>
                <span className="due">{formatDue(s.dueAt)}</span>
                {state !== 'done' && <span className={`dday ${state}`}>{dDayLabel(s.dueAt, now)}</span>}
                {state === 'soon' && <span className="flag">마감 임박</span>}
                {state === 'overdue' && <span className="flag">기한 지남</span>}
              </div>
              {s.memo && <p className="memo small muted">{s.memo}</p>}
            </div>
            <div className="row-actions">
              <button className="btn small" onClick={() => onEdit(s)}>
                수정
              </button>
              <button className="btn small danger" onClick={() => onDelete(s)}>
                삭제
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
