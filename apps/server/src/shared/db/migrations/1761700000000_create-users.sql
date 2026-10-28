-- Up Migration
-- 라운지·스케줄러가 함께 쓰는 사용자 테이블
create table users (
  user_id text primary key,
  nickname text not null,
  friend_code text not null unique,
  presence_visibility text not null default 'all'
    check (presence_visibility in ('all', 'online', 'hidden')),
  created_at timestamptz not null default now()
);

create index users_nickname_idx on users (nickname);

-- Down Migration
drop table users;
