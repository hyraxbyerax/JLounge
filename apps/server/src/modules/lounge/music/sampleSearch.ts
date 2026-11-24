/*
 * YOUTUBE_API_KEY가 없을 때 쓰는 예시 곡 검색 (명세: 키가 없으면 가짜 검색 결과).
 */
import { normalizeQuery, type MusicSearchProvider, type SongResult } from './search.ts';

const SAMPLE_SONGS: SongResult[] = [
  { videoId: 'fJ9rUzIMcZQ', title: 'Queen – Bohemian Rhapsody', durationSec: 355 },
  { videoId: 'gdZLi9oWNZg', title: 'BTS – Dynamite', durationSec: 199 },
  { videoId: '9bZkp7q19f0', title: 'PSY – 강남스타일', durationSec: 253 },
  { videoId: 'JGwWNGJdvx8', title: 'Ed Sheeran – Shape of You', durationSec: 263 },
  { videoId: 'kJQP7kiw5Fk', title: 'Luis Fonsi – Despacito', durationSec: 282 },
  { videoId: 'dQw4w9WgXcQ', title: 'Rick Astley – Never Gonna Give You Up', durationSec: 213 },
].map((s) => ({ ...s, channelTitle: '예시 곡', thumbnailUrl: `https://i.ytimg.com/vi/${s.videoId}/mqdefault.jpg` }));

export function createSampleSearch(): MusicSearchProvider {
  return {
    source: 'sample',
    async search(query) {
      const q = normalizeQuery(query);
      return SAMPLE_SONGS.filter((s) => s.title.toLowerCase().includes(q));
    },
    async lookup(videoId) {
      return SAMPLE_SONGS.find((s) => s.videoId === videoId) ?? null;
    },
  };
}
