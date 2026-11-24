import { VISIBILITY_LABEL, type FriendEntry, type PresenceVisibility } from '@lounge/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../../../shared/api/ApiError';
import { Modal } from '../../../shared/ui/Modal';
import { friendsApi } from './friendsApi';
import { useFriends } from './useFriends';
import './friends.css';

type Props = {
  onClose: () => void;
  /** 지금 들어가 있는 방 (있으면 친구 옆에 [초대]) */
  currentRoomCode?: string | null;
  onInvite?: (friend: FriendEntry) => Promise<void>;
  /** 친구가 있는 방으로 따라가기 */
  onFollow?: (friend: FriendEntry) => void;
};

/** 친구 창: 내 친구 코드, 친구 추가, 받은 요청, 친구 목록(상태·따라가기·초대), 보낸 요청, 차단, 공개 범위 */
export function FriendsDialog({ onClose, currentRoomCode = null, onInvite, onFollow }: Props) {
  const { overview, reload } = useFriends();
  const [me, setMe] = useState<{ friendCode: string; presenceVisibility: PresenceVisibility } | null>(null);
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    friendsApi.me().then(setMe, () => undefined);
  }, []);

  const say = (text: string, error = false) => setMessage({ text, error });
  const run = (task: Promise<{ message?: string } | void>, done?: string) =>
    task.then(
      (res) => {
        say((res && 'message' in res && res.message) || done || '바꿨어요');
        reload();
      },
      (err: unknown) => say(errorMessage(err), true),
    );

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = target.trim();
    if (!value) return;
    // 8자리 영문·숫자면 친구 코드, 아니면 닉네임으로 찾는다
    const byCode = /^[A-Za-z0-9]{8}$/.test(value);
    void run(friendsApi.request(byCode ? { friendCode: value } : { nickname: value })).then(() => setTarget(''));
  }

  async function copyCode() {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(me.friendCode);
      say('친구 코드를 복사했어요');
    } catch {
      say(`친구 코드: ${me.friendCode}`);
    }
  }

  return (
    <Modal title="친구" onClose={onClose} wide>
      <div className="friends-dialog">
        <section className="friends-section">
          <div className="friends-row">
            <span className="form-label">내 친구 코드</span>
            <code className="friend-code">{me?.friendCode ?? '…'}</code>
            <button type="button" className="btn btn-ghost" onClick={copyCode} disabled={!me}>
              복사
            </button>
          </div>
          <form className="friends-row" onSubmit={submit}>
            <label className="sr-only" htmlFor="friend-target">
              친구 닉네임 또는 친구 코드
            </label>
            <input
              id="friend-target"
              className="input friends-input"
              placeholder="닉네임 또는 친구 코드"
              maxLength={20}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              친구 요청
            </button>
          </form>
          {message && (
            <p className={message.error ? 'form-error' : 'form-hint'} role="status">
              {message.text}
            </p>
          )}
        </section>

        {overview && overview.incoming.length > 0 && (
          <section className="friends-section" aria-label="받은 친구 요청">
            <h3 className="friends-heading">받은 요청 {overview.incoming.length}</h3>
            <ul className="friends-list">
              {overview.incoming.map((u) => (
                <li key={u.userId} className="friend-item">
                  <span className="friend-name">{u.nickname}</span>
                  <span className="friend-actions">
                    <button type="button" className="btn btn-primary" onClick={() => run(friendsApi.accept(u.userId))}>
                      수락
                    </button>
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => run(friendsApi.remove(u.userId), '요청을 거절했어요')}
                    >
                      거절
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="friends-section" aria-label="친구 목록">
          <h3 className="friends-heading">친구 {overview?.friends.length ?? ''}</h3>
          {!overview ? (
            <p className="form-hint">불러오는 중이에요…</p>
          ) : overview.friends.length === 0 ? (
            <p className="form-hint">아직 친구가 없어요. 닉네임이나 친구 코드로 요청해보세요</p>
          ) : (
            <ul className="friends-list">
              {overview.friends.map((f) => {
                const here = f.presence.room?.code === currentRoomCode && currentRoomCode !== null;
                return (
                  <li key={f.userId} className="friend-item">
                    <span className={`presence-dot${f.presence.online ? ' is-online' : ''}`} aria-hidden="true" />
                    <span className="friend-text">
                      <span className="friend-name">{f.nickname}</span>
                      <span className="friend-status">
                        {!f.presence.online
                          ? '오프라인'
                          : f.presence.room
                            ? `${f.presence.room.name} · ${f.presence.activity ?? '접속 중'}`
                            : '접속 중'}
                      </span>
                    </span>
                    <span className="friend-actions">
                      {onFollow && f.presence.room && !here && (
                        <button type="button" className="btn btn-ghost" onClick={() => onFollow(f)}>
                          따라가기
                        </button>
                      )}
                      {onInvite && currentRoomCode && f.presence.online && !here && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            onInvite(f).then(
                              () => say(`${f.nickname}님을 초대했어요`),
                              (err: unknown) => say(errorMessage(err), true),
                            )
                          }
                        >
                          초대
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => run(friendsApi.remove(f.userId), `${f.nickname}님과 친구를 끊었어요`)}
                      >
                        끊기
                      </button>
                      <button type="button" className="btn-text" onClick={() => run(friendsApi.block(f.userId))}>
                        차단
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {overview && overview.outgoing.length > 0 && (
          <section className="friends-section" aria-label="보낸 친구 요청">
            <h3 className="friends-heading">보낸 요청</h3>
            <ul className="friends-list">
              {overview.outgoing.map((u) => (
                <li key={u.userId} className="friend-item">
                  <span className="friend-name">{u.nickname}</span>
                  <span className="friend-status">기다리는 중</span>
                  <span className="friend-actions">
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => run(friendsApi.remove(u.userId), '요청을 취소했어요')}
                    >
                      취소
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {overview && overview.blocked.length > 0 && (
          <section className="friends-section" aria-label="차단한 사람">
            <h3 className="friends-heading">차단</h3>
            <ul className="friends-list">
              {overview.blocked.map((u) => (
                <li key={u.userId} className="friend-item">
                  <span className="friend-name">{u.nickname}</span>
                  <span className="friend-actions">
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => run(friendsApi.unblock(u.userId), '차단을 풀었어요')}
                    >
                      차단 풀기
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="friends-section">
          <label className="form-label" htmlFor="presence-visibility">
            친구에게 보이는 내 상태
          </label>
          <select
            id="presence-visibility"
            className="input"
            value={me?.presenceVisibility ?? 'all'}
            disabled={!me}
            onChange={(e) => {
              const value = e.target.value as PresenceVisibility;
              friendsApi.setVisibility(value).then(
                (next) => {
                  setMe(next);
                  say('공개 범위를 바꿨어요');
                },
                (err: unknown) => say(errorMessage(err), true),
              );
            }}
          >
            {(Object.keys(VISIBILITY_LABEL) as PresenceVisibility[]).map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_LABEL[v]}
              </option>
            ))}
          </select>
        </section>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
