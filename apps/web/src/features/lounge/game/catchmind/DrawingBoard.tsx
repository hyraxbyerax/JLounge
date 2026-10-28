import { useCallback, useEffect, useRef, type PointerEvent } from 'react';
import { BOARD_HEIGHT, BOARD_WIDTH, INKS, type Ink, type Point, type Stroke } from './drawing';

type Props = {
  strokes: Stroke[];
  canDraw: boolean;
  pen: { ink: Ink; width: number };
  onStroke: (stroke: Stroke) => void;
};

/** 잉크 색은 tokens.css의 --ink-* 변수에서 읽는다 */
function readInks(): Record<Ink, string> {
  const styles = getComputedStyle(document.documentElement);
  const keys: Ink[] = [...INKS, 'paper'];
  return Object.fromEntries(keys.map((k) => [k, styles.getPropertyValue(`--ink-${k}`).trim()])) as Record<Ink, string>;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, color: string) {
  const [first, ...rest] = stroke.points;
  if (!first) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (rest.length === 0) {
    ctx.beginPath();
    ctx.arc(first[0], first[1], stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const [x, y] of rest) ctx.lineTo(x, y);
  ctx.stroke();
}

export function DrawingBoard({ strokes, canDraw, pen, onStroke }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draft = useRef<Stroke | null>(null);
  const inks = useRef<Record<Ink, string> | null>(null);

  const colorOf = (ink: Ink) => (inks.current ??= readInks())[ink];

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = colorOf('paper');
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    for (const s of strokes) drawStroke(ctx, s, colorOf(s.ink));
    if (draft.current) drawStroke(ctx, draft.current, colorOf(draft.current.ink));
  }, [strokes]);

  useEffect(() => {
    paint();
  }, [paint]);

  function toPoint(e: PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.round(((e.clientX - rect.left) / rect.width) * BOARD_WIDTH),
      Math.round(((e.clientY - rect.top) / rect.height) * BOARD_HEIGHT),
    ];
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!canDraw) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draft.current = { ink: pen.ink, width: pen.width, points: [toPoint(e)] };
    paint();
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const stroke = draft.current;
    if (!stroke) return;
    const point = toPoint(e);
    const last = stroke.points.at(-1)!;
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 3) return;
    stroke.points.push(point);
    // 새로 늘어난 한 구간만 그린다
    const ctx = e.currentTarget.getContext('2d');
    if (ctx) drawStroke(ctx, { ...stroke, points: [last, point] }, colorOf(stroke.ink));
  }

  function onPointerEnd() {
    const stroke = draft.current;
    if (!stroke) return;
    draft.current = null;
    onStroke(stroke);
  }

  return (
    <canvas
      ref={canvasRef}
      className={`board${canDraw ? ' can-draw' : ''}`}
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      role="img"
      aria-label={canDraw ? '그림판: 마우스나 손가락으로 그려요' : '그림판'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    />
  );
}
