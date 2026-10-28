/*
 * 라운지 서버 로직의 입구. 방·채팅·음악·게임 처리는 이 폴더 안에 둔다.
 * 상태는 서버 메모리가 아니라 Redis에 둔다 (서버가 여러 대여도 동작하게).
 */
import type { IoServer } from '../../shared/realtime/socket.ts';

export function registerLoungeHandlers(io: IoServer): void {
  io.on('connection', (socket) => {
    socket.on('time:sync', (ack) => {
      if (typeof ack === 'function') ack({ data: { serverTime: new Date().toISOString() } });
    });
  });
}
