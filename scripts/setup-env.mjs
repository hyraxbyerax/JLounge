// npm install 이 끝나면 자동으로 실행된다 (package.json 의 postinstall).
// .env 가 없으면 .env.example(내 컴퓨터용 기본값)을 복사해 만든다. 이미 있으면 건드리지 않는다.
import { copyFileSync, existsSync } from 'node:fs';

if (existsSync('.env.example') && !existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('\n.env 를 만들었어요 (.env.example 의 기본값). 유튜브 검색을 쓰려면 YOUTUBE_API_KEY 만 채우면 돼요.\n');
}
