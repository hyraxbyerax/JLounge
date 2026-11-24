import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../../shared/api/ApiError';
import { Modal } from '../../../shared/ui/Modal';
import { MAX_MEMBERS, MIN_MEMBERS, ROOM_NAME_MAX, type RoomSettings } from '../model/room';

type Initial = {
  name: string;
  isPublic: boolean;
  hasPassword: boolean;
  locked: boolean;
  maxMembers: number;
};

type Props = {
  mode: 'create' | 'edit';
  initial?: Initial;
  /** 새 방 이름 기본값 (예: "졸린 판다의 방") */
  defaultName?: string;
  /** 지금 방에 있는 인원. 최대 인원은 이보다 작게 할 수 없다 */
  currentMembers?: number;
  /** 서버가 거절하면 그 문장을 창 안에 보여준다 */
  onSubmit: (settings: RoomSettings) => Promise<void>;
  onClose: () => void;
};

export function RoomSettingsDialog({ mode, initial, defaultName = '', currentMembers = 1, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? defaultName);
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? true);
  const [usePassword, setUsePassword] = useState(initial?.hasPassword ?? false);
  const [password, setPassword] = useState('');
  const [locked, setLocked] = useState(initial?.locked ?? false);
  const [maxMembers, setMaxMembers] = useState(String(initial?.maxMembers ?? 8));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const minAllowed = Math.max(MIN_MEMBERS, currentMembers);
  const hasOldPassword = initial?.hasPassword ?? false;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('방 이름을 입력해주세요');

    const max = Number(maxMembers);
    if (!Number.isInteger(max) || max < MIN_MEMBERS || max > MAX_MEMBERS) {
      return setError(`최대 인원은 ${MIN_MEMBERS}~${MAX_MEMBERS}명으로 정해주세요`);
    }
    if (max < currentMembers) return setError(`지금 ${currentMembers}명이 있어서 그보다 적게 할 수 없어요`);

    if (usePassword && !password && !hasOldPassword) return setError('비밀번호를 입력해주세요');
    // 비밀번호: 끄면 null(없애기), 새로 쓰면 그 값, 켜둔 채 비워두면 그대로(undefined)
    const nextPassword = !usePassword ? null : password || (mode === 'create' ? null : undefined);

    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: trimmed, isPublic, password: nextPassword, locked, maxMembers: max });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === 'create' ? '방 만들기' : '방 설정'} onClose={onClose}>
      <form className="modal-form" onSubmit={submit} noValidate>
        <label className="form-label" htmlFor="room-name">
          방 이름
        </label>
        <input
          id="room-name"
          className="input"
          maxLength={ROOM_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <fieldset className="field-group">
          <legend className="form-label">공개 여부</legend>
          <label className="choice">
            <input type="radio" name="visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
            <span>
              공개 <span className="form-hint">로비에 창문으로 보여요</span>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
            <span>
              비공개 <span className="form-hint">방 코드·초대 링크로만 들어와요</span>
            </span>
          </label>
        </fieldset>

        <label className="choice">
          <input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} />
          <span>비밀번호 걸기</span>
        </label>
        {usePassword && (
          <>
            <label className="sr-only" htmlFor="room-password-new">
              비밀번호
            </label>
            <input
              id="room-password-new"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={hasOldPassword ? '새 비밀번호 (비우면 그대로)' : '비밀번호'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}

        <label className="choice">
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
          <span>
            입장 잠그기 <span className="form-hint">새로 들어올 수 없어요</span>
          </span>
        </label>

        <label className="form-label" htmlFor="room-max">
          최대 인원
        </label>
        <input
          id="room-max"
          className="input input-number"
          type="number"
          inputMode="numeric"
          min={minAllowed}
          max={MAX_MEMBERS}
          value={maxMembers}
          onChange={(e) => setMaxMembers(e.target.value)}
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
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {mode === 'create' ? '방 만들기' : '저장'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
