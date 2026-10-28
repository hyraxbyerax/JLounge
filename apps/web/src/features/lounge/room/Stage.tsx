import type { ReactNode } from 'react';
import type { QueuedSong } from '../model/room';
import { LoungeTV } from './LoungeTV';

type Props = {
  now: QueuedSong | null;
  paused: boolean;
  /** 게임 화면. 있으면 라운지 TV는 작게 옆에 둔다 */
  game: ReactNode | null;
};

export function Stage({ now, paused, game }: Props) {
  if (!game) {
    return (
      <div className="stage">
        <LoungeTV now={now} paused={paused} />
      </div>
    );
  }
  return (
    <div className="stage is-game">
      {game}
      <LoungeTV now={now} paused={paused} small />
    </div>
  );
}
