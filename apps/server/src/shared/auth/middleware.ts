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
