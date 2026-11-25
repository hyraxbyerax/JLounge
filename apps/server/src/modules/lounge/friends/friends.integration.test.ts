// 친구·활동 상태·친구 초대·게스트→로그인 (TEST_REDIS_URL 과 TEST_DATABASE_URL 이 둘 다 있을 때만)
import type { FriendsOverview, RoomJoined } from '@lounge/shared';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser } from '../../../shared/auth/AuthProvider.ts';
import { createMember, setPresenceVisibility } from '../../../shared/auth/users.ts';
import { createHarness, type TestClient } from '../testing.ts';

const redisUrl = process.env.TEST_REDIS_URL;
const dbUrl = process.env.TEST_DATABASE_URL;
const pool = dbUrl ? new pg.Pool({ connectionString: dbUrl, max: 3 }) : null;
const h = createHarness(redisUrl ?? '', { db: pool ?? undefined });
const { run, connect, ok, errorCode, next } = h;

type Member = AuthUser & { friendCode: string };
const created: string[] = [];

async function member(name: string): Promise<Member> {
  const row = await createMember(pool!, {
    email: `${name}-${run}@example.com`,
    nickname: `${name}${run}`,
    passwordHash: 'x',
  });
  created.push(row.user_id);
  return { userId: row.user_id, nickname: row.nickname, isGuest: false, friendCode: row.friend_code };
}

const online = (m: Member) => connect(m.nickname, false, m.userId);
const overview = async (m: Member) => (await h.http(m, 'GET', '/api/lounge/friends')).data as FriendsOverview;
const beat = async (socket: TestClient) => {
  socket.emit('presence:heartbeat');
  await new Promise((r) => setTimeout(r, 300));
};

async function befriend(a: Member, b: Member) {
  await h.http(a, 'POST', '/api/lounge/friends/requests', { userId: b.userId });
  await h.http(b, 'POST', `/api/lounge/friends/${a.userId}/accept`);
}

const settings = { name: `친구방 ${run}`, isPublic: false, password: 'secret', locked: false, maxMembers: 6 };

