/*
 * 연습 상대(가상 사람) "새벽코딩". 방장이 부르면 서버 쪽 참가자로 들어와 채팅에 가끔 대답한다.
 */

export const BOT = { id: 'bot', nickname: '새벽코딩' } as const;

export const BOT_LINES = {
  greet: '안녕하세요! 심심한데 캐치마인드 한 판 할래요?',
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

/** 사람의 채팅에 대한 반응. 반응하지 않으면 null */
export function botReply(text: string, random: () => number = Math.random): string | null {
  if (/안녕|하이|ㅎㅇ/.test(text)) return '안녕하세요 😊';
  if (/게임|캐치|한\s*판/.test(text)) return '좋아요! 방장님이 위에 [게임] 눌러서 캐치마인드 골라주세요';
  if (/노래|음악|곡/.test(text)) return '아래 [곡 신청]으로 같이 들어요!';
  return random() < 0.35 ? SMALL_TALK[Math.floor(random() * SMALL_TALK.length)]! : null;
}
