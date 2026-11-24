import type { GameView } from '@lounge/shared';
import type { ReactNode } from 'react';

type Props = {
  view: GameView;
  isHost: boolean;
  nicknameOf: (userId: string) => string;
  /** 게임마다 다른 규칙 설명 */
  rules: ReactNode;
  description: string;
  onStart: () => void;
  onQuit: () => void;
};

/** 모든 게임 공통: 대기 화면(규칙·참가자·시작)과 결과 화면(순위·한 판 더) */
export function GameLobby({ view, isHost, nicknameOf, rules, description, onStart, onQuit }: Props) {
  if (view.phase === 'result') {
    return (
      <div className="game-lobby">
        <div className="game-lobby-head">
          <h2 className="game-lobby-title">결과</h2>
        </div>
        <ol className="ranking">
          {(view.ranking ?? []).map((r) => (
            <li key={r.userId} className={`ranking-item${r.rank === 1 ? ' is-first' : ''}`}>
              <span className="ranking-rank">{r.rank}등</span>
              <span className="ranking-name">{nicknameOf(r.userId)}</span>
              <span className="ranking-score">{r.score}점</span>
            </li>
          ))}
        </ol>
        {isHost ? (
          <div className="game-actions">
            <button type="button" className="btn btn-primary" onClick={onStart}>
              한 판 더
            </button>
            <button type="button" className="btn btn-ghost" onClick={onQuit}>
              게임 끝내기
            </button>
          </div>
        ) : (
          <p className="game-lobby-sub">방장이 다음 판을 정하고 있어요</p>
        )}
      </div>
    );
  }

  return (
    <div className="game-lobby">
      <div className="game-lobby-head">
        <h2 className="game-lobby-title">{view.name}</h2>
        <p className="game-lobby-sub">{description}</p>
      </div>
      <dl className="game-rules">{rules}</dl>
      <div className="game-lobby-players">
        <span className="game-lobby-label">참가자 {view.players.length}명</span>
        <ul className="player-chips">
          {view.players.map((id) => (
            <li key={id} className="player-chip">
              {nicknameOf(id)}
            </li>
          ))}
        </ul>
      </div>
      {isHost ? (
        <div className="game-actions">
          <button type="button" className="btn btn-primary" onClick={onStart}>
            시작하기
          </button>
          <button type="button" className="btn btn-ghost" onClick={onQuit}>
            게임 닫기
          </button>
        </div>
      ) : (
        <p className="game-lobby-sub">방장이 시작하기를 기다리고 있어요</p>
      )}
    </div>
  );
}

/** 점수판 (진행 중) */
export function Scoreboard({
  view,
  nicknameOf,
  markDrawer = false,
}: {
  view: GameView;
  nicknameOf: (id: string) => string;
  markDrawer?: boolean;
}) {
  return (
    <ol className="scoreboard" aria-label="점수">
      {view.players.map((id) => {
        const drawing = markDrawer && id === view.drawerId;
        const guessed = view.guessedIds.includes(id);
        return (
          <li key={id} className={`score-chip${guessed ? ' is-guessed' : ''}`}>
            {drawing && <span aria-label="그리는 사람">✏️ </span>}
            {guessed && <span aria-label="맞힘">✓ </span>}
            {nicknameOf(id)} <strong>{view.scores[id] ?? 0}</strong>
          </li>
        );
      })}
    </ol>
  );
}
