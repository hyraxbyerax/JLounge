import { CHOSUNG_RULES, type GameSnapshot } from '@lounge/shared';
import { GameLobby, Scoreboard } from '../GameLobby';
import { useRemainingSec } from '../useRemaining';
import '../catchmind/catchmind.css';
import './chosung.css';

type Props = {
  game: GameSnapshot;
  isHost: boolean;
  nicknameOf: (userId: string) => string;
  onStart: () => void;
  onQuit: () => void;
};

/** 초성 퀴즈 화면: 분류와 초성을 크게 보여주고, 채팅으로 맞힌다 */
export function ChosungPanel({ game, isHost, nicknameOf, onStart, onQuit }: Props) {
  const { view } = game;
  const remainingSec = useRemainingSec(view.endsAt);

  if (view.phase !== 'playing') {
    return (
      <section className="game" aria-label="초성 퀴즈">
        <GameLobby
          view={view}
          isHost={isHost}
          nicknameOf={nicknameOf}
          description="분류와 초성을 보고 가장 먼저 단어를 맞혀요"
          onStart={onStart}
          onQuit={onQuit}
          rules={
            <>
              <div className="rule-row">
                <dt>문제</dt>
                <dd>{view.totalRounds}문제 · 채팅으로 정답을 입력해요</dd>
              </div>
              <div className="rule-row">
                <dt>시간</dt>
                <dd>
                  문제마다 {CHOSUNG_RULES.roundMs / 1000}초 · {CHOSUNG_RULES.hintAtRemainingMs / 1000}초 남으면 첫 글자
                  힌트
                </dd>
              </div>
              <div className="rule-row">
                <dt>점수</dt>
                <dd>
                  가장 먼저 맞힌 사람 {CHOSUNG_RULES.points}점 + 빠를수록 최대 {CHOSUNG_RULES.speedBonusMax}점
                </dd>
              </div>
            </>
          }
        />
      </section>
    );
  }

  const [category, initials] = (view.prompt ?? ' · ').split(' · ');
  const winner = view.guessedIds[0];

  return (
    <section className="game" aria-label="초성 퀴즈">
      <header className="game-head">
        <h2 className="game-title">초성 퀴즈</h2>
        <span className="game-round">
          {view.round} / {view.totalRounds} 문제
        </span>
        {!view.revealing && (
          <span className={`game-timer${remainingSec <= 5 ? ' is-urgent' : ''}`}>남은 시간 {remainingSec}초</span>
        )}
      </header>
      <div className="quiz-card" aria-live="polite">
        <span className="quiz-category">{category}</span>
        {view.revealing ? (
          <>
            <strong className="quiz-answer">{view.answer}</strong>
            <span className="quiz-result">{winner ? `${nicknameOf(winner)}님이 맞혔어요!` : '아무도 못 맞혔어요'}</span>
          </>
        ) : (
          <>
            <strong className="quiz-initials">{initials}</strong>
            <span className="quiz-result">채팅으로 정답을 입력해요</span>
          </>
        )}
      </div>
      <Scoreboard view={view} nicknameOf={nicknameOf} />
    </section>
  );
}
