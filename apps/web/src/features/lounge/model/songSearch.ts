/*
 * 곡 검색. 서버가 유튜브에서 찾아준다 (YOUTUBE_API_KEY가 없으면 서버가 예시 곡을 돌려준다).
 */
import { apiGet } from '../../../shared/api/http';
import type { Song } from './room';

export type SongResult = Song & { channelTitle: string; thumbnailUrl: string | null };

export type SearchResponse = {
  /** youtube: 실제 유튜브 검색 / sample: 키가 없어 예시 곡 */
  source: 'youtube' | 'sample';
  results: SongResult[];
};

export function searchSongs(query: string): Promise<SearchResponse> {
  return apiGet<SearchResponse>(`/api/lounge/music/search?q=${encodeURIComponent(query)}`);
}
