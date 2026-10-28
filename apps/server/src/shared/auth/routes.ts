import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../http/errors.ts';
import type { AuthUser, TokenIssuer } from './AuthProvider.ts';
import { createGuest } from './localAuth.ts';

const loginBody = z.object({
  nickname: z.string().trim().min(1, '닉네임을 입력해주세요').max(20, '닉네임은 20자까지예요'),
});

const FRIEND_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const friendCode = () => Array.from(randomBytes(8), (b) => FRIEND_CODE_CHARS[b % FRIEND_CODE_CHARS.length]).join('');

/**
 * 공통 사용자 API (/api/users/*).
 * - POST /guest: 게스트 토큰 발급 (로그인 없이 라운지 이용)
 * - POST /login: 로컬 개발용 간단 로그인 (닉네임만). Cognito로 바꾸면 없어진다
 */
export function usersRouter(issuer: TokenIssuer, db: Pool): Router {
  const router = Router();

  router.post('/guest', async (_req, res) => {
    const user = createGuest();
    res.status(201).json({ data: { token: await issuer.issue(user), user } });
  });

  router.post('/login', async (req, res) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) throw new AppError('BAD_REQUEST', parsed.error.issues[0]!.message);
    const { nickname } = parsed.data;

    const found = await db.query<{ user_id: string; nickname: string }>(
      'select user_id, nickname from users where nickname = $1 order by created_at limit 1',
      [nickname],
    );
    const row =
      found.rows[0] ??
      (
        await db.query<{ user_id: string; nickname: string }>(
          'insert into users (user_id, nickname, friend_code) values ($1, $2, $3) returning user_id, nickname',
          [`local_${randomBytes(9).toString('base64url')}`, nickname, friendCode()],
        )
      ).rows[0]!;

    const user: AuthUser = { userId: row.user_id, nickname: row.nickname, isGuest: false };
    res.json({ data: { token: await issuer.issue(user), user } });
  });

  return router;
}
