/*
 * 곡 검색. 유튜브 API 키가 없을 때 쓰는 가짜 검색 결과 (명세의 MusicSearchProvider 가짜 구현).
 * 서버가 생기면 서버의 검색 API 호출로 바뀐다.
 */
import type { Song } from './room';

const FALLBACK_SONGS: Song[] = [
  { videoId: 'jfKfPfyJRdk', title: 'lofi hip hop radio – beats to relax/study to', durationSec: 3600 },
  { videoId: 'fJ9rUzIMcZQ', title: 'Queen – Bohemian Rhapsody', durationSec: 355 },
  { videoId: 'gdZLi9oWNZg', title: 'BTS – Dynamite', durationSec: 199 },
  { videoId: '9bZkp7q19f0', title: 'PSY – 강남스타일', durationSec: 253 },
  { videoId: 'JGwWNGJdvx8', title: 'Ed Sheeran – Shape of You', durationSec: 263 },
  { videoId: 'kJQP7kiw5Fk', title: 'Luis Fonsi – Despacito', durationSec: 282 },
  { videoId: 'dQw4w9WgXcQ', title: 'Rick Astley – Never Gonna Give You Up', durationSec: 213 },
];

export function searchSongs(query: string): Song[] {
  const q = query.trim().toLowerCase();
  return FALLBACK_SONGS.filter((s) => s.title.toLowerCase().includes(q));
}
