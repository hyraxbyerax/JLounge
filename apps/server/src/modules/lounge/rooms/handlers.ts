/*
 * 방·로비·채팅 소켓 이벤트. 입장 조건·방장 권한·도배 방지는 전부 여기(서버)서 확인한다.
 * 상태는 roomStore(Redis)에만 있고, 이 파일은 확인·저장·알림 순서만 정한다.
 */
import {
  BOT,
  BOT_LINES,
  botReply,
  CHAT_BURST_LIMIT,
  CHAT_BURST_WINDOW_SEC,
  chatSendInput,
  PASSWORD_LOCK_SEC,
  PASSWORD_MAX_TRIES,
  roomCreateInput,
  roomJoinInput,
  roomUpdateInput,
  targetUserInput,
  type AckResult,
  type RoomJoined,
  type ServerChatMessage,
} from '@lounge/shared';
import { hashPassword, verifyPassword } from '../../../shared/auth/password.ts';
import { AppError } from '../../../shared/http/errors.ts';
import { validate } from '../../../shared/http/validate.ts';
import type { Logger } from '../../../shared/logger.ts';
import type { Counter } from '../../../shared/rateLimit.ts';
import type { IoServer, IoSocket } from '../../../shared/realtime/socket.ts';
import type { MusicStore } from '../music/musicStore.ts';
import { LOBBY_CHANNEL, roomChannel, socketRoomId } from './channels.ts';
import { ALIVE_TIMEOUT_MS, DISCONNECT_GRACE_MS } from './presence.ts';
import type { LeaveResult, Profile, RoomStore } from './roomStore.ts';

const fail = (code: string, message: string) => new AppError(code, message);

const JOIN_ERRORS: Record<string, string> = {
  NOT_FOUND: '그런 방이 없어요. 방 코드를 다시 확인해주세요',
  BANNED: '이 방에서 내보내져서 다시 들어갈 수 없어요',
  LOCKED: '방장이 입장을 잠근 방이에요',
  FULL: '방이 가득 찼어요',
};

const HOST_ERRORS: Record<string, string> = {
  NOT_FOUND: '방이 없어졌어요',
  NOT_HOST: '방장만 할 수 있어요',
  NOT_MEMBER: '지금 방에 없는 사람이에요',
  IS_BOT: '연습 상대에게는 방장을 넘길 수 없어요',
  SELF: '나에게는 할 수 없어요',
  ALREADY: '연습 상대가 이미 들어와 있어요',
  FULL: '방이 가득 차서 연습 상대를 부를 수 없어요',
};

const hostError = (status: string) => fail(`ROOM_${status}`, HOST_ERRORS[status] ?? '할 수 없어요');

type Deps = {
  io: IoServer;
  store: RoomStore;
  /** 방이 지워질 때 음악도 지우고, 들어올 때 지금 음악 상태를 준다 */
  music: MusicStore;
  counter: Counter;
  logger: Logger;
  /** 로드밸런서 뒤에 있으면 X-Forwarded-For 의 첫 주소를 접속 주소로 본다 */
  trustProxy: boolean;
  now?: () => number;
};

