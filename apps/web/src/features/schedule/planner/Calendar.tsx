import { useMemo, useState } from 'react';
import { dateKey, dateKeyOf, monthGrid } from '../time';
import type { Schedule } from '../types';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_DOTS = 3;

interface Props {
  schedules: Schedule[];
  selectedDate: string | null;
  onSelect: (key: string | null) => void;
}

/** 휴대폰 달력처럼 날짜마다 일정이 있는지 점으로 보여 주는 월간 달력. 날짜를 누르면 아래 일정표가 그 날짜로 좁혀진다. */
export function Calendar({ schedules, selectedDate, onSelect }: Props) {
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const byDate = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const s of schedules) {
      const key = dateKeyOf(s.dueAt);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [schedules]);

  const cells = useMemo(() => monthGrid(view.year, view.month), [view]);
  const todayKey = dateKey(today);

  const move = (delta: number) => {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };
  const goToday = () => setView({ year: today.getFullYear(), month: today.getMonth() });

  return (
    <section className="calendar" aria-label="월간 달력">
      <header className="cal-head">
        <h2>
          {view.year}년 {view.month + 1}월
        </h2>
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="이전 달">
            ‹
          </button>
          <button className="btn small" onClick={goToday}>
            오늘
          </button>
          <button className="icon-btn" onClick={() => move(1)} aria-label="다음 달">
            ›
          </button>
        </div>
      </header>

      <div className="cal-grid cal-dow" role="row">
        {DOW.map((d, i) => (
          <span key={d} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>
            {d}
          </span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((d) => {
          const key = dateKey(d);
          const items = byDate.get(key) ?? [];
          const outside = d.getMonth() !== view.month;
          const cls = [
            'cal-cell',
            outside ? 'outside' : '',
            key === todayKey ? 'today' : '',
            key === selectedDate ? 'selected' : '',
            d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={key}
              className={cls}
              onClick={() => onSelect(key === selectedDate ? null : key)}
              aria-pressed={key === selectedDate}
              aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일${items.length ? `, 일정 ${items.length}개` : ''}`}
            >
              <span className="cal-day">{d.getDate()}</span>
              <span className="dots">
                {items.slice(0, MAX_DOTS).map((s) => (
                  <i key={s.id} className={`dot ${s.type}${s.isDone ? ' done' : ''}`} />
                ))}
                {items.length > MAX_DOTS && <b className="more">+{items.length - MAX_DOTS}</b>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="cal-legend small muted">
        <i className="dot assignment" /> 과제 <i className="dot exam" /> 시험 <i className="dot assignment done" /> 완료
      </p>
    </section>
  );
}
