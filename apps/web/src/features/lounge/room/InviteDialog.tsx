import type { FriendEntry } from '@lounge/shared';
import { useState } from 'react';
import { errorMessage } from '../../../shared/api/ApiError';
import { useMember } from '../../../shared/auth/useMember';
import { Modal } from '../../../shared/ui/Modal';
import { useFriends } from '../friends/useFriends';
import { inviteFriend } from '../net/loungeClient';
// 접속 점·이름 모양은 친구 현황판과 같다
import '../friends/friends-sidebar.css';

type Props = {
  roomCode: string;
  /** 방 코드를 글자로 보여줄지 (방장에게만) */
  showCode: boolean;
  /** 지금 방에 있는 사람 (이미 있는 친구는 초대 대신 "이 방에 있어요") */
  memberIds: ReadonlySet<string>;
  onClose: () => void;
};

type Sent = Record<string, 'sending' | 'sent'>;

/**
 * [초대] 창: 친구를 한 명씩 이 방에 초대하고, 아래 [링크 복사하기]로 초대 링크도 줄 수 있다.
 * 친구 초대는 접속 중인 친구에게만 간다 (받은 친구 화면 위에 "들어가기" 알림, 비밀번호 없이 입장).
 */
export function InviteDialog({ roomCode, showCode, memberIds, onClose }: Props) {
  const member = useMember();
  const { overview } = useFriends();
  const [sent, setSent] = useState<Sent>({});
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const link = `${window.location.origin}/room/${roomCode}`;

  async function invite(friend: FriendEntry) {
    setSent((s) => ({ ...s, [friend.userId]: 'sending' }));
    try {
      await inviteFriend(friend.userId);
      setSent((s) => ({ ...s, [friend.userId]: 'sent' }));
      setNote({ text: `${friend.nickname}님에게 초대를 보냈어요`, error: false });
    } catch (err) {
      setSent((s) => {
        const next = { ...s };
        delete next[friend.userId];
        return next;
      });
      setNote({ text: errorMessage(err), error: true });
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setNote({ text: '초대 링크를 복사했어요. 카톡 등으로 보내주세요', error: false });
    } catch {
      setNote({ text: `복사가 막혀 있어요. 이 주소를 보내주세요: ${link}`, error: false });
    }
  }

  // 지금 접속 중인 친구만 (초대는 접속 중인 친구에게만 갈 수 있다)
  const friends = (overview?.friends ?? []).filter((f) => f.presence.online);
  const hasFriends = (overview?.friends.length ?? 0) > 0;

  return (
    <Modal title="친구 초대" onClose={onClose}>
      <div className="invite-dialog">
        {!member ? (
          <p className="form-hint">로그인하면 친구 목록에서 바로 초대할 수 있어요. 지금은 아래 링크를 보내주세요.</p>
        ) : !overview ? (
          <p className="form-hint">친구 목록을 불러오는 중이에요…</p>
        ) : friends.length === 0 ? (
          <p className="form-hint">
            {hasFriends
              ? '지금 접속한 친구가 없어요. 아래 링크를 보내주세요.'
              : '아직 친구가 없어요. 오른쪽 친구 칸에서 친구를 추가하거나, 아래 링크를 보내주세요.'}
          </p>
        ) : (
          <ul className="invite-list" aria-label="지금 접속 중인 친구">
            {friends.map((f) => {
              const here = memberIds.has(f.userId);
              const state = sent[f.userId];
              return (
                <li key={f.userId} className="invite-item">
                  <span className="fs-dot is-online" aria-hidden="true" />
                  <span className="invite-who">
                    <span className="fs-name">{f.nickname}</span>
                    <span className="fs-status">
                      {here
                        ? '이 방에 있어요'
                        : f.presence.room
                          ? `${f.presence.room.name} · ${f.presence.activity ?? '접속 중'}`
                          : '접속 중'}
                    </span>
                  </span>
                  {!here && (
                    <button
                      type="button"
                      className={`btn ${state === 'sent' ? 'btn-ghost' : 'btn-primary'} invite-btn`}
                      disabled={state !== undefined}
                      onClick={() => void invite(f)}
                    >
                      {state === 'sent' ? '초대함 ✓' : state === 'sending' ? '보내는 중…' : '초대'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {note && (
          <p className={note.error ? 'form-error' : 'form-hint invite-note'} role="status">
            {note.text}
          </p>
        )}

        <div className="invite-link">
          <span className="form-hint">
            {showCode ? (
              <>
                친구가 아니어도 링크나 방 코드 <strong className="invite-code">{roomCode}</strong>로 들어올 수 있어요
              </>
            ) : (
              '친구가 아니어도 링크로 들어올 수 있어요'
            )}
          </span>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              닫기
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void copyLink()}>
              링크 복사하기
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
