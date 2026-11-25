/*
 * 캐치마인드 제시어. 방장이 게임 시작 전에 주제를 고른다 (기본: 전체).
 * 그림으로 설명할 수 있는 2~6글자 단어만 넣는다. 연습 상대가 그릴 수 있는 단어(BOT_DRAWINGS)도 모두 어느 주제엔가 들어 있어야 한다.
 */
import { BOT_DRAWINGS } from './botDrawings.ts';

export const WORD_TOPICS = ['all', 'animal', 'food', 'thing', 'nature', 'move', 'campus'] as const;
export type WordTopic = (typeof WORD_TOPICS)[number];

export const TOPIC_LABEL: Record<WordTopic, string> = {
  all: '전체',
  animal: '동물',
  food: '음식',
  thing: '물건',
  nature: '자연·장소',
  move: '탈것·운동',
  campus: '캠퍼스',
};

// prettier-ignore
export const WORDS_BY_TOPIC: Record<Exclude<WordTopic, 'all'>, readonly string[]> = {
  animal: [
    '고양이', '강아지', '기린', '토끼', '거북이', '물고기', '코끼리', '사자', '호랑이', '원숭이',
    '펭귄', '돼지', '소', '말', '닭', '오리', '개구리', '뱀', '곰', '판다',
    '여우', '다람쥐', '고슴도치', '부엉이', '나비', '벌', '달팽이', '문어', '상어', '고래', '공룡',
  ],
  food: [
    '사과', '피자', '햄버거', '바나나', '수박', '라면', '김밥', '떡볶이', '치킨', '아이스크림',
    '케이크', '도넛', '핫도그', '초밥', '만두', '포도', '딸기', '당근', '옥수수', '계란후라이',
    '빵', '쿠키', '사탕', '팝콘', '커피', '우유', '주먹밥', '붕어빵', '파인애플', '체리',
  ],
  thing: [
    '우산', '하트', '컵', '안경', '시계', '연필', '책', '노트북', '가위', '열쇠',
    '모자', '신발', '양말', '가방', '휴대폰', '전구', '의자', '침대', '거울', '칫솔',
    '선풍기', '텔레비전', '카메라', '기타', '피아노', '풍선', '선물', '왕관', '리모컨', '헤드폰',
  ],
  nature: [
    '집', '해', '나무', '별', '눈사람', '꽃', '달', '산', '무지개', '구름',
    '바다', '섬', '화산', '폭포', '번개', '비', '눈', '선인장', '버섯', '해바라기',
    '단풍잎', '성', '등대', '텐트', '피라미드',
  ],
  move: [
    '자동차', '비행기', '기차', '자전거', '로켓', '배', '버스', '헬리콥터', '오토바이', '잠수함',
    '소방차', '트럭', '열기구', '스케이트보드', '축구', '농구', '야구', '볼링', '수영', '스키',
    '태권도', '줄넘기', '낚시', '탁구', '배드민턴',
  ],
  campus: [
    '도서관', '학식', '과제', '시험', '기숙사', '강의실', '칠판', '교수님', '출석', '시간표',
    '학생증', '동아리', '축제', '졸업', '학사모', '노트', '형광펜', '계산기', '엠티', '셔틀버스',
    '자판기', '편의점', '카페', '벚꽃', '잔디밭', '조별과제', '장학금', '밤샘', '중간고사', '기말고사', '수강신청',
  ],
};

/** 모든 제시어 (중복 없이) */
export const WORDS: readonly string[] = [...new Set(Object.values(WORDS_BY_TOPIC).flat())];

/** 연습 상대가 그릴 수 있는 단어 (미리 그려 둔 그림이 있는 것) */
export const BOT_WORDS: readonly string[] = Object.keys(BOT_DRAWINGS);

export function wordsFor(topic: WordTopic): readonly string[] {
  return topic === 'all' ? WORDS : WORDS_BY_TOPIC[topic];
}

/** 연습 상대가 그릴 단어: 주제에 맞는 그림이 있으면 그중에서, 없으면(예: 캠퍼스) 그릴 수 있는 아무 단어 */
export function botWordsFor(topic: WordTopic): readonly string[] {
  const pool = wordsFor(topic);
  const fit = BOT_WORDS.filter((w) => pool.includes(w));
  return fit.length > 0 ? fit : BOT_WORDS;
}

export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T {
  return items[Math.floor(random() * items.length)]!;
}

/** 아직 안 쓴 단어 중 하나. 다 썼으면 아무거나 */
export function pickUnused(
  pool: readonly string[],
  used: readonly string[],
  random: () => number = Math.random,
): string {
  const fresh = pool.filter((w) => !used.includes(w));
  return pickRandom(fresh.length > 0 ? fresh : pool, random);
}
