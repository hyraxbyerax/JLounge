import { useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../../../shared/api/ApiError';
import { Modal } from '../../../shared/ui/Modal';

type Props = {
  /** 방 이름을 알면 제목에, 모르면(코드로 들어올 때) "방에 들어가기" */
  roomName?: string;
  /** 서버가 비밀번호를 확인한다. 틀리면 남은 횟수가 담긴 ApiError */
  onSubmit: (password: string) => Promise<void>;
  onClose: () => void;
};

export function PasswordDialog({ roomName, onSubmit, onClose }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lockedOut, setLockedOut] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lockedOut || !password) return;
    setBusy(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setPassword('');
      setError(errorMessage(err));
      if (err instanceof ApiError && err.code === 'PASSWORD_LOCKED') setLockedOut(true);
      setBusy(false);
    }
  }

  return (
    <Modal title={roomName ? `${roomName}에 들어가기` : '방에 들어가기'} onClose={onClose}>
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
          <button type="submit" className="btn btn-primary" disabled={lockedOut || busy}>
            들어가기
          </button>
        </div>
      </form>
    </Modal>
  );
}
