/*
 * 친구 관계 (PostgreSQL friendships). 두 사람 사이에는 한 줄만 있다 (friendships_pair_key).
 *   pending: requester → addressee 요청 / accepted: 친구 / blocked: requester 가 addressee 를 차단
 */
import type { Pool, PoolClient } from 'pg';
import type { Queryable } from '../../../shared/db/pool.ts';

export type Relation = 'none' | 'friend' | 'outgoing' | 'incoming' | 'blocked' | 'blocked-by';

export type UserBrief = { userId: string; nickname: string };

type Row = { requester_id: string; addressee_id: string; status: 'pending' | 'accepted' | 'blocked' };

async function pairRow(db: Queryable, a: string, b: string): Promise<Row | null> {
  const { rows } = await db.query<Row>(
    `select requester_id, addressee_id, status from friendships
      where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)`,
    [a, b],
  );
  return rows[0] ?? null;
}

/** me 기준으로 본 other 와의 관계 */
export async function relation(db: Queryable, me: string, other: string): Promise<Relation> {
  const row = await pairRow(db, me, other);
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friend';
  const mine = row.requester_id === me;
  if (row.status === 'pending') return mine ? 'outgoing' : 'incoming';
  return mine ? 'blocked' : 'blocked-by';
}

export type RequestResult =
  'requested' | 'accepted' | 'already-friend' | 'already-requested' | 'blocked' | 'blocked-by';

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/** 친구 요청. 상대가 이미 나에게 요청했으면 바로 친구가 된다 */
export async function sendRequest(pool: Pool, me: string, other: string): Promise<RequestResult> {
  return inTransaction(pool, async (db) => {
    const row = await pairRow(db, me, other);
    if (!row) {
      await db.query(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'pending')`, [
        me,
        other,
      ]);
      return 'requested';
    }
    if (row.status === 'accepted') return 'already-friend';
    if (row.status === 'blocked') return row.requester_id === me ? 'blocked' : 'blocked-by';
    if (row.requester_id === me) return 'already-requested';
    await db.query(
      `update friendships set status = 'accepted', updated_at = now() where requester_id = $1 and addressee_id = $2`,
      [other, me],
    );
    return 'accepted';
  });
}

/** 받은 요청 수락. 요청이 없으면 false */
export async function accept(db: Queryable, me: string, other: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `update friendships set status = 'accepted', updated_at = now()
      where requester_id = $1 and addressee_id = $2 and status = 'pending'`,
    [other, me],
  );
  return (rowCount ?? 0) > 0;
}

/** 친구 끊기·요청 취소·거절 (차단은 그대로 둔다) */
export async function remove(db: Queryable, me: string, other: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `delete from friendships
      where status <> 'blocked'
        and ((requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1))`,
    [me, other],
  );
  return (rowCount ?? 0) > 0;
}

/** 차단: 친구·요청 관계를 지우고 내가 상대를 막는다 */
export async function block(pool: Pool, me: string, other: string): Promise<void> {
  await inTransaction(pool, async (db) => {
    await db.query(
      `delete from friendships
        where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)`,
      [me, other],
    );
    await db.query(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'blocked')`, [
      me,
      other,
    ]);
  });
}

export async function unblock(db: Queryable, me: string, other: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `delete from friendships where requester_id = $1 and addressee_id = $2 and status = 'blocked'`,
    [me, other],
  );
  return (rowCount ?? 0) > 0;
}

export type FriendLists = {
  friends: UserBrief[];
  incoming: UserBrief[];
  outgoing: UserBrief[];
  blocked: UserBrief[];
};

/** 내 친구·받은 요청·보낸 요청·차단 목록 (닉네임 가나다순) */
export async function lists(db: Queryable, me: string): Promise<FriendLists> {
  const { rows } = await db.query<Row & { other_id: string; nickname: string }>(
    `select f.requester_id, f.addressee_id, f.status, u.user_id as other_id, u.nickname
       from friendships f
       join users u on u.user_id = case when f.requester_id = $1 then f.addressee_id else f.requester_id end
      where f.requester_id = $1 or f.addressee_id = $1
      order by u.nickname`,
    [me],
  );
  const out: FriendLists = { friends: [], incoming: [], outgoing: [], blocked: [] };
  for (const row of rows) {
    const brief = { userId: row.other_id, nickname: row.nickname };
    const mine = row.requester_id === me;
    if (row.status === 'accepted') out.friends.push(brief);
    else if (row.status === 'pending') (mine ? out.outgoing : out.incoming).push(brief);
    else if (mine) out.blocked.push(brief); // 나를 차단한 사람은 보이지 않는다
  }
  return out;
}

export async function friendIds(db: Queryable, me: string): Promise<string[]> {
  const { rows } = await db.query<{ other_id: string }>(
    `select case when requester_id = $1 then addressee_id else requester_id end as other_id
       from friendships where status = 'accepted' and (requester_id = $1 or addressee_id = $1)`,
    [me],
  );
  return rows.map((r) => r.other_id);
}

/** 닉네임(여러 명일 수 있음) 또는 친구 코드로 회원 찾기 */
export async function findTargets(db: Queryable, by: { nickname?: string; friendCode?: string }): Promise<UserBrief[]> {
  const { rows } = by.friendCode
    ? await db.query<{ user_id: string; nickname: string }>(
        `select user_id, nickname from users where friend_code = $1 and email is not null`,
        [by.friendCode.toUpperCase()],
      )
    : await db.query<{ user_id: string; nickname: string }>(
        `select user_id, nickname from users where nickname = $1 and email is not null limit 5`,
        [by.nickname],
      );
  return rows.map((r) => ({ userId: r.user_id, nickname: r.nickname }));
}

export async function visibilities(db: Queryable, ids: string[]): Promise<Map<string, 'all' | 'online' | 'hidden'>> {
  if (ids.length === 0) return new Map();
  const { rows } = await db.query<{ user_id: string; presence_visibility: 'all' | 'online' | 'hidden' }>(
    `select user_id, presence_visibility from users where user_id = any($1::text[])`,
    [ids],
  );
  return new Map(rows.map((r) => [r.user_id, r.presence_visibility]));
}
