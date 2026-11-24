import { signOut } from '../../shared/api/session';
import { LoginPage } from '../../shared/auth/LoginPage';
import { useMember } from '../../shared/auth/useMember';
import { PlannerPage } from './planner/PlannerPage';
import './planner.css';

/**
 * 캠퍼스 플래너 입구. 로그인한 회원이면 팀원이 만든 플래너를 그대로 열고,
 * 게스트면 사이트 공용 로그인 화면을 보여준다 (로그인하면 바로 플래너로 바뀐다).
 */
export function PlannerApp({ onBack }: { onBack: () => void }) {
  const member = useMember();

  if (!member) return <LoginPage lead="캠퍼스 플래너는 로그인한 학생만 쓸 수 있어요" onBack={onBack} />;

  return (
    <div className="campus-planner">
      <PlannerPage
        key={member.userId}
        user={{ id: member.userId, email: member.email ?? '', nickname: member.nickname }}
        onLogout={signOut}
        onBack={onBack}
      />
    </div>
  );
}
