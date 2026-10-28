/*
 * 가상 사람이 그릴 그림들. 800×500 좌표, 한 획씩 천천히 재생한다.
 */
import type { Ink, Point, Stroke } from './drawing';

const rad = (deg: number) => (deg * Math.PI) / 180;

function arc(cx: number, cy: number, rx: number, ry: number, fromDeg: number, toDeg: number, steps = 32): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = rad(fromDeg + ((toDeg - fromDeg) * i) / steps);
    return [Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a))];
  });
}

const ellipse = (cx: number, cy: number, rx: number, ry: number) => arc(cx, cy, rx, ry, -90, 270, 44);
const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r);
const stroke = (ink: Ink, width: number, points: Point[]): Stroke => ({ ink, width, points });

function star(cx: number, cy: number, outer: number, inner: number): Point[] {
  return Array.from({ length: 11 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = rad(-90 + i * 36);
    return [Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))];
  });
}

function heart(cx: number, cy: number, scale: number): Point[] {
  return Array.from({ length: 49 }, (_, i) => {
    const t = (i / 48) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    return [Math.round(cx + x * scale), Math.round(cy + y * scale)];
  });
}

function sunRays(cx: number, cy: number): Stroke[] {
  return Array.from({ length: 8 }, (_, k) => {
    const a = rad(k * 45);
    return stroke('orange', 8, [
      [Math.round(cx + 125 * Math.cos(a)), Math.round(cy + 125 * Math.sin(a))],
      [Math.round(cx + 175 * Math.cos(a)), Math.round(cy + 175 * Math.sin(a))],
    ]);
  });
}

function petals(cx: number, cy: number): Stroke[] {
  return Array.from({ length: 6 }, (_, k) => {
    const a = rad(k * 60 - 90);
    return stroke('red', 6, circle(Math.round(cx + 66 * Math.cos(a)), Math.round(cy + 66 * Math.sin(a)), 38));
  });
}

