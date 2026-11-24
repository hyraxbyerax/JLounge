import { describe, expect, it } from 'vitest';
import type { Song } from './room';
import {
  CHAT_COOLDOWN_MS,
  chatCooldownLeft,
  countsAsChat,
  createRoomState,
  isQuickEmoji,
  QUICK_EMOJIS,
  roomReducer,
  type RoomState,
} from './roomState';

const ME = { id: 'me', nickname: '전북곰' };
const song = (n: number): Song => ({ videoId: `v${n}`, title: `곡${n}`, durationSec: 200 });
const lastText = (s: RoomState) => s.messages.at(-1)?.text;

function withSongs(...ns: number[]): RoomState {
  return ns.reduce((s, n) => roomReducer(s, { type: 'request', song: song(n) }), createRoomState(ME));
}

describe('곡 신청', () => {
  it('재생 중인 곡이 없으면 바로 재생하고, 있으면 대기큐 뒤에 넣는다', () => {
    const s = withSongs(1, 2);
    expect(s.now?.videoId).toBe('v1');
    expect(s.queue.map((e) => e.videoId)).toEqual(['v2']);
  });

  it('같은 곡은 다시 신청할 수 없다', () => {
    const s = roomReducer(withSongs(1, 2), { type: 'request', song: song(2) });
    expect(s.queue).toHaveLength(1);
    expect(lastText(s)).toBe('이미 신청된 곡이에요');
  });

  it('대기큐에는 한 사람당 3곡까지만', () => {
    const s = roomReducer(withSongs(1, 2, 3, 4), { type: 'request', song: song(5) });
    expect(s.queue).toHaveLength(3);
    expect(lastText(s)).toContain('3곡까지');
  });

  it('본인 곡을 취소할 수 있다', () => {
    const s = withSongs(1, 2);
    const next = roomReducer(s, { type: 'cancel', entryId: s.queue[0]!.entryId });
    expect(next.queue).toHaveLength(0);
  });
});

describe('다음 곡 전환', () => {
  it('곡이 끝나면 대기큐 맨 앞 곡을 재생하고, 끝난 곡은 사라진다', () => {
    const s = withSongs(1, 2, 3);
    const next = roomReducer(s, { type: 'ended', entryId: s.now!.entryId });
    expect(next.now?.videoId).toBe('v2');
    expect(next.queue.map((e) => e.videoId)).toEqual(['v3']);
  });

  it('이미 넘어간 곡의 "끝남"이 또 와도 한 번만 넘어간다', () => {
    const s = withSongs(1, 2, 3);
    const once = roomReducer(s, { type: 'ended', entryId: s.now!.entryId });
    const twice = roomReducer(once, { type: 'ended', entryId: s.now!.entryId });
    expect(twice).toBe(once);
  });

  it('재생할 수 없는 영상이면 다음 곡으로, 대기큐가 비면 재생을 멈춘다', () => {
    const s = withSongs(1);
    const next = roomReducer(s, { type: 'failed', entryId: s.now!.entryId });
    expect(next.now).toBeNull();
  });
});

describe('방장 명령어', () => {
  it('방장이 아니면 실행되지 않는다', () => {
    const s = roomReducer(withSongs(1, 2), { type: 'command', text: '/skip', isHost: false });
    expect(s.now?.videoId).toBe('v1');
    expect(lastText(s)).toBe('방장만 쓸 수 있는 명령어예요');
  });

  it('/skip은 대기큐 맨 앞 곡을 재생한다', () => {
    const s = roomReducer(withSongs(1, 2, 3), { type: 'command', text: '/skip', isHost: true });
    expect(s.now?.videoId).toBe('v2');
    expect(s.queue.map((e) => e.videoId)).toEqual(['v3']);
  });

  it('/move는 대기큐 순서를 바꾸고, 범위 밖 번호는 거절한다', () => {
    const s = roomReducer(withSongs(1, 2, 3, 4), { type: 'command', text: '/move 3 1', isHost: true });
    expect(s.queue.map((e) => e.videoId)).toEqual(['v4', 'v2', 'v3']);
    const bad = roomReducer(s, { type: 'command', text: '/move 9 1', isHost: true });
    expect(bad.queue).toEqual(s.queue);
  });

  it('명령어는 채팅에 남지 않는다', () => {
    const s = roomReducer(withSongs(1), { type: 'command', text: '/pause', isHost: true });
    expect(s.messages.some((m) => m.kind === 'user')).toBe(false);
    expect(s.paused).toBe(true);
  });
});

