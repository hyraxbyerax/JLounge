/*
 * 메인 화면 큰 아이콘 (픽셀 그림, SVG 사각형으로 그린다 — 확대해도 칸이 또렷하게 crispEdges).
 * 색은 디자인 토큰을 그대로 쓴다.
 */

/** 분홍 픽셀 문: 테두리·문판 두 칸·동그란 손잡이 */
export function DoorIcon() {
  return (
    <svg className="home-icon" viewBox="0 0 24 30" shapeRendering="crispEdges" aria-hidden="true">
      {/* 문틀 */}
      <rect x="2" y="1" width="20" height="28" fill="var(--color-line)" />
      {/* 문 */}
      <rect x="4" y="3" width="16" height="26" fill="var(--color-light)" />
      {/* 윗판·아랫판 (조금 밝게) */}
      <rect x="6" y="5" width="12" height="9" fill="var(--door-panel)" />
      <rect x="6" y="16" width="12" height="10" fill="var(--door-panel)" />
      <rect x="6" y="5" width="12" height="1" fill="var(--door-shine)" />
      <rect x="6" y="17" width="7" height="1" fill="var(--door-shine)" />
      {/* 손잡이 (동그랗게 보이도록 칸을 깎는다) */}
      <rect x="15" y="14" width="3" height="1" fill="var(--color-line)" />
      <rect x="14" y="15" width="5" height="2" fill="var(--color-line)" />
      <rect x="15" y="17" width="3" height="1" fill="var(--color-line)" />
      <rect x="15" y="15" width="3" height="2" fill="var(--door-knob)" />
      <rect x="15" y="15" width="1" height="1" fill="var(--color-surface)" />
      {/* 바닥 */}
      <rect x="0" y="29" width="24" height="1" fill="var(--color-line)" />
    </svg>
  );
}

/** 픽셀 달력: 고리 두 개, 하늘색 머리띠, 날짜 칸 (오늘은 분홍) */
export function CalendarIcon() {
  const days = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const today = row === 1 && col === 2;
      days.push(
        <rect
          key={`${row}-${col}`}
          x={5 + col * 4}
          y={14 + row * 4}
          width="3"
          height="3"
          fill={today ? 'var(--color-light)' : 'var(--calendar-day)'}
        />,
      );
    }
  }
  return (
    <svg className="home-icon" viewBox="0 0 24 30" shapeRendering="crispEdges" aria-hidden="true">
      {/* 몸통 */}
      <rect x="1" y="5" width="22" height="24" fill="var(--color-line)" />
      <rect x="3" y="7" width="18" height="20" fill="var(--color-surface)" />
      {/* 머리띠 */}
      <rect x="3" y="7" width="18" height="5" fill="var(--color-cool-fill)" />
      <rect x="3" y="12" width="18" height="1" fill="var(--color-line)" />
      {/* 고리 */}
      <rect x="6" y="2" width="2" height="7" fill="var(--color-line)" />
      <rect x="16" y="2" width="2" height="7" fill="var(--color-line)" />
      <rect x="6" y="3" width="1" height="2" fill="var(--color-surface)" />
      <rect x="16" y="3" width="1" height="2" fill="var(--color-surface)" />
      {days}
      {/* 오늘 칸 체크 */}
      <rect x="14" y="19" width="1" height="1" fill="var(--color-line)" />
      <rect x="15" y="20" width="1" height="1" fill="var(--color-line)" />
      <rect x="16" y="18" width="1" height="2" fill="var(--color-line)" />
      {/* 바닥 그림자 */}
      <rect x="2" y="29" width="22" height="1" fill="var(--color-line)" />
    </svg>
  );
}
