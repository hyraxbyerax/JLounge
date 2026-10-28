/*
 * 인증은 이 인터페이스 뒤에 숨긴다.
 * 지금은 서버가 직접 서명한 JWT(localAuth.ts)를 쓰고, 나중에 Cognito 구현을 추가해 바꾼다.
 * 사용자 ID는 문자열이다 (게스트: guest_..., 나중에 로그인 사용자: Cognito sub).
 */

export type AuthUser = {
  userId: string;
  nickname: string;
  isGuest: boolean;
};

export interface AuthProvider {
  /** 토큰이 올바르면 사용자, 아니면 null */
  verify(token: string): Promise<AuthUser | null>;
}

/** 서버가 직접 토큰을 발급할 수 있는 구현 (게스트 토큰은 Cognito로 바꿔도 서버가 발급한다) */
export interface TokenIssuer {
  issue(user: AuthUser): Promise<string>;
}
