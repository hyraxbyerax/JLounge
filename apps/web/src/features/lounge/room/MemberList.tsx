import { useState } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import type { Member } from '../model/room';

type Props = {
  members: Member[];
  meId: string;
  /** 방장이면 다른 사람 옆에 [방장 넘기기] [내보내기]가 보인다 */
  isHost: boolean;
  onTransfer: (member: Member) => void;
  onKick: (member: Member) => void;
  /** 이 사람에게 [친구 요청]을 보여줄지 (회원끼리만) */
  canRequestFriend?: (member: Member) => boolean;
  onRequestFriend?: (member: Member) => void;
};

type Confirm = { action: 'transfer' | 'kick'; member: Member } | null;

export function MemberList({ members, meId, isHost, onTransfer, onKick, canRequestFriend, onRequestFriend }: Props) {
  const [confirm, setConfirm] = useState<Confirm>(null);

  return (
    <>
      <ul className="member-list">
        {members.map((m) => (
          <li key={m.id} className="member">
            {m.isHost && (
              <span role="img" aria-label="방장">
                👑
              </span>
            )}
            <span className="member-name">
              {m.nickname}
              {m.id === meId && <span className="muted"> (나)</span>}
              {m.isBot && <span className="muted"> · 연습 상대</span>}
            </span>
            {m.isFriend && (
              <span className="friend-tag">
                <span className="online-dot" aria-hidden="true" />
                친구
              </span>
            )}
            {m.id !== meId && onRequestFriend && canRequestFriend?.(m) && (
              <button type="button" className="btn-text" onClick={() => onRequestFriend(m)}>
                친구 요청
              </button>
            )}
            {isHost && m.id !== meId && (
              <span className="member-actions">
                {!m.isBot && (
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => setConfirm({ action: 'transfer', member: m })}
                  >
                    방장 넘기기
                  </button>
                )}
                <button type="button" className="btn-text" onClick={() => setConfirm({ action: 'kick', member: m })}>
                  내보내기
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {confirm && (
        <Modal title={confirm.action === 'kick' ? '내보내기' : '방장 넘기기'} onClose={() => setConfirm(null)}>
          <p>
            {confirm.action === 'transfer'
              ? `${confirm.member.nickname}님에게 방장을 넘길까요?`
              : confirm.member.isBot
                ? `${confirm.member.nickname}님을 내보낼까요?`
                : `${confirm.member.nickname}님을 내보낼까요? 다시 들어올 수 없어요`}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (confirm.action === 'kick') onKick(confirm.member);
                else onTransfer(confirm.member);
                setConfirm(null);
              }}
            >
              {confirm.action === 'kick' ? '내보내기' : '넘기기'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
