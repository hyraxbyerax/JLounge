// 실제 Redis + Socket.IO 로 음악 같이 듣기를 확인한다 (TEST_REDIS_URL 이 있을 때만)
import type { MusicState, RoomJoined } from '@lounge/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from '../testing.ts';
import type { MusicSearchProvider, SongResult } from './search.ts';

const song = (videoId: string, title: string, durationSec = 200): SongResult => ({
  videoId,
  title,
  durationSec,
  channelTitle: 't',
  thumbnailUrl: null,
});

// 영상 id 는 11자. short1secXX 는 1초짜리라 금방 끝난다
const CATALOG = [
  song('aaaaaaaaaa1', '곡1'),
  song('aaaaaaaaaa2', '곡2'),
  song('aaaaaaaaaa3', '곡3'),
  song('aaaaaaaaaa4', '곡4'),
  song('aaaaaaaaaa5', '곡5'),
  song('short1sec01', '짧은 곡', 1),
];
const fakeSearch: MusicSearchProvider = {
  source: 'sample',
  search: async () => CATALOG,
  lookup: async (id) => CATALOG.find((s) => s.videoId === id) ?? null,
};

const url = process.env.TEST_REDIS_URL;
const h = createHarness(url ?? '', { musicSearch: fakeSearch });
const { run, connect, ok, errorCode, next } = h;

const settings = { name: `음악방 ${run}`, isPublic: true, password: null, locked: false, maxMembers: 6 };

async function roomWithGuest() {
  const host = await connect('방장');
  const room = (await ok<RoomJoined>(host, 'room:create', settings)).room;
  const guest = await connect('손님');
  await ok<RoomJoined>(guest, 'room:join', { code: room.code });
  return { host, guest, room };
}

const musicOf = (m: MusicState) => ({ now: m.now?.title ?? null, queue: m.queue.map((e) => e.title) });