export const BOT_DRAWINGS: Record<string, Stroke[]> = {
  사과: [
    stroke('red', 8, ellipse(400, 275, 150, 140)),
    stroke('brown', 8, [
      [400, 135],
      [405, 110],
      [415, 80],
    ]),
    stroke('green', 6, [
      [410, 120],
      [450, 95],
      [490, 100],
      [455, 130],
      [410, 120],
    ]),
  ],
  집: [
    stroke('black', 8, [
      [260, 250],
      [260, 430],
      [540, 430],
      [540, 250],
    ]),
    stroke('red', 8, [
      [230, 260],
      [400, 120],
      [570, 260],
      [230, 260],
    ]),
    stroke('brown', 6, [
      [370, 430],
      [370, 350],
      [430, 350],
      [430, 430],
    ]),
    stroke('blue', 6, [
      [290, 290],
      [350, 290],
      [350, 340],
      [290, 340],
      [290, 290],
    ]),
    stroke('blue', 4, [
      [320, 290],
      [320, 340],
    ]),
    stroke('blue', 4, [
      [290, 315],
      [350, 315],
    ]),
  ],
  해: [stroke('orange', 8, circle(400, 250, 95)), ...sunRays(400, 250)],
  나무: [
    stroke('brown', 8, [
      [370, 455],
      [370, 300],
    ]),
    stroke('brown', 8, [
      [430, 455],
      [430, 300],
    ]),
    stroke('green', 8, circle(340, 250, 75)),
    stroke('green', 8, circle(460, 250, 75)),
    stroke('green', 8, circle(400, 165, 85)),
  ],
  물고기: [
    stroke('blue', 8, ellipse(370, 250, 170, 95)),
    stroke('blue', 8, [
      [535, 250],
      [640, 170],
      [620, 250],
      [640, 330],
      [535, 250],
    ]),
    stroke('black', 8, circle(285, 228, 10)),
    stroke('blue', 4, arc(300, 250, 40, 80, -60, 60, 12)),
  ],
  우산: [
    stroke('purple', 8, arc(400, 260, 220, 170, 180, 360)),
    stroke('purple', 6, arc(253, 260, 73, 30, 180, 360, 16)),
    stroke('purple', 6, arc(400, 260, 73, 30, 180, 360, 16)),
    stroke('purple', 6, arc(547, 260, 73, 30, 180, 360, 16)),
    stroke('black', 8, [
      [400, 260],
      [400, 420],
    ]),
    stroke('black', 8, arc(370, 420, 30, 30, 0, 180, 12)),
  ],
  별: [stroke('orange', 8, star(400, 260, 175, 72))],
  하트: [stroke('red', 8, heart(400, 240, 11))],
  눈사람: [
    stroke('black', 6, circle(400, 345, 110)),
    stroke('black', 6, circle(400, 180, 75)),
    stroke('black', 10, circle(375, 165, 4)),
    stroke('black', 10, circle(425, 165, 4)),
    stroke('orange', 8, [
      [400, 188],
      [448, 196],
    ]),
    stroke('brown', 6, [
      [300, 320],
      [220, 270],
    ]),
    stroke('brown', 6, [
      [500, 320],
      [580, 270],
    ]),
  ],
  컵: [
    stroke('blue', 8, [
      [300, 160],
      [325, 420],
      [475, 420],
      [500, 160],
      [300, 160],
    ]),
    stroke('blue', 8, arc(500, 285, 60, 70, -75, 75, 16)),
    stroke('black', 4, [
      [360, 135],
      [350, 110],
      [365, 85],
      [355, 60],
    ]),
    stroke('black', 4, [
      [440, 135],
      [430, 110],
      [445, 85],
      [435, 60],
    ]),
  ],
  안경: [
    stroke('black', 8, circle(290, 260, 85)),
    stroke('black', 8, circle(510, 260, 85)),
    stroke('black', 8, arc(400, 262, 26, 22, 200, 340, 10)),
    stroke('black', 8, [
      [205, 250],
      [130, 225],
    ]),
    stroke('black', 8, [
      [595, 250],
      [670, 225],
    ]),
  ],
  꽃: [
    stroke('green', 8, [
      [400, 260],
      [400, 460],
    ]),
    stroke('green', 6, [
      [400, 380],
      [460, 340],
      [485, 355],
      [425, 392],
      [400, 380],
    ]),
    ...petals(400, 190),
    stroke('orange', 8, circle(400, 190, 30)),
  ],
  달: [stroke('orange', 8, [...arc(400, 250, 150, 150, 60, 300), ...arc(520, 250, 138, 138, 251, 109)])],
  자동차: [
    stroke('blue', 8, [
      [160, 340],
      [160, 270],
      [260, 260],
      [320, 190],
      [500, 190],
      [570, 260],
      [640, 275],
      [640, 340],
      [160, 340],
    ]),
    stroke('blue', 6, [
      [330, 258],
      [350, 208],
      [490, 208],
      [540, 258],
      [330, 258],
    ]),
    stroke('blue', 6, [
      [420, 208],
      [420, 258],
    ]),
    stroke('black', 8, circle(270, 345, 45)),
    stroke('black', 8, circle(530, 345, 45)),
  ],
  산: [
    stroke('green', 8, [
      [80, 440],
      [280, 160],
      [400, 320],
      [510, 210],
      [720, 440],
    ]),
    stroke('blue', 6, [
      [237, 220],
      [260, 240],
      [282, 218],
      [303, 240],
      [325, 220],
    ]),
  ],
};

/**
 * 그림을 사람이 그리듯 조금씩 재생한다. next()를 부를 때마다 지금까지 그린 획을 돌려주고, 끝나면 null.
 */
export function createPlayback(drawing: Stroke[], durationMs = 20_000, tickMs = 50) {
  const total = drawing.reduce((n, s) => n + s.points.length, 0);
  const perTick = Math.max(1, Math.ceil(total / (durationMs / tickMs)));
  const pauseTicks = 8;
  let strokeIndex = 0;
  let pointCount = 0;
  let pause = 0;

  function snapshot(): Stroke[] {
    const done = drawing.slice(0, strokeIndex);
    const current = drawing[strokeIndex];
    return current && pointCount > 0 ? [...done, { ...current, points: current.points.slice(0, pointCount) }] : done;
  }

  return function next(): Stroke[] | null {
    if (strokeIndex >= drawing.length) return null;
    if (pause > 0) {
      pause--;
      return snapshot();
    }
    pointCount += perTick;
    if (pointCount >= drawing[strokeIndex]!.points.length) {
      strokeIndex++;
      pointCount = 0;
      pause = pauseTicks;
    }
    return snapshot();
  };
}
