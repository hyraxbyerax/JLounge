/*
 * 친구끼리 1:1 대화 (PostgreSQL direct_messages). 보내기 전에 친구인지는 friendsRoutes 가 확인한다.
 */
import { DM_PAGE_SIZE, type DirectMessage } from '@lounge/shared';
import type { Queryable } from '../../../shared/db/pool.ts';

type Row = { id: string; sender_id: string; receiver_id: string; body: string; created_at: Date };

const toMessage = (r: Row): DirectMessage => ({
  id: String(r.id),
  from: r.sender_id,
  to: r.receiver_id,
  text: r.body,
  at: r.created_at.toISOString(),
});

export async function send(db: Queryable, from: string, to: string, text: string): Promise<DirectMessage> {
  const { rows } = await db.query<Row>(
    `insert into direct_messages (sender_id, receiver_id, body) values ($1, $2, $3)
     returning id, sender_id, receiver_id, body, created_at`,
    [from, to, text],
  );
  return toMessage(rows[0]!);
}

/** 두 사람의 대화. 오래된 것 → 최근 것 순서로, beforeId 보다 앞의 것 최대 DM_PAGE_SIZE 개 */
export async function history(db: Queryable, me: string, other: string, beforeId?: string): Promise<DirectMessage[]> {
  const { rows } = await db.query<Row>(
    `select id, sender_id, receiver_id, body, created_at from direct_messages
      where least(sender_id, receiver_id) = least($1::text, $2::text)
        and greatest(sender_id, receiver_id) = greatest($1::text, $2::text)
        and ($3::bigint is null or id < $3::bigint)
      order by id desc
      limit $4`,
    [me, other, beforeId ?? null, DM_PAGE_SIZE],
  );
  return rows.reverse().map(toMessage);
}

/** other 가 나에게 보낸 메시지를 모두 읽음으로 */
export async function markRead(db: Queryable, me: string, other: string): Promise<void> {
  await db.query(
    `update direct_messages set read_at = now() where receiver_id = $1 and sender_id = $2 and read_at is null`,
    [me, other],
  );
}

/** 보낸 사람별 안 읽은 메시지 수 */
export async function unreadCounts(db: Queryable, me: string): Promise<Map<string, number>> {
  const { rows } = await db.query<{ sender_id: string; n: string }>(
    `select sender_id, count(*) as n from direct_messages where receiver_id = $1 and read_at is null group by sender_id`,
    [me],
  );
  return new Map(rows.map((r) => [r.sender_id, Number(r.n)]));
}
