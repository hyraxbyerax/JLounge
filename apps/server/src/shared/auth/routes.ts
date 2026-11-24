import { Router } from 'express';
import { z } from 'zod';
import type { Queryable } from '../db/pool.ts';
import { AppError } from '../http/errors.ts';
import { requiredText, validate } from '../http/validate.ts';
import type { AuthProvider, TokenIssuer } from './AuthProvider.ts';
import { createGuest } from './localAuth.ts';
import { currentUser, requireAuth } from './middleware.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { createMember, findMemberByEmail, findMemberById, toMemberDto } from './users.ts';

export const signupInput = z
  .object({
    email: z
      .string({ error: '이메일을 입력해주세요.' })
      .trim()
      .toLowerCase()
      .pipe(z.email('올바른 이메일 형식이 아닙니다.').max(254, '이메일이 너무 깁니다.')),
    password: z
      .string({ error: '비밀번호를 입력해주세요.' })
      .min(8, '비밀번호는 8자 이상이어야 합니다.')
      .max(128, '비밀번호는 128자 이하로 입력해주세요.'),
    nickname: requiredText('닉네임', 20),
  })
  .strict();

export const loginInput = z
  .object({
    email: z.string({ error: '이메일을 입력해주세요.' }).trim().toLowerCase().min(1, '이메일을 입력해주세요.'),
    password: z.string({ error: '비밀번호를 입력해주세요.' }).min(1, '비밀번호를 입력해주세요.'),
  })
  .strict();

// 없는 이메일로 로그인할 때도 해시 계산 시간을 비슷하게 맞추기 위한 더미 해시
const dummyHash = hashPassword('dummy-password-for-timing');

/**
 * 공통 사용자 API (/api/users/*).
 * - POST /guest: 게스트 토큰 발급 (로그인 없이 라운지 이용)
 * - POST /signup, /login: 이메일+비밀번호 회원. 나중에 Cognito로 바꾸면 브라우저가 Cognito와 직접 통신하고 이 둘은 없어진다
 * - GET /me: 지금 토큰의 사용자 (회원이면 DB에서 다시 읽는다)
 */
export function usersRouter(auth: AuthProvider & TokenIssuer, db: Queryable): Router {
  const router = Router();

  router.post('/guest', async (_req, res) => {
    const user = createGuest();
    res.status(201).json({ data: { token: await auth.issue(user), user } });
  });

  router.post('/signup', async (req, res) => {
    const input = validate(signupInput, req.body);
    let row;
    try {
      row = await createMember(db, {
        email: input.email,
        nickname: input.nickname,
        passwordHash: await hashPassword(input.password),
      });
    } catch (err) {
      if ((err as { constraint?: string }).constraint === 'users_email_key') {
        throw new AppError('EMAIL_TAKEN', '이미 가입된 이메일입니다.', 409, { email: '이미 가입된 이메일입니다.' });
      }
      throw err;
    }
    const user = toMemberDto(row);
    res.status(201).json({ data: { token: await auth.issue(user), user } });
  });

  router.post('/login', async (req, res) => {
    const input = validate(loginInput, req.body);
    const row = await findMemberByEmail(db, input.email);
    const ok = row?.password_hash
      ? await verifyPassword(input.password, row.password_hash)
      : (await verifyPassword(input.password, await dummyHash), false);
    if (!row || !ok) throw new AppError('BAD_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.', 401);
    const user = toMemberDto(row);
    res.json({ data: { token: await auth.issue(user), user } });
  });

  router.get('/me', requireAuth(auth), async (_req, res) => {
    const user = currentUser(res);
    if (user.isGuest) {
      res.json({ data: user });
      return;
    }
    const row = await findMemberById(db, user.userId);
    if (!row) throw new AppError('UNAUTHORIZED', '사용자를 찾을 수 없어요. 다시 로그인해주세요', 401);
    res.json({ data: toMemberDto(row) });
  });

  return router;
}
