import {
  CATCHMIND_RULES,
  ERASER_WIDTH,
  INK_NAMES,
  INKS,
  PEN_WIDTHS,
  TOPIC_LABEL,
  WORD_TOPICS,
  type GameSnapshot,
  type Ink,
  type Stroke,
  type WordTopic,
} from '@lounge/shared';
import { useState } from 'react';
import { GameLobby, Scoreboard } from '../GameLobby';
import { useRemainingSec } from '../useRemaining';
import { DrawingBoard } from './DrawingBoard';
import './catchmind.css';

type Props = {
  game: GameSnapshot;
  meId: string;
  isHost: boolean;
  nicknameOf: (userId: string) => string;
  onStart: () => void;
  onQuit: () => void;
  onTopic: (topic: WordTopic) => void;
  onStroke: (stroke: Stroke) => void;
  onUndo: () => void;
  onClear: () => void;
};

/** 캐치마인드 화면. 판정·시간·제시어는 서버가 정하고, 제시어는 그리는 사람(과 맞힌 사람)에게만 온다 */
export function CatchMindPanel({
  game,
  meId,
  isHost,
  nicknameOf,
  onStart,
  onQuit,
  onTopic,
  onStroke,
  onUndo,
  onClear,
}: Props) {
  const { view } = game;
  const remainingSec = useRemainingSec(view.endsAt);
  const topic = view.topic ?? 'all';

  if (view.phase !== 'playing') {
    return (
      <section className="game" aria-label="캐치마인드">
        <GameLobby
          view={view}
          isHost={isHost}
          nicknameOf={nicknameOf}
          description="한 사람이 그리고, 나머지가 채팅으로 맞혀요"
          onStart={onStart}
          onQuit={onQuit}
          rules={
            <>
              <div className="rule-row">
                <dt>주제</dt>
                <dd>
                  {isHost ? (
                    <span className="topic-chips" role="radiogroup" aria-label="제시어 주제">
                      {WORD_TOPICS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={t === topic}
                          className="topic-chip"
                          onClick={() => t !== topic && onTopic(t)}
                        >
                          {TOPIC_LABEL[t]}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <>{TOPIC_LABEL[topic]} · 방장이 골라요</>
                  )}
                </dd>
              </div>
              <div className="rule-row">
                <dt>라운드</dt>
                <dd>{view.totalRounds}라운드 · 돌아가며 그려요</dd>
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
            </>
          }
        />
      </section>
    );
  }

  const isDrawer = view.drawerId === meId;
  const canDraw = isDrawer && !view.revealing;
  const word = game.private?.word ?? null;

  return (
    <section className="game" aria-label="캐치마인드">
      <header className="game-head">
        <h2 className="game-title">캐치마인드</h2>
        <span className="game-round">
          {view.round} / {view.totalRounds} 라운드
        </span>
        {!view.revealing && (
          <span className={`game-timer${remainingSec <= 10 ? ' is-urgent' : ''}`}>남은 시간 {remainingSec}초</span>
        )}
      </header>
      <p className="game-word" aria-live="polite">
        {view.revealing ? (
          <>
            정답은 <strong>{view.answer}</strong>
          </>
        ) : isDrawer ? (
          <>
            제시어 <strong className="word-secret">{word}</strong> · 글자 없이 그림으로만 설명해요
          </>
        ) : word ? (
          <>
            맞혔어요! 정답은 <strong>{word}</strong>
          </>
        ) : (
          <>
            {nicknameOf(view.drawerId ?? '')}님이 그리는 중 · <strong className="word-hint">{view.prompt}</strong> (
            {view.prompt?.split(' ').filter(Boolean).length}글자)
          </>
        )}
      </p>
      <BoardWithTools strokes={game.strokes} canDraw={canDraw} onStroke={onStroke} onUndo={onUndo} onClear={onClear} />
      <Scoreboard view={view} nicknameOf={nicknameOf} markDrawer />
    </section>
  );
}

function BoardWithTools({
  strokes,
  canDraw,
  onStroke,
  onUndo,
  onClear,
}: {
  strokes: Stroke[];
  canDraw: boolean;
  onStroke: (stroke: Stroke) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  const [ink, setInk] = useState<Exclude<Ink, 'paper'>>('black');
  const [width, setWidth] = useState<number>(PEN_WIDTHS[1]);
  const [erasing, setErasing] = useState(false);
  const pen = erasing ? { ink: 'paper' as const, width: ERASER_WIDTH } : { ink, width };

  return (
    <div className="board-area">
      {/* 남은 공간 안에서 8:5 비율로 최대한 크게 */}
      <div className="board-frame">
        <DrawingBoard strokes={strokes} canDraw={canDraw} pen={pen} onStroke={onStroke} />
      </div>
      {canDraw && (
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
            <button type="button" className="btn btn-ghost" onClick={onUndo}>
              되돌리기
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClear}>
              전부 지우기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
