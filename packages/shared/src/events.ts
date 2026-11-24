/*
 * Socket.IO 이벤트 이름과 모양. 이름은 "{분류}:{동작}".
 * schedule:, notify: 접두사는 캠퍼스 플래너용으로 비워둔다.
 * 응답 콜백은 HTTP와 같은 형식: 성공 { data }, 실패 { error: { code, message } }
 */
import type {
  RoomCreateInput,
  RoomJoined,
  RoomJoinInput,
  RoomSummary,
  RoomUpdateInput,
  RoomView,
  ServerChatMessage,
} from './lounge.ts';

export type AckResult<T> = { data: T } | { error: { code: string; message: string } };
export type Ack<T> = (res: AckResult<T>) => void;

export type ClientToServerEvents = {
  /** 서버 시각을 받아 브라우저 시계 차이를 보정한다 */
  'time:sync': (ack: Ack<{ serverTime: string }>) => void;

  /** 로비 보기 시작: 지금 목록을 받고, 바뀔 때마다 lobby:rooms 로 받는다 */
  'lobby:watch': (ack: Ack<RoomSummary[]>) => void;
  'lobby:unwatch': () => void;

  'room:create': (input: RoomCreateInput, ack: Ack<RoomJoined>) => void;
  /** 방 코드로 들어가기. 이미 들어가 있는 방이면(다시 연결) 확인 없이 since 다음 채팅을 준다 */
  'room:join': (input: RoomJoinInput, ack: Ack<RoomJoined>) => void;
  'room:leave': (ack: Ack<null>) => void;
  /** 방장만 */
  'room:update': (input: RoomUpdateInput, ack: Ack<null>) => void;
  'room:kick': (input: { userId: string }, ack: Ack<null>) => void;
  'room:transfer': (input: { userId: string }, ack: Ack<null>) => void;
  'room:bot': (ack: Ack<null>) => void;

  'chat:send': (input: { text: string }, ack: Ack<null>) => void;
};

export type ServerToClientEvents = {
  'lobby:rooms': (rooms: RoomSummary[]) => void;
  /** 방 정보·참가자가 바뀌었을 때 */
  'room:state': (room: RoomView) => void;
  /** 내가 강퇴당했을 때 */
  'room:kicked': (info: { roomId: string }) => void;
  'chat:message': (message: ServerChatMessage & { roomId: string }) => void;
};
