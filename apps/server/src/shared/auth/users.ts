/*
 * 회원(이메일로 가입한 사용자) 조회·생성. 게스트는 DB에 없다.
 * 나중에 Cognito로 바꾸면 auth_sub 로 찾고, 처음 온 사용자는 첫 요청 때 행을 만든다.
 */
import { randomBytes } from 'node:crypto';
import type { Queryable } from '../db/pool.ts';

export type PresenceVisibility = 'all' | 'online' | 'hidden';

export type MemberRow = {
  user_id: string;
  email: string | null;
  nickname: string;
  password_hash: string | null;
  friend_code: string;
  presence_visibility: PresenceVisibility;
};

/** 화면에 내려주는 회원 정보 (세션 사용자 + 이메일, 친구 코드, 활동 상태 공개 범위) */
export type MemberDto = {
  userId: string;
  nickname: string;
  isGuest: false;
  email: string | null;
  friendCode: string;
  presenceVisibility: PresenceVisibility;
};

export const toMemberDto = (row: MemberRow): MemberDto => ({
  userId: row.user_id,
  nickname: row.nickname,
  isGuest: false,
  email: row.email,
  friendCode: row.friend_code,
  presenceVisibility: row.presence_visibility,
});

const COLUMNS = 'user_id, email, nickname, password_hash, friend_code, presence_visibility';

const FRIEND_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newFriendCode = () =>
  Array.from(randomBytes(8), (b) => FRIEND_CODE_CHARS[b % FRIEND_CODE_CHARS.length]).join('');

export async function findMemberById(db: Queryable, userId: string): Promise<MemberRow | null> {
  const { rows } = await db.query<MemberRow>(`select ${COLUMNS} from users where user_id = $1`, [userId]);
  return rows[0] ?? null;
}

export async function findMemberByEmail(db: Queryable, email: string): Promise<MemberRow | null> {
  const { rows } = await db.query<MemberRow>(`select ${COLUMNS} from users where lower(email) = lower($1)`, [email]);
  return rows[0] ?? null;
}

export async function setPresenceVisibility(db: Queryable, userId: string, visibility: PresenceVisibility) {
  const { rows } = await db.query<MemberRow>(
    `update users set presence_visibility = $2, updated_at = now() where user_id = $1 returning ${COLUMNS}`,
    [userId, visibility],
  );
  return rows[0] ?? null;
}

/** 이메일이 이미 있으면 PostgreSQL unique_violation(23505, users_email_key) 오류가 그대로 올라간다 */
export async function createMember(
  db: Queryable,
  input: { email: string; nickname: string; passwordHash: string },
): Promise<MemberRow> {
  const { rows } = await db.query<MemberRow>(
    `insert into users (user_id, email, nickname, password_hash, friend_code) values ($1, $2, $3, $4, $5)
     returning ${COLUMNS}`,
    [`local_${randomBytes(9).toString('base64url')}`, input.email, input.nickname, input.passwordHash, newFriendCode()],
  );
  return rows[0]!;
}
