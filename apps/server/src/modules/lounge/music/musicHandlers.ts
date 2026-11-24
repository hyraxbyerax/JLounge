/*
 * 음악 같이 듣기 소켓 이벤트와 "곡이 끝났는지" 확인.
 * - 신청: 영상은 서버가 유튜브에서 확인한다(재생 불가·생방송 거절, 제목·길이는 서버 값)
 * - 다음 곡 전환은 서버가 한다. 곡이 끝날 시각을 Redis(rooms:music-due)에 두고 모든 서버가 1초마다 확인하되,
 *   꺼내기(ZREM)에 성공한 서버만, 그리고 "지금 곡이 아직 그 곡일 때만" 넘긴다 → 서버가 여러 대여도 한 번만 넘어간다
 * - 권한(방장 명령어, 본인 곡 취소)은 Lua 스크립트 안에서 확인한다
 */
import {
  entryInput,
  MAX_SONGS_PER_USER,
  musicCommandInput,
  musicRequestInput,
  musicSeekInput,
  type MusicEntry,
} from '@lounge/shared';
import { randomBytes } from 'node:crypto';
import { AppError } from '../../../shared/http/errors.ts';
import { validate } from '../../../shared/http/validate.ts';
import type { Logger } from '../../../shared/logger.ts';
import type { IoServer, IoSocket } from '../../../shared/realtime/socket.ts';
import { roomChannel } from '../rooms/channels.ts';
import type { RoomHandlers } from '../rooms/handlers.ts';
import type { AdvanceResult, MusicStore } from './musicStore.ts';
import type { MusicSearchProvider } from './search.ts';

const TICK_MS = 1_000;

const fail = (code: string, message: string) => new AppError(code, message);
const NOT_HOST = () => fail('MUSIC_NOT_HOST', '방장만 쓸 수 있는 명령어예요');

type Deps = {
  io: IoServer;
  music: MusicStore;
  rooms: RoomHandlers;
  search: MusicSearchProvider;
  logger: Logger;
  now?: () => number;
};