export function createRoomHandlers({ io, store, music, counter, logger, trustProxy, now = Date.now }: Deps) {
  const iso = () => new Date(now()).toISOString();

  async function publishLobby() {
    io.to(LOBBY_CHANNEL).emit('lobby:rooms', await store.listPublic());
  }

  async function publishRoom(roomId: string) {
    const view = await store.view(roomId);
    if (view) io.to(roomChannel(roomId)).emit('room:state', view);
  }

  async function say(roomId: string, message: Parameters<RoomStore['appendChat']>[1], except?: IoSocket) {
    const saved = await store.appendChat(roomId, message);
    if (!saved) return null;
    const target = except ? except.to(roomChannel(roomId)) : io.to(roomChannel(roomId));
    target.emit('chat:message', { ...saved, roomId });
    return saved;
  }

  const system = (roomId: string, text: string, except?: IoSocket) =>
    say(roomId, { kind: 'system', text, sentAt: iso() }, except);

  /** 나가기·강퇴·연결 끊김 뒤 공통: 시스템 메시지와 방·로비 갱신 */
  async function afterLeave(roomId: string, result: LeaveResult, text: (nickname: string) => string) {
    if (result.status === 'DELETED') {
      await music.clearRoom(roomId);
      await publishLobby();
      return;
    }
    if (result.status !== 'LEFT' && result.status !== 'HOST_CHANGED') return;
    await system(roomId, text(result.left.nickname));
    if (result.status === 'HOST_CHANGED') {
      const view = await store.view(roomId);
      const host = view?.members.find((m) => m.userId === result.newHostId);
      if (host) await system(roomId, `방장이 ${host.nickname}님으로 바뀌었어요`);
    }
    await Promise.all([publishRoom(roomId), publishLobby()]);
  }

  /** 다른 서버에 붙은 탭까지 포함해, 이 방에 이 사람의 소켓이 아직 있는지 */
  async function stillConnected(roomId: string, userId: string): Promise<boolean> {
    const sockets = await io.in(roomChannel(roomId)).fetchSockets();
    return sockets.some((s) => s.data.user?.userId === userId);
  }

  /** 접속이 끊긴 지 오래된 사람을 내보낸다 (presence.ts 의 청소에서 부른다) */
  async function expire(roomId: string, userId: string) {
    const result = await store.leave(roomId, userId);
    await afterLeave(roomId, result, (n) => `${n}님이 나갔어요`);
  }

  function clientKey(socket: IoSocket): string {
    const user = socket.data.user;
    if (!user.isGuest) return `u:${user.userId}`;
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const ip = trustProxy && typeof forwarded === 'string' ? forwarded.split(',')[0]!.trim() : socket.handshake.address;
    return `ip:${ip}`;
  }

  function profileOf(socket: IoSocket): Profile {
    const { userId, nickname, isGuest } = socket.data.user;
    return { userId, nickname, isGuest };
  }

  /** 다른 방에 있던 소켓이면 먼저 그 방에서 나간다 */
  async function leaveCurrent(socket: IoSocket) {
    const current = socketRoomId(socket);
    if (!current) return;
    await socket.leave(roomChannel(current));
    if (!(await stillConnected(current, socket.data.user.userId))) {
      const result = await store.leave(current, socket.data.user.userId);
      await store.forget(current, socket.data.user.userId);
      await afterLeave(current, result, (n) => `${n}님이 나갔어요`);
    }
  }

  async function enter(socket: IoSocket, roomId: string) {
    await socket.join(roomChannel(roomId));
    await store.touch(roomId, socket.data.user.userId, now());
  }

  async function checkPassword(socket: IoSocket, roomId: string, password: string | undefined) {
    const hash = await store.passwordHash(roomId);
    if (!hash) return;
    const key = clientKey(socket);
    const failures = await store.passwordFailures(roomId, key);
    if (failures.count >= PASSWORD_MAX_TRIES) {
      const minutes = Math.max(1, Math.ceil(failures.ttlSec / 60));
      throw fail('PASSWORD_LOCKED', `비밀번호를 ${PASSWORD_MAX_TRIES}번 틀렸어요. ${minutes}분 뒤에 다시 시도해주세요`);
    }
    if (!password) throw fail('PASSWORD_REQUIRED', '비밀번호를 입력해주세요');
    if (await verifyPassword(password, hash)) {
      await store.clearPasswordFailures(roomId, key);
      return;
    }
    const count = await counter.hit(`pwfail:${roomId}:${key}`, PASSWORD_LOCK_SEC);
    const left = PASSWORD_MAX_TRIES - count;
    throw fail(
      'WRONG_PASSWORD',
      left > 0
        ? `비밀번호가 달라요. ${left}번 더 시도할 수 있어요`
        : `비밀번호를 ${PASSWORD_MAX_TRIES}번 틀렸어요. 10분 뒤에 다시 시도해주세요`,
    );
  }

  async function requireRoom(socket: IoSocket): Promise<string> {
    const roomId = socketRoomId(socket);
    if (!roomId) throw fail('NOT_IN_ROOM', '방에 들어가 있지 않아요');
    return roomId;
  }

  /** 응답 콜백 형식 { data } / { error } 로 감싼다. 예상하지 못한 오류는 기록하고 일반 문장으로 */
  function respond<T>(socket: IoSocket, event: string, ack: unknown, task: () => Promise<T>) {
    if (typeof ack !== 'function') return;
    const reply = ack as (res: AckResult<T>) => void;
    task().then(
      (data) => reply({ data }),
      (err: unknown) => {
        if (err instanceof AppError) {
          reply({ error: { code: err.code, message: err.message } });
          return;
        }
        logger.error('소켓 처리 오류', { err, event, userId: socket.data.user.userId });
        reply({ error: { code: 'INTERNAL', message: '잠깐 문제가 생겼어요. 다시 시도해주세요' } });
      },
    );
  }

  function register(socket: IoSocket) {
    const me = () => socket.data.user;

    socket.on('lobby:watch', (ack) =>
      respond(socket, 'lobby:watch', ack, async () => {
        await socket.join(LOBBY_CHANNEL);
        return store.listPublic();
      }),
    );
    socket.on('lobby:unwatch', () => void socket.leave(LOBBY_CHANNEL));

    socket.on('room:create', (input, ack) =>
      respond(socket, 'room:create', ack, async (): Promise<RoomJoined> => {
        const settings = validate(roomCreateInput, input);
        await leaveCurrent(socket);
        const { id } = await store.create({
          name: settings.name,
          isPublic: settings.isPublic,
          passwordHash: settings.password ? await hashPassword(settings.password) : null,
          locked: settings.locked,
          maxMembers: settings.maxMembers,
          host: profileOf(socket),
          now: now(),
        });
        await enter(socket, id);
        if (settings.isPublic) await publishLobby();
        return { room: (await store.view(id))!, messages: [], music: await music.state(id) };
      }),
    );

    socket.on('room:join', (input, ack) =>
      respond(socket, 'room:join', ack, async (): Promise<RoomJoined> => {
        const { code, password, since } = validate(roomJoinInput, input);
        const roomId = await store.findIdByCode(code);
        if (!roomId) throw fail('ROOM_NOT_FOUND', JOIN_ERRORS.NOT_FOUND!);

        // 이미 참가자면(새로고침·다시 연결) 비밀번호 없이 그대로 돌아온다
        const rejoining = await store.isMember(roomId, me().userId);
        if (!rejoining) await checkPassword(socket, roomId, password);
        if (socketRoomId(socket) !== roomId) await leaveCurrent(socket);

        const status = await store.join(roomId, profileOf(socket), now());
        if (status !== 'OK' && status !== 'ALREADY') throw fail(`ROOM_${status}`, JOIN_ERRORS[status]!);
        await enter(socket, roomId);

        let messages: ServerChatMessage[] = [];
        if (status === 'OK') {
          // 들어온 사람에게는 응답으로, 나머지에게는 방송으로 같은 입장 메시지를 준다
          const joined = await system(roomId, `${me().nickname}님이 들어왔어요`, socket);
          if (joined) messages = [joined];
          await Promise.all([publishRoom(roomId), publishLobby()]);
        } else if (since !== undefined) {
          messages = await store.chatSince(roomId, since);
        }
        const room = await store.view(roomId);
        if (!room) throw fail('ROOM_NOT_FOUND', JOIN_ERRORS.NOT_FOUND!);
        return { room, messages, music: await music.state(roomId) };
      }),
    );

    socket.on('room:leave', (ack) =>
      respond(socket, 'room:leave', ack, async () => {
        const roomId = socketRoomId(socket);
        if (!roomId) return null;
        await socket.leave(roomChannel(roomId));
        await store.forget(roomId, me().userId);
        const result = await store.leave(roomId, me().userId);
        await afterLeave(roomId, result, (n) => `${n}님이 나갔어요`);
        return null;
      }),
    );

    socket.on('room:update', (input, ack) =>
      respond(socket, 'room:update', ack, async () => {
        const roomId = await requireRoom(socket);
        const settings = validate(roomUpdateInput, input);
        const password =
          settings.password === undefined
            ? ({ mode: 'keep' } as const)
            : settings.password === null
              ? ({ mode: 'clear' } as const)
              : ({ mode: 'set', hash: await hashPassword(settings.password) } as const);
        const status = await store.update(roomId, me().userId, { ...settings, password });
        if (status === 'TOO_SMALL') {
          const view = await store.view(roomId);
          throw fail('ROOM_TOO_SMALL', `지금 ${view?.members.length ?? 0}명이 있어서 그보다 적게 할 수 없어요`);
        }
        if (status !== 'OK') throw hostError(status);
        await system(roomId, '방장이 방 설정을 바꿨어요');
        await Promise.all([publishRoom(roomId), publishLobby()]);
        return null;
      }),
    );

    socket.on('room:transfer', (input, ack) =>
      respond(socket, 'room:transfer', ack, async () => {
        const roomId = await requireRoom(socket);
        const { userId } = validate(targetUserInput, input);
        const status = await store.transfer(roomId, me().userId, userId);
        if (status !== 'OK') throw hostError(status);
        const view = await store.view(roomId);
        const host = view?.members.find((m) => m.userId === userId);
        await system(roomId, `방장이 ${host?.nickname ?? '누군가'}님으로 바뀌었어요`);
        await publishRoom(roomId);
        return null;
      }),
    );

    socket.on('room:kick', (input, ack) =>
      respond(socket, 'room:kick', ack, async () => {
        const roomId = await requireRoom(socket);
        const { userId } = validate(targetUserInput, input);
        const result = await store.leave(roomId, userId, me().userId, 'kick');
        if (result.status !== 'LEFT' && result.status !== 'HOST_CHANGED' && result.status !== 'DELETED') {
          throw hostError(result.status);
        }
        await store.forget(roomId, userId);
        // 내보낸 사람의 탭(다른 서버에 붙어 있어도)을 방에서 빼고 알린다
        for (const s of await io.in(roomChannel(roomId)).fetchSockets()) {
          if (s.data.user?.userId !== userId) continue;
          s.leave(roomChannel(roomId));
          s.emit('room:kicked', { roomId });
        }
        const isBot = userId === BOT.id;
        await afterLeave(roomId, result, (n) => (isBot ? `${n}님이 나갔어요` : `방장이 ${n}님을 내보냈어요`));
        return null;
      }),
    );

    socket.on('room:bot', (ack) =>
      respond(socket, 'room:bot', ack, async () => {
        const roomId = await requireRoom(socket);
        const status = await store.addBot(
          roomId,
          me().userId,
          { userId: BOT.id, nickname: BOT.nickname, isGuest: true },
          now(),
        );
        if (status !== 'OK') throw hostError(status);
        await system(roomId, `${BOT.nickname}님이 들어왔어요`);
        await say(roomId, {
          kind: 'user',
          userId: BOT.id,
          nickname: BOT.nickname,
          text: BOT_LINES.greet,
          sentAt: iso(),
        });
        await Promise.all([publishRoom(roomId), publishLobby()]);
        return null;
      }),
    );

    socket.on('chat:send', (input, ack) =>
      respond(socket, 'chat:send', ack, async () => {
        const roomId = await requireRoom(socket);
        const { text } = validate(chatSendInput, input);
        const used = await counter.hit(`room:${roomId}:chatrate:${me().userId}`, CHAT_BURST_WINDOW_SEC);
        if (used > CHAT_BURST_LIMIT) throw fail('CHAT_TOO_FAST', '잠깐 천천히 보내주세요');
        const saved = await say(roomId, {
          kind: 'user',
          userId: me().userId,
          nickname: me().nickname,
          text,
          sentAt: iso(),
        });
        if (!saved) throw fail('ROOM_NOT_FOUND', '방이 없어졌어요');
        if (await store.hasBot(roomId, BOT.id)) {
          const reply = botReply(text);
          if (reply) {
            await say(roomId, { kind: 'user', userId: BOT.id, nickname: BOT.nickname, text: reply, sentAt: iso() });
          }
        }
        return null;
      }),
    );

    // 탭을 닫거나 연결이 끊기면 바로 내보내지 않는다. "잠시 뒤 만료"로 표시해 두면
    // presence.ts 의 청소가 그때 다시 확인한다 (새로고침해서 돌아왔으면 그대로 남는다)
    socket.on('disconnecting', () => {
      const roomId = socketRoomId(socket);
      if (!roomId) return;
      store.touch(roomId, me().userId, now() - ALIVE_TIMEOUT_MS + DISCONNECT_GRACE_MS).catch((err: unknown) => {
        logger.warn('연결 끊김 표시 실패', { err, roomId });
      });
    });
  }

  return {
    register,
    expire,
    stillConnected,
    // 음악·게임 처리도 같은 방식(응답 형식, 시스템 메시지, 로비 갱신)을 쓰도록 내준다
    respond,
    requireRoom,
    system,
    say,
    publishLobby,
  };
}

export type RoomHandlers = ReturnType<typeof createRoomHandlers>;
