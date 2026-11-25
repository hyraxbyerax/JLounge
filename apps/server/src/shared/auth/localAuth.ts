import { randomBytes, randomInt } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { AuthProvider, AuthUser, TokenIssuer } from './AuthProvider.ts';

const ISSUER = 'jbnu-lounge';
/** 게스트는 접속이 끝나면 사라지므로 짧게, 회원은 새로고침·재방문에도 로그인이 유지되게 길게 */
const GUEST_TOKEN_TTL = '12h';
/** 게스트 이름을 잡아 두는 시간 = 게스트 토큰이 살아 있는 시간 (그동안 같은 이름이 또 나오지 않게) */
export const GUEST_TOKEN_TTL_SEC = 12 * 60 * 60;
const MEMBER_TOKEN_TTL = '7d';

/** 서버가 HS256으로 서명한 JWT. 게스트와 이메일 로그인 회원용 (나중에 회원은 Cognito 토큰으로 바뀐다) */
export function createLocalAuth(secret: string): AuthProvider & TokenIssuer {
  const key = new TextEncoder().encode(secret);

  return {
    async issue(user) {
      return new SignJWT({ nickname: user.nickname, guest: user.isGuest })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(ISSUER)
        .setSubject(user.userId)
        .setIssuedAt()
        .setExpirationTime(user.isGuest ? GUEST_TOKEN_TTL : MEMBER_TOKEN_TTL)
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

/** 게스트 이름 모양: Guest + 다섯 자리 숫자 (2026-11-25 사용자 결정). 회원은 이 모양의 닉네임을 쓸 수 없다 */
export const GUEST_NAME = /^guest\d{5}$/i;

/** Guest00000 ~ Guest99999 중 무작위 하나 */
export function randomGuestName(): string {
  return `Guest${String(randomInt(0, 100_000)).padStart(5, '0')}`;
}

/** 게스트: guest_ + 무작위 문자열. 이름은 서버가 정해서 넘긴다 (겹치지 않게 guestNames 로 확인한 것) */
export function createGuest(nickname: string = randomGuestName()): AuthUser {
  return {
    userId: `guest_${randomBytes(9).toString('base64url')}`,
    nickname,
    isGuest: true,
  };
}
