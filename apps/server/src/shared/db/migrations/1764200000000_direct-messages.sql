-- Up Migration
-- 친구끼리 1:1 대화 (라운지 친구 현황판). 친구일 때만 보낼 수 있다 (서버가 확인)
create table direct_messages (
  id bigint generated always as identity primary key,
  sender_id text not null references users (user_id) on delete cascade,
  receiver_id text not null references users (user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  -- 받은 사람이 대화를 열어 읽은 시각 (안 읽음 표시용)
  read_at timestamptz,
  constraint direct_messages_not_self check (sender_id <> receiver_id)
);

-- 두 사람 대화를 최근 것부터 (순서와 상관없이 같은 쌍)
create index direct_messages_pair_idx
  on direct_messages (least(sender_id, receiver_id), greatest(sender_id, receiver_id), id desc);
-- 안 읽은 메시지 세기
create index direct_messages_unread_idx on direct_messages (receiver_id, sender_id) where read_at is null;

-- Down Migration
drop table direct_messages;
