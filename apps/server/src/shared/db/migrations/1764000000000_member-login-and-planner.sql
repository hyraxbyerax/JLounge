-- Up Migration
-- 이메일 로그인(회원)과 캠퍼스 플래너(일정·시간표). 캠퍼스 플래너 001_init.sql 을 공용 users 에 맞춰 옮겼다.

-- 회원 정보. 게스트는 DB에 없고, 예전 닉네임 개발용 로그인 사용자는 email 이 비어 있다
alter table users
  add column email text,
  add column password_hash text,
  -- 나중에 Cognito 로 바꾸면 Cognito sub 를 채운다
  add column auth_sub text unique,
  add column updated_at timestamptz not null default now();

create unique index users_email_key on users (lower(email));

-- 과제·시험 일정. 시각은 전부 timestamptz (UTC)
create table schedules (
  id integer generated always as identity primary key,
  user_id text not null references users (user_id) on delete cascade,
  subject text not null,
  type text not null check (type in ('assignment', 'exam')),
  title text not null,
  due_at timestamptz not null,
  memo text not null default '',
  is_done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedules_title_not_blank check (length(btrim(title)) > 0),
  constraint schedules_subject_not_blank check (length(btrim(subject)) > 0)
);

create index schedules_user_due_idx on schedules (user_id, due_at);

-- 시간표: 매주 반복되는 수업. "월요일 09:00" 은 특정 순간이 아니라 학교(한국) 달력 기준 시각이라
-- timestamptz 가 아니라 요일 + time 으로 저장한다
create table timetable_entries (
  id integer generated always as identity primary key,
  user_id text not null references users (user_id) on delete cascade,
  course_name text not null,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1=월 ... 7=일
  start_time time not null,
  end_time time not null,
  location text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timetable_time_order check (end_time > start_time),
  constraint timetable_course_not_blank check (length(btrim(course_name)) > 0)
);

create index timetable_user_idx on timetable_entries (user_id, weekday, start_time);

-- Down Migration
drop table timetable_entries;
drop table schedules;
drop index users_email_key;
alter table users
  drop column email,
  drop column password_hash,
  drop column auth_sub,
  drop column updated_at;
