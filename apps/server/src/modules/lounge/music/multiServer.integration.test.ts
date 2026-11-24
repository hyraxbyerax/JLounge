// 서버 2대(같은 Redis)가 동시에 "곡이 끝났는지" 확인해도 다음 곡으로 한 번만 넘어가는지 (TEST_REDIS_URL 이 있을 때만)
import type { RoomJoined } from '@lounge/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from '../testing.ts';
import type { MusicSearchProvider, SongResult } from './search.ts';

const song = (videoId: string, title: string, durationSec: number): SongResult => ({
  videoId,
  title,
  durationSec,
  channelTitle: 't',
  thumbnailUrl: null,
});
const CATALOG = [
  song('short1sec01', '짧은 곡1', 1),
  song('short1sec02', '짧은 곡2', 1),
  song('long0000001', '긴 곡', 300),
];
const fakeSearch: MusicSearchProvider = {
  source: 'sample',
  search: async () => CATALOG,
  lookup: async (id) => CATALOG.find((s) => s.videoId === id) ?? null,
};

const url = process.env.TEST_REDIS_URL;
const serverA = createHarness(url ?? '', { musicSearch: fakeSearch });
const serverB = createHarness(url ?? '', { musicSearch: fakeSearch });

describe.skipIf(!url)('서버 2대에서 음악 (TEST_REDIS_URL 이 있을 때만)', () => {
  beforeAll(async () => {
    await serverA.start();
    await serverB.start();
  });
  afterEach(async () => {
    await serverA.cleanup();
    await serverB.cleanup();
  });
  afterAll(async () => {
    await serverA.stop();
    await serverB.stop();
  });

  it('서로 다른 서버에 붙은 사람끼리 같은 곡을 받고, 곡이 끝나면 한 번씩만 넘어간다', { timeout: 20_000 }, async () => {
    const host = await serverA.connect('방장');
    const room = (
      await serverA.ok<RoomJoined>(host, 'room:create', {
        name: `두 서버 ${serverA.run}`,
        isPublic: false,
        password: null,
        locked: false,
        maxMembers: 4,
      })
    ).room;
    const guest = await serverB.connect('손님');
    await serverB.ok(guest, 'room:join', { code: room.code });

    const announcements: string[] = [];
    guest.on('chat:message', (m) => {
      if (m.text.startsWith('다음 곡') || m.text.startsWith('대기큐의 곡을 다 들었어요')) announcements.push(m.text);
    });

    const playing = serverB.next(guest, 'music:state', (m) => m.now?.title === '짧은 곡1');
    await serverA.ok(host, 'music:request', { videoId: 'short1sec01' });
    await playing;
    await serverA.ok(host, 'music:request', { videoId: 'short1sec02' });
    await serverA.ok(host, 'music:request', { videoId: 'long0000001' });

    const reachedLong = serverB.next(guest, 'music:state', (m) => m.now?.title === '긴 곡');
    await reachedLong;
    await new Promise((r) => setTimeout(r, 2_500)); // 두 서버의 확인 주기가 몇 번 더 돌아도
    expect(announcements).toEqual(['다음 곡: 짧은 곡2', '다음 곡: 긴 곡']);
  });
});
