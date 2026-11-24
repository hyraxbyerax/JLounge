-- Up Migration
-- 친구 관계 (라운지 4단계). 두 사람 사이에는 한 줄만 둔다 (누가 먼저 보냈든)
--   pending: requester 가 addressee 에게 요청 / accepted: 친구 / blocked: requester 가 addressee 를 차단
create table friendships (
  requester_id text not null references users (user_id) on delete cascade,
  addressee_id text not null references users (user_id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  constraint friendships_not_self check (requester_id <> addressee_id)
);

create unique index friendships_pair_key
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on friendships (addressee_id);

-- Down Migration
drop table friendships;
