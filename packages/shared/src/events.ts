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
import type { DirectMessage, FriendPresence, UserBrief } from './friends.ts';
import type { GameType } from './games/common.ts';
import type { Stroke } from './games/drawing.ts';
import type { GamePrivate, GameView } from './games/index.ts';
import type { WordTopic } from './games/words.ts';
import type { MusicCommandInput, MusicState } from './music.ts';

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

  /** 곡 신청. 제목·길이는 서버가 유튜브에서 확인한다. 응답: 바로 재생이면 position 0, 대기면 몇 번째인지 */
  'music:request': (input: { videoId: string }, ack: Ack<{ position: number }>) => void;
  /** 본인이 신청한, 대기큐에 있는 곡만 */
  'music:cancel': (input: { entryId: string }, ack: Ack<{ notice: string }>) => void;
  /** 방장 명령어 (/skip /pause /resume /stop /remove /move /clear). notice 는 방장에게만 보이는 안내 */
  'music:command': (input: MusicCommandInput, ack: Ack<{ notice: string | null }>) => void;
  /** 방장이 진행 막대를 끌어 위치를 옮김 (모두에게 적용) */
  'music:seek': (input: { positionSec: number }, ack: Ack<null>) => void;
  /** 브라우저에서 재생할 수 없는 영상이었다 (지금 곡이 아직 그 곡이면 다음 곡으로) */
  'music:failed': (input: { entryId: string }) => void;

  /** 방장: 게임 고르기 (대기 화면이 열린다) / 시작·한 판 더 / 닫기(/endgame 포함) */
  'game:select': (input: { type: GameType }, ack: Ack<null>) => void;
  'game:start': (ack: Ack<null>) => void;
  /** 캐치마인드 제시어 주제 (방장, 진행 중이 아닐 때) */
  'game:topic': (input: { topic: WordTopic }, ack: Ack<null>) => void;
  'game:quit': (ack: Ack<null>) => void;
  /** 그리는 사람만: 한 획 / 되돌리기 / 전부 지우기 */
  'game:stroke': (stroke: Stroke, ack: Ack<null>) => void;
  'game:undo': (ack: Ack<null>) => void;
  'game:clear': (ack: Ack<null>) => void;

  /** 회원만: 접속 중 신호 (20초마다, 방에 들어가고 나올 때도) */
  'presence:heartbeat': () => void;
  /** 회원만: 친구를 지금 내 방에 초대 */
  'friend:invite': (input: { userId: string }, ack: Ack<null>) => void;
};

export type ServerToClientEvents = {
  'lobby:rooms': (rooms: RoomSummary[]) => void;
  /** 방 정보·참가자가 바뀌었을 때 */
  'room:state': (room: RoomView) => void;
  /** 내가 강퇴당했을 때 */
  'room:kicked': (info: { roomId: string }) => void;
  'chat:message': (message: ServerChatMessage & { roomId: string }) => void;
  /** 재생 상태·대기큐가 바뀌었을 때 (전체를 다시 보낸다) */
  'music:state': (music: MusicState & { roomId: string }) => void;
  /** 게임 상태 (모두에게, 숨길 것은 빼고). 게임이 닫히면 view 가 null */
  'game:state': (info: { roomId: string; view: GameView | null }) => void;
  /** 나에게만: 캐치마인드 제시어 (그리는 사람·맞힌 사람) */
  'game:private': (info: { roomId: string; private: GamePrivate }) => void;
  /** 그림: 한 획 더 / 전체 다시 (새 라운드·되돌리기·지우기) */
  'game:stroke': (info: { roomId: string; stroke: Stroke }) => void;
  'game:strokes': (info: { roomId: string; strokes: Stroke[] }) => void;

  /** 친구의 상태가 바뀌었다 (그 친구의 공개 범위로 걸러진 것) */
  'presence:update': (info: { userId: string; presence: FriendPresence }) => void;
  /** 누가 나에게 친구 요청을 보냈다 */
  'friend:request': (info: { from: UserBrief }) => void;
  /** 친구 목록이 바뀌었다 (수락·삭제 등) — 다시 불러오면 된다 */
  'friend:changed': () => void;
  /** 친구가 나를 방에 초대했다 */
  'friend:invited': (info: { from: UserBrief; room: { code: string; name: string } }) => void;
  /** 1:1 대화 새 메시지 (받는 사람과 보낸 사람의 다른 탭 모두에게) */
  'dm:message': (message: DirectMessage) => void;
};