describe('채팅 제한', () => {
  it('보낸 뒤 3초 동안은 기다려야 한다', () => {
    expect(chatCooldownLeft(null, 1000)).toBe(0);
    expect(chatCooldownLeft(1000, 1000)).toBe(CHAT_COOLDOWN_MS);
    expect(chatCooldownLeft(1000, 2500)).toBe(1500);
    expect(chatCooldownLeft(1000, 1000 + CHAT_COOLDOWN_MS)).toBe(0);
  });

  it('명령어와 빈 메시지는 채팅 제한을 받지 않는다', () => {
    expect(countsAsChat('사과')).toBe(true);
    expect(countsAsChat('  /skip ')).toBe(false);
    expect(countsAsChat('   ')).toBe(false);
  });
});

describe('게임 강제 종료 명령어', () => {
  it('방장이 아니면 쓸 수 없다', () => {
    const s = roomReducer(createRoomState(ME), { type: 'command', text: '/endgame', isHost: false });
    expect(lastText(s)).toBe('방장만 쓸 수 있는 명령어예요');
  });

  it('게임이 없을 때 방장이 쓰면 안내만 한다 (게임이 있으면 방이 먼저 처리)', () => {
    const s = roomReducer(createRoomState(ME), { type: 'command', text: '/endgame', isHost: true });
    expect(lastText(s)).toBe('진행 중인 게임이 없어요');
  });
});

describe('일시정지·재개', () => {
  it('채팅에 시스템 메시지를 남기지 않는다', () => {
    const s = withSongs(1);
    const before = s.messages.length;
    const paused = roomReducer(s, { type: 'command', text: '/pause', isHost: true });
    const resumed = roomReducer(paused, { type: 'command', text: '/resume', isHost: true });
    expect(paused.paused).toBe(true);
    expect(resumed.paused).toBe(false);
    expect(resumed.messages.length).toBe(before);
  });
});

describe('서버 채팅 받기', () => {
  it('서버가 보낸 메시지를 붙이고, 같은 메시지가 또 와도 한 번만 남긴다', () => {
    const message = {
      id: 'r:1',
      seq: 1,
      kind: 'user' as const,
      userId: 'a',
      nickname: '가',
      text: '안녕',
      sentAt: '2026-11-25T00:00:00.000Z',
    };
    const once = roomReducer(createRoomState(ME), { type: 'receive', messages: [message] });
    const twice = roomReducer(once, { type: 'receive', messages: [message] });
    expect(twice.messages.map((m) => m.text)).toEqual(['안녕']);
    expect(twice).toBe(once);
  });

  it('명령어가 아닌 글은 화면에서 채팅으로 만들지 않는다 (서버를 거친다)', () => {
    const s = roomReducer(createRoomState(ME), { type: 'command', text: '그냥 채팅', isHost: true });
    expect(s.messages).toHaveLength(0);
  });
});

describe('희노애락 이모지', () => {
  it('이모지 버튼 하나만 보낸 메시지를 알아본다', () => {
    expect(QUICK_EMOJIS.map((q) => q.emoji)).toEqual(['😄', '😠', '😢', '🤣']);
    expect(isQuickEmoji('🤣')).toBe(true);
    expect(isQuickEmoji('ㅋㅋ🤣')).toBe(false);
  });
});
