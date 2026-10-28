import { useState } from 'react';
import { rankPlayers } from '../types';
import { CATCHMIND_RULES } from './catchmind';
import { DrawingBoard } from './DrawingBoard';
import { ERASER_WIDTH, INK_NAMES, INKS, PEN_WIDTHS, type Ink } from './drawing';
import type { CatchMindController } from './useCatchMind';
import './catchmind.css';

type Props = {
  controller: CatchMindController;
  isHost: boolean;
  nicknameOf: (userId: string) => string;
};

export function CatchMindPanel({ controller, isHost, nicknameOf }: Props) {
  const { game, view } = controller;
  if (!game || !view) return null;

  return (
    <section className="game" aria-label="캐치마인드">
      {game.phase === 'waiting' && (
        <div className="game-lobby">
          <div className="game-lobby-head">
            <h2 className="game-lobby-title">캐치마인드</h2>
            <p className="game-lobby-sub">한 사람이 그리고, 나머지가 채팅으로 맞혀요</p>
          </div>
          <dl className="game-rules">
            <div className="rule-row">
              <dt>라운드</dt>
              <dd>{game.totalRounds}라운드 · 돌아가며 그려요</dd>
            </div>
            <div className="rule-row">
              <dt>시간</dt>
              <dd>
                라운드마다 {CATCHMIND_RULES.roundMs / 1000}초 · {CATCHMIND_RULES.hintAtRemainingMs / 1000}초 남으면 첫
                글자 힌트
              </dd>
            </div>
            <div className="rule-row">
              <dt>점수</dt>
              <dd>
                맞히면 {CATCHMIND_RULES.guessPoints}점 + 빠를수록 최대 {CATCHMIND_RULES.speedBonusMax}점 · 그린 사람{' '}
                {CATCHMIND_RULES.drawerPoints}점
              </dd>
            </div>
          </dl>
          <div className="game-lobby-players">
            <span className="game-lobby-label">참가자 {game.players.length}명</span>
            <ul className="player-chips">
              {game.players.map((id) => (
                <li key={id} className="player-chip">
                  {nicknameOf(id)}
                </li>
              ))}
            </ul>
          </div>
          {isHost ? (
            <div className="game-actions">
              <button type="button" className="btn btn-primary" onClick={controller.start}>
                시작하기
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => controller.quit()}>
                게임 닫기
              </button>
            </div>
          ) : (
            <p className="game-lobby-sub">방장이 시작하기를 기다리고 있어요</p>
          )}
        </div>
      )}

      {game.phase === 'playing' && (
        <>
          <header className="game-head">
            <h2 className="game-title">캐치마인드</h2>
            <span className="game-round">
              {view.round} / {view.totalRounds} 라운드
            </span>
            {!view.isRevealing && (
              <span className={`game-timer${view.remainingSec <= 10 ? ' is-urgent' : ''}`}>
                남은 시간 {view.remainingSec}초
              </span>
            )}
          </header>
          <p className="game-word" aria-live="polite">
            {view.isRevealing ? (
              <>
                정답은 <strong>{view.word}</strong>
              </>
            ) : view.isDrawer ? (
              <>
                제시어 <strong className="word-secret">{view.word}</strong> · 글자 없이 그림으로만 설명해요
              </>
            ) : view.word ? (
              <>
                맞혔어요! 정답은 <strong>{view.word}</strong>
              </>
            ) : (
              <>
                {nicknameOf(view.drawerId ?? '')}님이 그리는 중 · <strong className="word-hint">{view.hint}</strong> (
                {view.hint?.split(' ').filter(Boolean).length}글자)
              </>
            )}
          </p>
          <BoardWithTools controller={controller} />
          <Scoreboard controller={controller} nicknameOf={nicknameOf} />
        </>
      )}

      {game.phase === 'result' && (
        <div className="game-lobby">
          <div className="game-lobby-head">
            <h2 className="game-lobby-title">결과</h2>
          </div>
          <ol className="ranking">
            {rankPlayers(game).map((r) => (
              <li key={r.userId} className={`ranking-item${r.rank === 1 ? ' is-first' : ''}`}>
                <span className="ranking-rank">{r.rank}등</span>
                <span className="ranking-name">{nicknameOf(r.userId)}</span>
                <span className="ranking-score">{r.score}점</span>
              </li>
            ))}
          </ol>
          {isHost && (
            <div className="game-actions">
              <button type="button" className="btn btn-primary" onClick={controller.start}>
                한 판 더
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => controller.quit()}>
                게임 끝내기
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BoardWithTools({ controller }: { controller: CatchMindController }) {
  const [ink, setInk] = useState<Exclude<Ink, 'paper'>>('black');
  const [width, setWidth] = useState<number>(PEN_WIDTHS[1]);
  const [erasing, setErasing] = useState(false);
  const pen = erasing ? { ink: 'paper' as const, width: ERASER_WIDTH } : { ink, width };

  return (
    <div className="board-area">
      {/* 남은 공간 안에서 8:5 비율로 최대한 크게 */}
      <div className="board-frame">
        <DrawingBoard
          strokes={controller.strokes}
          canDraw={controller.canDraw}
          pen={pen}
          onStroke={controller.addStroke}
        />
      </div>
      {controller.canDraw && (
        <div className="draw-tools" role="toolbar" aria-label="그리기 도구">
          <div className="tool-group">
            {INKS.map((c) => (
              <button
                key={c}
                type="button"
                className="swatch"
                aria-label={INK_NAMES[c]}
                aria-pressed={!erasing && ink === c}
                onClick={() => {
                  setInk(c);
                  setErasing(false);
                }}
              >
                <span className="swatch-color" style={{ background: `var(--ink-${c})` }} />
              </button>
            ))}
          </div>
          <div className="tool-group">
            {PEN_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                className="swatch"
                aria-label={`굵기 ${w}`}
                aria-pressed={!erasing && width === w}
                onClick={() => {
                  setWidth(w);
                  setErasing(false);
                }}
              >
                <span className="width-dot" style={{ width: w + 4, height: w + 4 }} />
              </button>
            ))}
          </div>
          <div className="tool-group">
            <button
              type="button"
              className="btn btn-ghost"
              aria-pressed={erasing}
              onClick={() => setErasing((v) => !v)}
            >
              지우개
            </button>
            <button type="button" className="btn btn-ghost" onClick={controller.undo}>
              되돌리기
            </button>
            <button type="button" className="btn btn-ghost" onClick={controller.clear}>
              전부 지우기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Scoreboard({
  controller,
  nicknameOf,
}: {
  controller: CatchMindController;
  nicknameOf: (id: string) => string;
}) {
  const { game, view } = controller;
  if (!game || !view) return null;
  return (
    <ol className="scoreboard" aria-label="점수">
      {game.players.map((id) => {
        const drawing = id === view.drawerId;
        const guessed = view.guessedIds.includes(id);
        return (
          <li key={id} className={`score-chip${guessed ? ' is-guessed' : ''}`}>
            {drawing && <span aria-label="그리는 사람">✏️ </span>}
            {guessed && <span aria-label="맞힘">✓ </span>}
            {nicknameOf(id)} <strong>{game.scores[id] ?? 0}</strong>
          </li>
        );
      })}
    </ol>
  );
}