describe.skipIf(!url)('음악 같이 듣기 (TEST_REDIS_URL 이 있을 때만)', () => {
  beforeAll(() => h.start());
  afterEach(() => h.cleanup());
  afterAll(() => h.stop());

  it('재생 중인 곡이 없으면 바로 재생, 있으면 대기큐 뒤에. 모두가 같은 상태를 받고, 나중에 온 사람도 받는다', async () => {
    const { host, guest, room } = await roomWithGuest();
    const seen = next(guest, 'music:state', (m) => m.now !== null);
    expect(await ok(host, 'music:request', { videoId: 'aaaaaaaaaa1' })).toEqual({ position: 0 });
    const state = await seen;
    expect(state.now).toMatchObject({ title: '곡1', state: 'playing', requesterNickname: '방장' });
    expect(Date.now() - Date.parse(state.now!.startedAt)).toBeLessThan(5_000);

    expect(await ok(guest, 'music:request', { videoId: 'aaaaaaaaaa2' })).toEqual({ position: 1 });
    const late = await connect('늦게');
    const joined = await ok<RoomJoined>(late, 'room:join', { code: room.code });
    expect(musicOf(joined.music)).toEqual({ now: '곡1', queue: ['곡2'] });
  });

  it('같은 곡은 다시 못 넣고, 대기큐는 한 사람당 3곡, 재생할 수 없는 영상은 거절', async () => {
    const { host } = await roomWithGuest();
    await ok(host, 'music:request', { videoId: 'aaaaaaaaaa1' });
    expect(await errorCode(host, 'music:request', { videoId: 'aaaaaaaaaa1' })).toBe('MUSIC_DUPLICATE');
    for (const id of ['aaaaaaaaaa2', 'aaaaaaaaaa3', 'aaaaaaaaaa4']) await ok(host, 'music:request', { videoId: id });
    expect(await errorCode(host, 'music:request', { videoId: 'aaaaaaaaaa5' })).toBe('MUSIC_LIMIT');
    expect(await errorCode(host, 'music:request', { videoId: 'zzzzzzzzzzz' })).toBe('MUSIC_UNPLAYABLE');
    expect(await errorCode(host, 'music:request', { videoId: 'bad' })).toBe('VALIDATION_ERROR');
  });

  it('본인이 신청한 대기 곡만 취소할 수 있다', async () => {
    const { host, guest, room } = await roomWithGuest();
    await ok(host, 'music:request', { videoId: 'aaaaaaaaaa1' });
    await ok(host, 'music:request', { videoId: 'aaaaaaaaaa2' });
    await ok(guest, 'music:request', { videoId: 'aaaaaaaaaa3' });
    const { queue } = (await ok<RoomJoined>(guest, 'room:join', { code: room.code })).music;
    const [hostSong, guestSong] = queue;

    expect(await errorCode(guest, 'music:cancel', { entryId: hostSong!.entryId })).toBe('MUSIC_NOT_YOURS');
    expect(await ok(guest, 'music:cancel', { entryId: guestSong!.entryId })).toEqual({
      notice: "'곡3' 신청을 취소했어요",
    });
    expect(await errorCode(guest, 'music:cancel', { entryId: guestSong!.entryId })).toBe('MUSIC_NOT_IN_QUEUE');
    const after = (await ok<RoomJoined>(guest, 'room:join', { code: room.code })).music;
    expect(musicOf(after)).toEqual({ now: '곡1', queue: ['곡2'] });
  });

  it('방장 명령: 방장이 아니면 거절, /pause 는 위치를 지키고 /resume 은 그 위치부터, /move·/remove·/clear', async () => {
    const { host, guest } = await roomWithGuest();
    for (const id of ['aaaaaaaaaa1', 'aaaaaaaaaa2', 'aaaaaaaaaa3', 'aaaaaaaaaa4']) {
      await ok(host, 'music:request', { videoId: id });
    }
    expect(await errorCode(guest, 'music:command', { name: 'skip' })).toBe('MUSIC_NOT_HOST');
    expect(await errorCode(guest, 'music:seek', { positionSec: 10 })).toBe('MUSIC_NOT_HOST');

    await ok(host, 'music:seek', { positionSec: 30 });
    const paused = next(guest, 'music:state', (m) => m.now?.state === 'paused');
    await ok(host, 'music:command', { name: 'pause' });
    const position = (await paused).now!.positionMs;
    expect(position).toBeGreaterThanOrEqual(30_000);
    expect(position).toBeLessThan(33_000);

    const resumed = next(guest, 'music:state', (m) => m.now?.state === 'playing');
    await ok(host, 'music:command', { name: 'resume' });
    const startedAt = Date.parse((await resumed).now!.startedAt);
    expect(Math.abs(Date.now() - startedAt - position)).toBeLessThan(2_000);

    expect(await ok(host, 'music:command', { name: 'move', args: [3, 1] })).toEqual({
      notice: "'곡4'을(를) 1번으로 옮겼어요",
    });
    expect(await ok(host, 'music:command', { name: 'remove', args: [9] })).toEqual({
      notice: '대기큐 번호를 확인해주세요 (1~3). 예: /remove 2',
    });
    const afterRemove = next(guest, 'music:state', (m) => m.queue.length === 2);
    await ok(host, 'music:command', { name: 'remove', args: [2] });
    expect(musicOf(await afterRemove)).toEqual({ now: '곡1', queue: ['곡4', '곡3'] });

    const skipped = next(guest, 'chat:message', (m) => m.text.includes('방장이 곡을 넘겼어요'));
    await ok(host, 'music:command', { name: 'skip' });
    expect((await skipped).text).toBe('방장이 곡을 넘겼어요. 다음 곡: 곡4');

    const cleared = next(guest, 'music:state', (m) => m.queue.length === 0);
    await ok(host, 'music:command', { name: 'clear' });
    expect(musicOf(await cleared)).toEqual({ now: '곡4', queue: [] });

    const stopped = next(guest, 'music:state', (m) => m.now === null);
    await ok(host, 'music:command', { name: 'stop' });
    await stopped;
    expect(await ok(host, 'music:command', { name: 'pause' })).toEqual({ notice: '일시정지할 곡이 없어요' });
  });

  it('곡이 끝나면 서버가 다음 곡으로 넘긴다 (한 번만), 대기큐가 비면 멈춘다', { timeout: 15_000 }, async () => {
    const { host, guest } = await roomWithGuest();
    await ok(host, 'music:request', { videoId: 'short1sec01' });
    await ok(host, 'music:request', { videoId: 'aaaaaaaaaa1' });
    let nextCount = 0;
    guest.on('chat:message', (m) => {
      if (m.text.startsWith('다음 곡:')) nextCount += 1;
    });
    const advanced = next(guest, 'music:state', (m) => m.now?.title === '곡1');
    await advanced;
    await new Promise((r) => setTimeout(r, 2_000));
    expect(nextCount).toBe(1);
  });

  it('브라우저가 재생 실패를 여러 번 알려도 한 번만 넘어간다', async () => {
    const { host, guest, room } = await roomWithGuest();
    await ok(host, 'music:request', { videoId: 'aaaaaaaaaa1' });
    await ok(host, 'music:request', { videoId: 'aaaaaaaaaa2' });
    await ok(host, 'music:request', { videoId: 'aaaaaaaaaa3' });
    const { now } = (await ok<RoomJoined>(guest, 'room:join', { code: room.code })).music;

    const moved = next(guest, 'music:state', (m) => m.now?.title === '곡2');
    const notice = next(guest, 'chat:message', (m) => m.text.includes('재생할 수 없어서'));
    host.emit('music:failed', { entryId: now!.entryId });
    guest.emit('music:failed', { entryId: now!.entryId });
    await moved;
    expect((await notice).text).toBe("'곡1'은(는) 재생할 수 없어서 넘어가요. 다음 곡: 곡2");
    await new Promise((r) => setTimeout(r, 500));
    const after = (await ok<RoomJoined>(guest, 'room:join', { code: room.code })).music;
    expect(musicOf(after)).toEqual({ now: '곡2', queue: ['곡3'] });
  });

  it('로비 창문에 재생 중인 곡이 보이고, 방이 사라지면 음악도 사라진다', async () => {
    const { host, guest, room } = await roomWithGuest();
    const watcher = await connect('구경꾼');
    await ok(watcher, 'lobby:watch');
    const lobby = next(watcher, 'lobby:rooms', (rooms) => rooms.some((r) => r.id === room.id && r.nowPlaying));
    await ok(host, 'music:request', { videoId: 'aaaaaaaaaa1' });
    expect((await lobby).find((r) => r.id === room.id)?.nowPlaying).toBe('곡1');

    await ok(host, 'room:leave');
    await ok(guest, 'room:leave');
    expect(await h.redis.client.exists([`room:${room.id}:now`, `room:${room.id}:queue`])).toBe(0);
  });
});
