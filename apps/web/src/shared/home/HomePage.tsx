import { signOut } from '../api/session';
import { useMember } from '../auth/useMember';
import { CalendarIcon, DoorIcon } from './HomeIcons';
import './home.css';

type Props = {
  onLounge: () => void;
  onSchedule: () => void;
  onLogin: () => void;
  /** 친구 창 (좁은 화면에서만. 넓은 화면은 오른쪽 친구 현황판이 늘 보인다) */
  onFriends?: () => void;
};

/** 사이트 첫 화면: JLounge 간판 + 큰 버튼 두 개 (문: 라운지 / 달력: 캠퍼스 플래너) + 오른쪽 위 로그인 */
export function HomePage({ onLounge, onSchedule, onLogin, onFriends }: Props) {
  const member = useMember();

  return (
    <div className="home soft-light">
      <div className="home-account">
        {member ? (
          <>
            <span className="home-account-name">{member.nickname}님</span>
            {onFriends && (
              <button type="button" className="btn btn-ghost" onClick={onFriends}>
                친구
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={signOut}>
              로그아웃
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onLogin}>
            로그인
          </button>
        )}
      </div>

      <h1 className="home-title jlounge-logo">
        JLounge
        <span className="sr-only"> 전북대학교 휴식 라운지</span>
      </h1>

      <div className="home-choices">
        <button type="button" className="home-choice" onClick={onLounge}>
          <DoorIcon />
          <span className="home-choice-label">방 만들기·들어가기</span>
        </button>
        <button type="button" className="home-choice" onClick={onSchedule}>
          <CalendarIcon />
          <span className="home-choice-label">캠퍼스 플래너</span>
        </button>
      </div>
    </div>
  );
}
