/** 그림판 좌표계. 화면 크기와 관계없이 800×500 기준으로 저장한다 (나중에 소켓으로 그대로 전송) */
export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 500;

export const INKS = ['black', 'red', 'orange', 'green', 'blue', 'brown', 'purple'] as const;
export type Ink = (typeof INKS)[number] | 'paper';

export const INK_NAMES: Record<Ink, string> = {
  black: '검정',
  red: '빨강',
  orange: '주황',
  green: '초록',
  blue: '파랑',
  brown: '갈색',
  purple: '보라',
  paper: '지우개',
};

export const PEN_WIDTHS = [4, 8, 16] as const;
export const ERASER_WIDTH = 28;

export type Point = [number, number];

export type Stroke = {
  ink: Ink;
  width: number;
  points: Point[];
};
