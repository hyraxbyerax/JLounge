import { describe, expect, it } from 'vitest';
import { OFFLINE } from '@lounge/shared';
import { filterPresence, type RawPresence } from './activity.ts';

// 공개 범위는 서버에서 걸러야 한다 (브라우저에서 숨기면 개발자 도구로 다 보인다)
const raw: RawPresence = { roomCode: 'ABC123', roomName: '공강방', activity: '캐치마인드 중' };

describe('친구에게 보이는 상태', () => {
  it('전체 공개면 방과 활동까지', () => {
    expect(filterPresence(raw, 'all')).toEqual({
      online: true,
      room: { code: 'ABC123', name: '공강방' },
      activity: '캐치마인드 중',
    });
  });

  it('접속 여부만이면 방·활동을 빼고 보낸다', () => {
    expect(filterPresence(raw, 'online')).toEqual({ online: true, room: null, activity: null });
  });

  it('숨김이면 접속 중이어도 오프라인으로', () => {
    expect(filterPresence(raw, 'hidden')).toEqual(OFFLINE);
  });

  it('신호가 끊겨 상태가 없으면 오프라인', () => {
    expect(filterPresence(null, 'all')).toEqual(OFFLINE);
  });

  it('방 밖(메인·플래너)에 있으면 접속 중, 방은 없음', () => {
    expect(filterPresence({ roomCode: null, roomName: null, activity: null }, 'all')).toEqual({
      online: true,
      room: null,
      activity: null,
    });
  });
});
