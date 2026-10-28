/*
 * 연습 상대(가상 사람). 혼자서도 채팅·캐치마인드를 해볼 수 있게 방에 함께 들어온다.
 * 서버를 붙여 실제 사람이 들어오게 되면 뺄 수 있다.
 */
import { pickRandom } from '../game/catchmind/words';

export const BOT = { id: 'bot', nickname: '새벽코딩' } as const;

export const BOT_LINES = {
  greet: '안녕하세요! 심심한데 캐치마인드 한 판 할래요?',
  welcomeBack: '다시 오셨네요! 방 지키고 있었어요. 방장 넘겨드릴게요',
  gameSelected: '좋아요! 시작하기 누르면 바로 해요',
  myTurn: '제가 그려볼게요! 맞혀보세요',
  yourTurnEmpty: '뭘 그리실지 궁금해요 👀',
  someoneGotIt: '정답! 👏',
  nobodyGotIt: '아 이거 어려웠네요 ㅎㅎ',
  won: '제가 이겼네요 ㅎㅎ 한 판 더?',
  lost: '와 잘하시네요! 한 판 더 해요',
  tie: '비겼어요! 한 판 더 해요',
} as const;

const SMALL_TALK = ['ㅋㅋㅋ', '오 그렇군요', '저도요!', '공강 최고예요', '맞아요 ㅎㅎ', '음악 좋네요 🎵'];

/** 내 채팅에 대한 반응. 반응하지 않으면 null */
export function botReply(text: string, random: () => number = Math.random): string | null {
  if (/안녕|하이|ㅎㅇ/.test(text)) return '안녕하세요 😊';
  if (/게임|캐치|한\s*판/.test(text)) return '좋아요! 위에 [게임] 눌러서 캐치마인드 골라주세요';
  if (/노래|음악|곡/.test(text)) return '아래 [곡 신청]으로 같이 들어요!';
  return random() < 0.35 ? pickRandom(SMALL_TALK, random) : null;
}

/** 엉뚱한 오답 (정답이 아닌 단어) */
export function botWrongGuess(answer: string, pool: readonly string[], random: () => number = Math.random): string {
  const candidates = pool.filter((w) => w !== answer);
  const word = pickRandom(candidates, random);
  return random() < 0.3 ? `${word}?` : word;
}

/** 내가 그리는 동안 시간이 지날수록 맞힐 확률이 오른다 */
export function botGuessChance(elapsedMs: number, roundMs: number): number {
  return Math.min(0.85, 0.08 + (elapsedMs / roundMs) * 0.9);
}