describe.skipIf(!redisUrl || !dbUrl)('친구 (TEST_REDIS_URL·TEST_DATABASE_URL 이 있을 때만)', () => {
  beforeAll(() => h.start());
  afterEach(() => h.cleanup());
  afterAll(async () => {
    await h.stop();
    await pool!.query('delete from users where user_id = any($1::text[])', [created]);
    await pool!.end();
  });

  it('친구 코드로 요청하면 상대에게 바로 알리고, 수락하면 친구가 된다', async () => {
    const [a, b] = [await member('가'), await member('나')];
    const bSocket = await online(b);
    const notified = next(bSocket, 'friend:request');
    const sent = await h.http(a, 'POST', '/api/lounge/friends/requests', { friendCode: b.friendCode.toLowerCase() });
    expect(sent.status).toBe(201);
    expect((await notified).from.userId).toBe(a.userId);

    expect((await overview(a)).outgoing.map((u) => u.userId)).toEqual([b.userId]);
    expect((await overview(b)).incoming.map((u) => u.userId)).toEqual([a.userId]);
    expect((await h.http(a, 'POST', '/api/lounge/friends/requests', { userId: b.userId })).code).toBe(
      'FRIEND_REQUESTED',
    );

    expect((await h.http(b, 'POST', `/api/lounge/friends/${a.userId}/accept`)).status).toBe(200);
    expect((await overview(a)).friends.map((f) => f.userId)).toEqual([b.userId]);
    expect((await h.http(a, 'POST', '/api/lounge/friends/requests', { userId: b.userId })).code).toBe('FRIEND_ALREADY');

    // 친구 끊기
    expect((await h.http(a, 'DELETE', `/api/lounge/friends/${b.userId}`)).status).toBe(204);
    expect((await overview(b)).friends).toEqual([]);
  });

  it('서로 요청하면 바로 친구, 나·게스트·없는 사람에게는 못 보낸다', async () => {
    const [a, b] = [await member('다'), await member('라')];
    await h.http(a, 'POST', '/api/lounge/friends/requests', { userId: b.userId });
    const back = await h.http(b, 'POST', '/api/lounge/friends/requests', { userId: a.userId });
    expect((back.data as { result: string }).result).toBe('accepted');
    expect((await h.http(a, 'POST', '/api/lounge/friends/requests', { userId: a.userId })).code).toBe('FRIEND_SELF');
    expect((await h.http(a, 'POST', '/api/lounge/friends/requests', { userId: 'guest_x' })).code).toBe('FRIEND_GUEST');
    expect((await h.http(a, 'POST', '/api/lounge/friends/requests', { nickname: '없는사람zz' })).code).toBe(
      'FRIEND_NOT_FOUND',
    );
    // 게스트는 친구 API 자체를 못 쓴다
    const guest = { userId: `guest_${run}`, nickname: '게스트', isGuest: true };
    expect((await h.http(guest, 'GET', '/api/lounge/friends')).status).toBe(403);
  });

  it('1:1 대화: 친구에게만, 바로 전달되고, 안 읽은 수가 보이다가 읽으면 사라진다', async () => {
    const [a, b, stranger] = [await member('대'), await member('화'), await member('남')];
    await befriend(a, b);
    const bSocket = await online(b);
    const aSocket = await online(a);

    const received = next(bSocket, 'dm:message');
    const echoed = next(aSocket, 'dm:message'); // 보낸 사람의 다른 탭에도
    const sent = await h.http(a, 'POST', `/api/lounge/friends/${b.userId}/messages`, { text: '  안녕! 게임 할래?  ' });
    expect(sent.status).toBe(201);
    const message = await received;
    expect(message).toMatchObject({ from: a.userId, to: b.userId, text: '안녕! 게임 할래?' });
    expect((await echoed).id).toBe(message.id);

    expect((await overview(b)).friends.find((f) => f.userId === a.userId)?.unread).toBe(1);
    const history = (await h.http(b, 'GET', `/api/lounge/friends/${a.userId}/messages`)).data as { text: string }[];
    expect(history.map((m) => m.text)).toEqual(['안녕! 게임 할래?']);
    await h.http(b, 'POST', `/api/lounge/friends/${a.userId}/read`);
    expect((await overview(b)).friends.find((f) => f.userId === a.userId)?.unread).toBe(0);

    // 친구가 아니면 보내지도 읽지도 못한다, 빈 메시지도 안 된다
    expect((await h.http(stranger, 'POST', `/api/lounge/friends/${a.userId}/messages`, { text: '안녕' })).code).toBe(
      'DM_NOT_FRIEND',
    );
    expect((await h.http(stranger, 'GET', `/api/lounge/friends/${a.userId}/messages`)).code).toBe('DM_NOT_FRIEND');
    expect((await h.http(a, 'POST', `/api/lounge/friends/${b.userId}/messages`, { text: '   ' })).code).toBe(
      'VALIDATION_ERROR',
    );

    // 도배 방지: 5초에 5개까지 (위에서 1개 보냄)
    for (let i = 0; i < 4; i++) await h.http(a, 'POST', `/api/lounge/friends/${b.userId}/messages`, { text: `${i}` });
    expect((await h.http(a, 'POST', `/api/lounge/friends/${b.userId}/messages`, { text: '또' })).code).toBe(
      'DM_TOO_FAST',
    );
  });

  it('차단하면 친구가 끊기고, 차단당한 사람은 차단 사실을 모른 채 요청을 못 보낸다', async () => {
    const [a, b] = [await member('마'), await member('바')];
    await befriend(a, b);
    await h.http(a, 'POST', `/api/lounge/friends/${b.userId}/block`);
    expect((await overview(a)).blocked.map((u) => u.userId)).toEqual([b.userId]);
    expect((await overview(b)).friends).toEqual([]);
    expect((await overview(b)).blocked).toEqual([]);
    expect((await h.http(b, 'POST', '/api/lounge/friends/requests', { userId: a.userId })).code).toBe(
      'FRIEND_UNAVAILABLE',
    );
    expect((await h.http(a, 'POST', '/api/lounge/friends/requests', { userId: b.userId })).code).toBe(
      'FRIEND_YOU_BLOCKED',
    );
    await h.http(a, 'DELETE', `/api/lounge/friends/${b.userId}/block`);
    expect((await h.http(b, 'POST', '/api/lounge/friends/requests', { userId: a.userId })).status).toBe(201);
  });

  it('활동 상태는 친구의 공개 범위로 걸러서 보인다 (전체 / 접속만 / 숨김)', async () => {
    const [a, b] = [await member('사'), await member('아')];
    await befriend(a, b);
    const aSocket = await online(a);
    const bSocket = await online(b);
    const room = (await ok<RoomJoined>(aSocket, 'room:create', settings)).room;

    const update = next(bSocket, 'presence:update', (u) => u.userId === a.userId && u.presence.room !== null);
    await beat(aSocket);
    expect((await update).presence).toEqual({
      online: true,
      room: { code: room.code, name: room.name },
      activity: '라운지에서 쉬는 중',
    });
    expect((await overview(b)).friends[0]?.presence.room?.code).toBe(room.code);

    await setPresenceVisibility(pool!, a.userId, 'online');
    expect((await overview(b)).friends[0]?.presence).toEqual({ online: true, room: null, activity: null });
    await setPresenceVisibility(pool!, a.userId, 'hidden');
    expect((await overview(b)).friends[0]?.presence.online).toBe(false);
  });

  it('친구 초대로는 비밀번호 없이 들어오고, 잠긴 방은 방장이 보낸 초대만 통한다', async () => {
    const [host, friend, other] = [await member('자'), await member('차'), await member('카')];
    await befriend(host, friend);
    await befriend(other, friend);
    const hostSocket = await online(host);
    const friendSocket = await online(friend);
    await beat(friendSocket);
    const room = (await ok<RoomJoined>(hostSocket, 'room:create', { ...settings, locked: true })).room;

    const stranger = await member('타');
    expect(await errorCode(hostSocket, 'friend:invite', { userId: stranger.userId })).toBe('FRIEND_NOT_FRIEND');

    const invited = next(friendSocket, 'friend:invited');
    await ok(hostSocket, 'friend:invite', { userId: friend.userId });
    expect((await invited).room.code).toBe(room.code);
    // 초대장 없이는 잠긴 방이라 못 들어온다
    expect(await errorCode(friendSocket, 'room:join', { code: room.code, password: 'secret' })).toBe('ROOM_LOCKED');
    const joined = await ok<RoomJoined>(friendSocket, 'room:join', { code: room.code, invite: true });
    expect(joined.room.members.map((m) => m.userId)).toContain(friend.userId);

    // 방장이 아닌 사람은 잠긴 방에 초대할 수 없다
    await ok(friendSocket, 'room:leave');
    const otherSocket = await online(other);
    await ok(hostSocket, 'room:update', { ...settings, locked: false, password: undefined });
    await ok<RoomJoined>(otherSocket, 'room:join', { code: room.code, password: 'secret' });
    await ok(hostSocket, 'room:update', { ...settings, locked: true, password: undefined });
    expect(await errorCode(otherSocket, 'friend:invite', { userId: friend.userId })).toBe('ROOM_LOCKED');
  });

  it('게스트로 방에 있다가 로그인하면 같은 자리·방장을 그대로 이어받는다', async () => {
    const guest = await connect('게스트');
    const room = (await ok<RoomJoined>(guest, 'room:create', settings)).room;
    const other = await connect('손님');
    await ok(other, 'room:join', { code: room.code, password: 'secret' });
    const guestToken = await h.auth.issue(guest.user);
    guest.disconnect();

    const me = await member('로그인');
    const meSocket = await online(me);
    const changed = next(other, 'chat:message', (m) => m.text.includes('로그인해서'));
    const joined = await ok<RoomJoined>(meSocket, 'room:join', { code: room.code, fromGuest: guestToken });
    expect(joined.room.hostId).toBe(me.userId);
    expect(joined.room.members.map((m) => m.userId)).toEqual([me.userId, other.user.userId]);
    expect((await changed).text).toBe(`게스트님이 로그인해서 ${me.nickname}님이 됐어요`);
  });
});
