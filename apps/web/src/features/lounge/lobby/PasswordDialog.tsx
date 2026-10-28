import { useState, type FormEvent } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import type { RoomInfo } from '../model/room';

const MAX_TRIES = 5;

type Props = {
  room: RoomInfo;
  onSuccess: () => void;
  onClose: () => void;
};

export function PasswordDialog({ room, onSuccess, onClose }: Props) {
  const [password, setPassword] = useState('');
  const [fails, setFails] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lockedOut = fails >= MAX_TRIES;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (lockedOut) return;
    if (password === room.password) {
      onSuccess();
      return;
    }
    const nextFails = fails + 1;
    setFails(nextFails);
    setPassword('');
    setError(
      nextFails >= MAX_TRIES
        ? `비밀번호를 ${MAX_TRIES}번 틀렸어요. 10분 뒤에 다시 시도해주세요`
        : `비밀번호가 달라요. ${MAX_TRIES - nextFails}번 더 시도할 수 있어요`,
    );
  }

  return (
    <Modal title={`${room.name}에 들어가기`} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label className="form-label" htmlFor="room-password">
          비밀번호
        </label>
        <input
          id="room-password"
          className="input"
          type="password"
          autoFocus
          value={password}
          disabled={lockedOut}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={lockedOut}>
            들어가기
          </button>
        </div>
      </form>
    </Modal>
  );
}
