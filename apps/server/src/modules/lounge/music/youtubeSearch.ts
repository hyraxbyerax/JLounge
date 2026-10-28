/*
 * 유튜브 Data API v3 검색.
 * search.list(100 단위)로 영상을 찾고, videos.list(1 단위)로 길이·퍼가기 허용 여부를 확인한다.
 * 무료 사용량은 하루 10,000 단위 → 캐시 없이 약 100번 검색. 그래서 withSearchCache로 감싸 쓴다.
 */
import { AppError } from '../../../shared/http/errors.ts';
import type { MusicSearchProvider, SongResult } from './search.ts';

const API = 'https://www.googleapis.com/youtube/v3';

type SearchResponse = {
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: Record<string, { url?: string } | undefined>;
    };
  }[];
};

type VideosResponse = {
  items?: {
    id: string;
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean };
  }[];
};

/** "PT1H2M3S" → 3723. 생방송은 "P0D" → 0 */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d = '0', h = '0', min = '0', s = '0'] = m;
  return Number(d) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(s);
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** 유튜브가 제목에 넣어 보내는 HTML 문자(&amp; 등)를 원래 글자로 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

export function createYouTubeSearch(
  apiKey: string,
  { fetchFn = fetch, maxResults = 10 }: { fetchFn?: typeof fetch; maxResults?: number } = {},
): MusicSearchProvider {
  async function call<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API}/${path}`);
    for (const [k, v] of Object.entries({ ...params, key: apiKey })) url.searchParams.set(k, v);
    const res = await fetchFn(url);
    if (!res.ok) {
      const quota = res.status === 403;
      throw new AppError(
        quota ? 'SEARCH_QUOTA' : 'SEARCH_FAILED',
        quota
          ? '오늘 곡 검색을 너무 많이 써서 잠시 쉬어야 해요. 나중에 다시 시도해주세요'
          : '곡 검색이 잠깐 안 돼요. 다시 시도해주세요',
        503,
      );
    }
    return (await res.json()) as T;
  }

  return {
    source: 'youtube',
    async search(query) {
      const found = await call<SearchResponse>('search', {
        part: 'snippet',
        type: 'video',
        videoEmbeddable: 'true',
        maxResults: String(maxResults),
        regionCode: 'KR',
        safeSearch: 'moderate',
        q: query,
      });
      const items = (found.items ?? []).filter((i) => i.id?.videoId);
      if (items.length === 0) return [];

      const details = await call<VideosResponse>('videos', {
        part: 'contentDetails,status',
        id: items.map((i) => i.id!.videoId!).join(','),
      });
      const byId = new Map((details.items ?? []).map((v) => [v.id, v]));

      const results: SongResult[] = [];
      for (const item of items) {
        const videoId = item.id!.videoId!;
        const detail = byId.get(videoId);
        const durationSec = parseIsoDuration(detail?.contentDetails?.duration ?? '');
        // 퍼가기 금지 영상은 라운지 TV에서 재생이 안 되고, 생방송(길이 0)은 끝나지 않아 다음 곡으로 못 넘어간다
        if (detail?.status?.embeddable === false || durationSec === 0) continue;
        const thumbs = item.snippet?.thumbnails ?? {};
        results.push({
          videoId,
          title: decodeEntities(item.snippet?.title ?? ''),
          channelTitle: decodeEntities(item.snippet?.channelTitle ?? ''),
          durationSec,
          thumbnailUrl: thumbs.medium?.url ?? thumbs.default?.url ?? null,
        });
      }
      return results;
    },
  };
}
