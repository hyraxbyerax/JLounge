import { useState } from 'react';
import './home.css';

/** 스케줄 관리 자리 (낮 모드). 스케줄러 팀원이 개발한 화면으로 바뀐다. */
export function SchedulePlaceholder({ onBack }: { onBack: () => void }) {
  const [loggedIn, setLoggedIn] = useState(false);

  return (
    <div className="schedule-page" data-theme="day">
      <div className="schedule-card">
        {loggedIn ? (
          <>
            <h1 className="schedule-title">준비 중이에요</h1>
            <p className="muted">스케줄 관리는 곧 열려요. 그동안 라운지에서 쉬어가세요.</p>
          </>
        ) : (
          <>
            <h1 className="schedule-title">로그인이 필요해요</h1>
            <p className="muted">스케줄 관리는 로그인한 학생만 쓸 수 있어요.</p>
            <button type="button" className="btn btn-primary" onClick={() => setLoggedIn(true)}>
              로그인
            </button>
          </>
        )}
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          라운지로 돌아가기
        </button>
      </div>
    </div>
  );
}
