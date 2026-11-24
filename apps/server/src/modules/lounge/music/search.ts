/*
 * 곡 검색은 이 인터페이스 뒤에 숨긴다 (명세: MusicSearchProvider).
 * - YOUTUBE_API_KEY가 있으면 유튜브 검색 (youtubeSearch.ts)
 * - 없으면 예시 곡 (sampleSearch.ts)
 * 나중에 Lambda 호출 같은 구현을 추가해 바꿔 끼울 수 있다.
 */

export type SongResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  durationSec: number;
  thumbnailUrl: string | null;
};

export interface MusicSearchProvider {
  /** 화면에 "예시 곡만 보여요" 같은 안내를 하려고 어떤 구현인지 알려준다 */
  readonly source: 'youtube' | 'sample';
  search(query: string): Promise<SongResult[]>;
  /**
   * 곡 신청 때 영상 하나를 확인한다. 재생할 수 없는 영상(없음·퍼가기 금지·생방송)이면 null.
   * 제목·길이는 화면이 보낸 값을 믿지 않고 여기서 받은 값을 쓴다 (다음 곡 전환 시각의 기준)
   */
  lookup(videoId: string): Promise<SongResult | null>;
}

/** 검색어를 캐시 키·비교용으로 정리한다 */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

export type CacheStore = {
  get(key: string): Promise<string | null>;
  setEx(key: string, ttlSec: number, value: string): Promise<unknown>;
};

/** 같은 검색어는 Redis(ytsearch:{검색어})에 저장해 두고 재사용한다 (유튜브 API 사용량 절약) */
export function withSearchCache(provider: MusicSearchProvider, store: CacheStore, ttlSec: number): MusicSearchProvider {
  return {
    source: provider.source,
    async search(query) {
      const key = `ytsearch:${provider.source}:${normalizeQuery(query)}`;
      const cached = await store.get(key);
      if (cached) return JSON.parse(cached) as SongResult[];
      const results = await provider.search(query);
      await store.setEx(key, ttlSec, JSON.stringify(results));
      return results;
    },
    async lookup(videoId) {
      const key = `ytsearch:${provider.source}:video:${videoId}`;
      const cached = await store.get(key);
      if (cached) return JSON.parse(cached) as SongResult | null;
      const result = await provider.lookup(videoId);
      await store.setEx(key, ttlSec, JSON.stringify(result));
      return result;
    },
  };
}
