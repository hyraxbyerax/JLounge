import { useState, type FormEvent } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import type { Song } from '../model/room';
import { searchSongs, type SearchResponse } from '../model/songSearch';

type Props = {
  onPick: (song: Song) => void;
  onClose: () => void;
};

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; response: SearchResponse }
  | { status: 'error'; message: string };

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** 곡 제목이나 가수로 유튜브를 검색해서 신청한다 */
export function SongSearchDialog({ onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });

  // 검색은 입력할 때마다가 아니라 [검색]을 눌렀을 때만 (유튜브 사용량 절약)
  async function search(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || state.status === 'loading') return;
    setState({ status: 'loading' });
    try {
      setState({ status: 'done', response: await searchSongs(q) });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : '곡 검색이 잠깐 안 돼요' });
    }
  }

  return (
    <Modal title="곡 신청" onClose={onClose} wide>
      <div className="modal-form">
        <form className="search-form" onSubmit={search} role="search">
          <label className="sr-only" htmlFor="song-query">
            곡 검색
          </label>
          <input
            id="song-query"
            className="input"
            type="search"
            placeholder="곡 제목이나 가수"
            autoFocus
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={state.status === 'loading'}>
            검색
          </button>
        </form>

        <div aria-live="polite">
          {state.status === 'idle' && <p className="form-hint">듣고 싶은 곡 제목이나 가수를 검색해보세요</p>}
          {state.status === 'loading' && <p className="form-hint">찾는 중이에요…</p>}
          {state.status === 'error' && (
            <p className="form-error" role="alert">
              {state.message}
            </p>
          )}
          {state.status === 'done' && (
            <>
              {state.response.source === 'sample' && (
                <p className="form-hint">유튜브 검색이 아직 연결되지 않아 예시 곡만 보여요</p>
              )}
              {state.response.results.length === 0 ? (
                <p className="form-hint">검색 결과가 없어요. 다른 말로 찾아보세요</p>
              ) : (
                <ul className="search-results">
                  {state.response.results.map((song) => (
                    <li key={song.videoId} className="search-item">
                      {song.thumbnailUrl && <img className="search-thumb" src={song.thumbnailUrl} alt="" />}
                      <span className="queue-text">
                        <span className="queue-title">{song.title}</span>
                        <span className="queue-by">
                          {song.channelTitle} · {formatDuration(song.durationSec)}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() =>
                          onPick({ videoId: song.videoId, title: song.title, durationSec: song.durationSec })
                        }
                      >
                        신청
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
