import type { ReactNode } from 'react';
import type { QueuedSong } from '../model/room';
import { LoungeTV } from './LoungeTV';

type Props = {
  now: QueuedSong | null;
  paused: boolean;
  /** 게임 화면. 있으면 라운지 TV는 작게 옆에 둔다 */
  game: ReactNode | null;
  onSongEnded: (entryId: string) => void;
  onSongError: (entryId: string) => void;
};

export function Stage({ now, paused, game, onSongEnded, onSongError }: Props) {
  // 게임을 열고 닫아도 TV가 같은 자리에 남아 있어야 음악이 끊기지 않는다
  return (
    <div className={`stage${game ? ' is-game' : ''}`}>
      {game}
      <LoungeTV now={now} paused={paused} small={game !== null} onEnded={onSongEnded} onError={onSongError} />
    </div>
  );
}