export function createMusicHandlers({ io, music, rooms, search, logger, now = Date.now }: Deps) {
  async function publish(roomId: string) {
    io.to(roomChannel(roomId)).emit('music:state', { ...(await music.state(roomId)), roomId });
  }

  /** 다음 곡으로 넘어간 뒤: 채팅 안내, 모두에게 상태, 로비 창문(재생 중인 곡) 갱신 */
  async function afterAdvance(roomId: string, result: AdvanceResult, reason: string) {
    if (result.status !== 'NEXT' && result.status !== 'EMPTY') return;
    const text =
      result.status === 'NEXT' ? `${reason}다음 곡: ${result.next.title}` : `${reason}대기큐의 곡을 다 들었어요`;
    await rooms.system(roomId, text);
    await Promise.all([publish(roomId), rooms.publishLobby()]);
  }

  /** 끝날 시각이 지난 곡을 넘긴다 */
  async function tick() {
    for (const { roomId, entryId } of await music.takeDue(now())) {
      const result = await music.advance(roomId, now(), { expectedEntryId: entryId });
      await afterAdvance(roomId, result, '');
    }
  }

  function register(socket: IoSocket) {
    const me = () => socket.data.user;

    socket.on('music:request', (input, ack) =>
      rooms.respond(socket, 'music:request', ack, async () => {
        const roomId = await rooms.requireRoom(socket);
        const { videoId } = validate(musicRequestInput, input);
        const song = await search.lookup(videoId);
        if (!song) throw fail('MUSIC_UNPLAYABLE', '이 영상은 라운지에서 재생할 수 없어요. 다른 곡을 골라주세요');
        const entry: MusicEntry = {
          entryId: `e_${randomBytes(6).toString('base64url')}`,
          videoId,
          title: song.title,
          durationSec: song.durationSec,
          requesterId: me().userId,
          requesterNickname: me().nickname,
        };
        const result = await music.request(roomId, entry, now(), MAX_SONGS_PER_USER);
        if (result.status === 'DUPLICATE') throw fail('MUSIC_DUPLICATE', '이미 신청된 곡이에요');
        if (result.status === 'LIMIT') {
          throw fail('MUSIC_LIMIT', `대기큐에는 한 사람당 ${MAX_SONGS_PER_USER}곡까지 신청할 수 있어요`);
        }
        if (result.status === 'NOT_FOUND') throw fail('ROOM_NOT_FOUND', '방이 없어졌어요');
        if (result.status === 'PLAYING') {
          await rooms.system(roomId, `지금 재생: ${entry.title}`);
          await rooms.publishLobby();
        }
        await publish(roomId);
        return { position: result.position };
      }),
    );

    socket.on('music:cancel', (input, ack) =>
      rooms.respond(socket, 'music:cancel', ack, async () => {
        const roomId = await rooms.requireRoom(socket);
        const { entryId } = validate(entryInput, input);
        const result = await music.cancel(roomId, now(), me().userId, entryId);
        if (result.status === 'NOT_YOURS') throw fail('MUSIC_NOT_YOURS', '본인이 신청한 곡만 취소할 수 있어요');
        if (result.status !== 'OK') throw fail('MUSIC_NOT_IN_QUEUE', '대기큐에 없는 곡이에요');
        await publish(roomId);
        return { notice: `'${result.entry!.title}' 신청을 취소했어요` };
      }),
    );

    socket.on('music:command', (input, ack) =>
      rooms.respond(socket, 'music:command', ack, async () => {
        const roomId = await rooms.requireRoom(socket);
        const { name, args } = validate(musicCommandInput, input);
        const t = now();

        if (name === 'skip') {
          const result = await music.advance(roomId, t, { actorId: me().userId, hostOnly: true });
          if (result.status === 'NOT_HOST') throw NOT_HOST();
          if (result.status === 'EMPTY' && !result.ended) return { notice: '넘길 곡이 없어요' };
          await afterAdvance(roomId, result, '방장이 곡을 넘겼어요. ');
          return { notice: null };
        }

        const result = await music.command(roomId, t, me().userId, name, args);
        if (result.status === 'NOT_HOST') throw NOT_HOST();
        if (result.status === 'NOT_FOUND') throw fail('ROOM_NOT_FOUND', '방이 없어졌어요');
        if (result.status === 'RANGE') {
          const example = name === 'move' ? '/move 3 1' : '/remove 2';
          return {
            notice:
              result.length === 0
                ? '대기큐가 비어 있어요'
                : `대기큐 번호를 확인해주세요 (1~${result.length}). 예: ${example}`,
          };
        }
        if (result.status === 'NOTHING') {
          const nothing: Record<string, string> = {
            pause: '일시정지할 곡이 없어요',
            resume: '다시 재생할 곡이 없어요',
            stop: '재생 중인 곡이 없어요',
            clear: '대기큐가 이미 비어 있어요',
          };
          return { notice: nothing[name] ?? '할 일이 없어요' };
        }
        if (result.status !== 'OK') throw fail('MUSIC_UNKNOWN', '모르는 명령어예요');

        // 일시정지·재개는 채팅에 남기지 않는다 (TV의 일시정지 화면으로 충분 — 명세 7장)
        let notice: string | null = null;
        if (name === 'stop') await rooms.system(roomId, '방장이 음악을 멈췄어요');
        if (name === 'clear') await rooms.system(roomId, '방장이 대기큐를 비웠어요');
        if (name === 'remove') notice = `'${result.entry?.title}'을(를) 대기큐에서 뺐어요`;
        if (name === 'move') notice = `'${result.entry?.title}'을(를) ${result.to}번으로 옮겼어요`;
        await publish(roomId);
        if (name === 'stop') await rooms.publishLobby();
        return { notice };
      }),
    );

    socket.on('music:seek', (input, ack) =>
      rooms.respond(socket, 'music:seek', ack, async () => {
        const roomId = await rooms.requireRoom(socket);
        const { positionSec } = validate(musicSeekInput, input);
        const result = await music.command(roomId, now(), me().userId, 'seek', [Math.round(positionSec * 1000)]);
        if (result.status === 'NOT_HOST') throw NOT_HOST();
        await publish(roomId);
        return null;
      }),
    );

    // 브라우저가 "재생할 수 없는 영상"이라고 알려오면, 지금 곡이 아직 그 곡일 때만 넘긴다 (여럿이 알려와도 한 번)
    socket.on('music:failed', (input) => {
      const roomId = [...socket.rooms].find((r) => r.startsWith('room:'))?.slice('room:'.length);
      const parsed = entryInput.safeParse(input);
      if (!roomId || !parsed.success) return;
      music
        .advance(roomId, now(), { expectedEntryId: parsed.data.entryId })
        .then((result) => {
          const title = result.status === 'NEXT' || result.status === 'EMPTY' ? result.ended?.title : null;
          return afterAdvance(roomId, result, title ? `'${title}'은(는) 재생할 수 없어서 넘어가요. ` : '');
        })
        .catch((err: unknown) => logger.warn('재생 실패 처리 오류', { err, roomId }));
    });
  }

  /** 1초마다 끝난 곡을 확인한다. 돌려준 함수로 멈춘다 */
  function startTicker(): () => void {
    const timer = setInterval(() => {
      tick().catch((err: unknown) => logger.warn('다음 곡 확인 실패', { err }));
    }, TICK_MS);
    return () => clearInterval(timer);
  }

  return { register, tick, startTicker };
}
