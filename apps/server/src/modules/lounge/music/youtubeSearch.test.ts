import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/http/errors.ts';
import { withSearchCache, type CacheStore, type MusicSearchProvider } from './search.ts';
import { createYouTubeSearch, decodeEntities, parseIsoDuration } from './youtubeSearch.ts';

function fakeFetch(responses: Record<string, unknown>, status = 200): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const path = url.pathname.split('/').pop()!;
    return new Response(JSON.stringify(responses[path] ?? {}), { status });
  }) as typeof fetch;
}

const searchResponse = {
  items: [
    { id: { videoId: 'a' }, snippet: { title: 'Tom &amp; Jerry&#39;s Song', channelTitle: 'Ch', thumbnails: {} } },
    { id: { videoId: 'live' }, snippet: { title: 'Live radio', channelTitle: 'Ch' } },
    { id: { videoId: 'blocked' }, snippet: { title: 'No embed', channelTitle: 'Ch' } },
  ],
};
const videosResponse = {
  items: [
    { id: 'a', contentDetails: { duration: 'PT3M30S' }, status: { embeddable: true } },
    { id: 'live', contentDetails: { duration: 'P0D' }, status: { embeddable: true } },
    { id: 'blocked', contentDetails: { duration: 'PT2M' }, status: { embeddable: false } },
  ],
};

describe('유튜브 검색', () => {
  it('길이를 붙이고, 생방송·퍼가기 금지 영상은 뺀다', async () => {
    const search = createYouTubeSearch('key', {
      fetchFn: fakeFetch({ search: searchResponse, videos: videosResponse }),
    });
    const results = await search.search('tom');
    expect(results).toEqual([
      { videoId: 'a', title: "Tom & Jerry's Song", channelTitle: 'Ch', durationSec: 210, thumbnailUrl: null },
    ]);
  });

  it('사용량을 다 쓰면(403) 알아보기 쉬운 오류를 낸다', async () => {
    const search = createYouTubeSearch('key', { fetchFn: fakeFetch({}, 403) });
    await expect(search.search('x')).rejects.toMatchObject({ code: 'SEARCH_QUOTA' });
    await expect(search.search('x')).rejects.toBeInstanceOf(AppError);
  });

  it('ISO 길이와 HTML 문자를 바꾼다', () => {
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('PT45S')).toBe(45);
    expect(parseIsoDuration('P0D')).toBe(0);
    expect(decodeEntities('A &lt;3 &quot;B&quot; &#8211; C')).toBe('A <3 "B" – C');
  });
});

describe('검색 결과 캐시', () => {
  it('같은 검색어(띄어쓰기·대소문자 무시)는 한 번만 실제로 검색한다', async () => {
    let calls = 0;
    const provider: MusicSearchProvider = {
      source: 'youtube',
      async search() {
        calls++;
        return [{ videoId: 'a', title: 't', channelTitle: 'c', durationSec: 1, thumbnailUrl: null }];
      },
      async lookup() {
        calls++;
        return null;
      },
    };
    const map = new Map<string, string>();
    const store: CacheStore = {
      get: async (k) => map.get(k) ?? null,
      setEx: async (k, _ttl, v) => map.set(k, v),
    };
    const cached = withSearchCache(provider, store, 60);
    await cached.search('Hello World');
    const again = await cached.search('  hello   world ');
    expect(calls).toBe(1);
    expect(again[0]?.videoId).toBe('a');
    expect([...map.keys()]).toEqual(['ytsearch:youtube:hello world']);
  });

  it('영상 확인도 저장해 두고, 재생할 수 없는 영상(null)도 다시 묻지 않는다', async () => {
    let calls = 0;
    const provider: MusicSearchProvider = {
      source: 'youtube',
      search: async () => [],
      async lookup() {
        calls++;
        return null;
      },
    };
    const map = new Map<string, string>();
    const cached = withSearchCache(
      provider,
      { get: async (k) => map.get(k) ?? null, setEx: async (k, _t, v) => map.set(k, v) },
      60,
    );
    expect(await cached.lookup('abcdefghijk')).toBeNull();
    expect(await cached.lookup('abcdefghijk')).toBeNull();
    expect(calls).toBe(1);
  });
});
