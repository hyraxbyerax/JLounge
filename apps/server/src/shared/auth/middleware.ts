import type { RequestHandler, Response } from 'express';
import { errorBody } from '../http/errors.ts';
import type { AuthProvider, AuthUser } from './AuthProvider.ts';

/** Authorization: Bearer {토큰} 을 확인해 res.locals.user 에 넣는다. 없거나 틀리면 401 */
export function requireAuth(auth: AuthProvider): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const user = token ? await auth.verify(token) : null;
    if (!user) {
      res.status(401).json(errorBody('UNAUTHORIZED', '다시 접속해주세요'));
      return;
    }
    res.locals.user = user;
    next();
  };
}

export function currentUser(res: Response): AuthUser {
  return res.locals.user as AuthUser;
}

/** requireAuth 뒤에 둔다. 게스트는 막고 로그인한 회원만 통과 (캠퍼스 플래너 등) */
export const requireMember: RequestHandler = (_req, res, next) => {
  if (currentUser(res).isGuest) {
    res.status(403).json(errorBody('LOGIN_REQUIRED', '로그인한 학생만 쓸 수 있어요'));
    return;
  }
  next();
};
