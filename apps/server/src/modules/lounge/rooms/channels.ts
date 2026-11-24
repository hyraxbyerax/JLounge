/** Socket.IO 방(채널) 이름. 로비를 보는 소켓은 lobby, 방 안의 소켓은 room:{방id} 에 들어간다 */
export const LOBBY_CHANNEL = 'lobby';
export const roomChannel = (roomId: string) => `room:${roomId}`;

/** 소켓이 들어가 있는 방 id (소켓은 한 번에 한 방에만 있다) */
export function socketRoomId(socket: { rooms: Set<string> }): string | null {
  for (const r of socket.rooms) if (r.startsWith('room:')) return r.slice('room:'.length);
  return null;
}
