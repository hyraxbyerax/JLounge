import { ME, type Member } from '../model/room';

export function MemberList({ members }: { members: Member[] }) {
  return (
    <ul className="member-list">
      {members.map((m) => (
        <li key={m.id} className="member">
          {m.isHost && (
            <span role="img" aria-label="방장">
              👑
            </span>
          )}
          <span>
            {m.nickname}
            {m.id === ME.id && <span className="muted"> (나)</span>}
            {m.isBot && <span className="muted"> · 연습 상대</span>}
          </span>
          {m.isFriend && (
            <span className="friend-tag">
              <span className="online-dot" aria-hidden="true" />
              친구
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
