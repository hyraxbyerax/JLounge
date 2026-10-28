import { randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { AuthProvider, AuthUser, TokenIssuer } from './AuthProvider.ts';

const ISSUER = 'jbnu-lounge';
const TOKEN_TTL = '12h';

/** 서버가 HS256으로 서명한 JWT. 로컬 개발과 게스트용 */
export function createLocalAuth(secret: string): AuthProvider & TokenIssuer {
  const key = new TextEncoder().encode(secret);

  return {
    async issue(user) {
      return new SignJWT({ nickname: user.nickname, guest: user.isGuest })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(ISSUER)
        .setSubject(user.userId)
        .setIssuedAt()
        .setExpirationTime(TOKEN_TTL)
        .sign(key);
    },

    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ['HS256'] });
        if (typeof payload.sub !== 'string' || typeof payload.nickname !== 'string') return null;
        return { userId: payload.sub, nickname: payload.nickname, isGuest: payload.guest === true };
      } catch {
        return null;
      }
    },
  };
}

const ADJECTIVES = [
  '졸린',
  '배고픈',
  '신난',
  '조용한',
  '느긋한',
  '수줍은',
  '용감한',
  '공강 중인',
  '산책하는',
  '노래하는',
];
const ANIMALS = ['판다', '수달', '고양이', '펭귄', '다람쥐', '여우', '토끼', '부엉이', '고래', '곰'];

const pick = <T>(items: readonly T[]) => items[randomBytes(1)[0]! % items.length]!;

/** 게스트: guest_ + 무작위 문자열, 닉네임도 서버가 정한다 */
export function createGuest(): AuthUser {
  return {
    userId: `guest_${randomBytes(9).toString('base64url')}`,
    nickname: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`,
    isGuest: true,
  };
}
