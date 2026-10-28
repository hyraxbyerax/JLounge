/*
 * Socket.IO 이벤트 이름과 모양. 이름은 "{분류}:{동작}".
 * schedule:, notify: 접두사는 스케줄러 파트용으로 비워둔다.
 * 응답 콜백은 HTTP와 같은 형식: 성공 { data }, 실패 { error: { code, message } }
 */

export type Ack<T> = (res: { data: T } | { error: { code: string; message: string } }) => void;

export type ClientToServerEvents = {
  /** 서버 시각을 받아 브라우저 시계 차이를 보정한다 */
  'time:sync': (ack: Ack<{ serverTime: string }>) => void;
};

export type ServerToClientEvents = Record<string, never>;
