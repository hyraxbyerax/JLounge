import { signOut } from '../api/session';
import { useMember } from '../auth/useMember';
import { LockIcon } from '../ui/icons';
import './home.css';

type Props = {
  onLounge: () => void;
  onSchedule: () => void;
  onLogin: () => void;
};

/** 사이트 첫 화면: 건물의 두 입구 (라운지 / 캠퍼스 플래너) + 오른쪽 위 로그인 */
export function HomePage({ onLounge, onSchedule, onLogin }: Props) {
  const member = useMember();

  return (
    <div className="home soft-light">
      <div className="home-account">
        {member ? (
          <>
            <span className="home-account-name">{member.nickname}님</span>
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

      <h1 className="home-title sign">전북대학교 휴식 라운지</h1>
      <p className="home-sub">공강 시간, 불 켜진 방에 잠깐 들러요</p>

      <div className="home-building">
        <button type="button" className="entrance is-lounge" onClick={onLounge}>
          <span className="entrance-door" aria-hidden="true" />
          <span className="entrance-label">방 만들기·들어가기</span>
          <span className="entrance-hint">로그인 없이 바로 들어가요</span>
        </button>
        <button type="button" className={`entrance is-schedule${member ? ' is-open' : ''}`} onClick={onSchedule}>
          <span className="entrance-door" aria-hidden="true">
            {!member && <LockIcon className="entrance-lock" />}
          </span>
          <span className="entrance-label">캠퍼스 플래너</span>
          <span className="entrance-hint">{member ? '내 일정과 시간표' : '로그인이 필요해요'}</span>
        </button>
      </div>
    </div>
  );
}
