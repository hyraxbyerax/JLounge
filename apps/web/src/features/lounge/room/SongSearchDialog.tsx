import { useState } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import type { Song } from '../model/room';
import { searchSongs } from '../model/songSearch';

type Props = {
  onPick: (song: Song) => void;
  onClose: () => void;
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** 곡 검색 결과에서 골라 신청한다 */
export function SongSearchDialog({ onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const results = searchSongs(query);

  return (
    <Modal title="곡 신청" onClose={onClose}>
      <div className="modal-form">
        <label className="sr-only" htmlFor="song-query">
          곡 검색
        </label>
        <input
          id="song-query"
          className="input"
          type="search"
          placeholder="곡 제목이나 가수 검색"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length === 0 ? (
          <p className="form-hint">검색 결과가 없어요. 다른 말로 찾아보세요</p>
        ) : (
          <ul className="search-results">
            {results.map((song) => (
              <li key={song.videoId} className="search-item">
                <span className="queue-text">
                  <span className="queue-title">{song.title}</span>
                  <span className="queue-by">{formatDuration(song.durationSec)}</span>
                </span>
                <button type="button" className="btn btn-primary" onClick={() => onPick(song)}>
                  신청
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
