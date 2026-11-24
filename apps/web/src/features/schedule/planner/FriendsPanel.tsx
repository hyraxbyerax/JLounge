export type PresenceStatus = 'online' | 'offline' | 'busy';

export interface FriendPresence {
  id: string;
  nickname: string;
  status: PresenceStatus;
}

const STATUS_LABEL: Record<PresenceStatus, string> = { online: '접속 중', offline: '오프라인', busy: '방해 금지' };

/**
 * 오른쪽 접속 현황 패널 (UX 스케치의 "서브 기능: 접속 여부 확인").
 * 친구·접속 상태는 라운지 파트(ElastiCache)의 몫이라 이 패널은 표시만 한다.
 * 라운지가 준비되면 friends 를 넘겨 주거나, PlannerPage 의 sidebar 슬롯에 라운지 컴포넌트를 통째로 넣으면 된다.
 */
export function FriendsPanel({ friends }: { friends?: FriendPresence[] }) {
  return (
    <section className="friends" aria-label="친구 접속 현황">
      <h2>친구</h2>
      {friends && friends.length > 0 ? (
        <ul className="friend-list">
          {friends.map((f) => (
            <li key={f.id}>
              <span className="avatar" aria-hidden="true">
                {f.nickname.slice(0, 1)}
                <i className={`presence ${f.status}`} />
              </span>
              <span className="friend-name">{f.nickname}</span>
              <span className="muted small">{STATUS_LABEL[f.status]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">친구 접속 현황은 라운지 기능과 연결되면 이곳에 표시됩니다.</p>
      )}
      <ul className="legend small muted">
        {(Object.keys(STATUS_LABEL) as PresenceStatus[]).map((s) => (
          <li key={s}>
            <i className={`presence inline ${s}`} /> {STATUS_LABEL[s]}
          </li>
        ))}
      </ul>
    </section>
  );
}
