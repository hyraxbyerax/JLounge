import { signOut } from '../../shared/api/session';
import { LoginPage } from '../../shared/auth/LoginPage';
import { useMember } from '../../shared/auth/useMember';
import { useFriends } from '../lounge/friends/useFriends';
import { FriendsPanel } from './planner/FriendsPanel';
import { PlannerPage } from './planner/PlannerPage';
import './planner.css';

/**
 * 캠퍼스 플래너 입구. 로그인한 회원이면 팀원이 만든 플래너를 그대로 열고,
 * 게스트면 사이트 공용 로그인 화면을 보여준다 (로그인하면 바로 플래너로 바뀐다).
 * 오른쪽 "친구 접속 현황"은 라운지 친구 기능과 연결한다.
 */
export function PlannerApp({ onBack }: { onBack: () => void }) {
  const member = useMember();
  const { overview } = useFriends();

  if (!member) return <LoginPage lead="캠퍼스 플래너는 로그인한 학생만 쓸 수 있어요" onBack={onBack} />;

  // 접속 중인 친구가 위로 오게
  const friends = (overview?.friends ?? [])
    .map((f) => ({ id: f.userId, nickname: f.nickname, status: f.presence.online ? 'online' : 'offline' }) as const)
    .sort((a, b) => Number(b.status === 'online') - Number(a.status === 'online'));

  return (
    <div className="campus-planner">
      <PlannerPage
        key={member.userId}
        user={{ id: member.userId, email: member.email ?? '', nickname: member.nickname }}
        onLogout={signOut}
        onBack={onBack}
        sidebar={
          <FriendsPanel
            friends={friends}
            emptyText={
              overview ? '아직 친구가 없어요. 라운지에서 친구를 추가해보세요.' : '친구 목록을 불러오는 중이에요…'
            }
          />
        }
      />
    </div>
  );
}
