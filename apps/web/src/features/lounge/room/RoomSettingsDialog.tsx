import { useState, type FormEvent } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import { MAX_MEMBERS, ME, MIN_MEMBERS, ROOM_NAME_MAX, type RoomSettings } from '../model/room';

type Props = {
  mode: 'create' | 'edit';
  initial?: RoomSettings;
  /** 지금 방에 있는 인원. 최대 인원은 이보다 작게 할 수 없다 */
  currentMembers?: number;
  onSubmit: (settings: RoomSettings) => void;
  onClose: () => void;
};

export function RoomSettingsDialog({ mode, initial, currentMembers = 1, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? `${ME.nickname}의 방`);
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? true);
  const [usePassword, setUsePassword] = useState(initial?.password != null);
  const [password, setPassword] = useState('');
  const [locked, setLocked] = useState(initial?.locked ?? false);
  const [maxMembers, setMaxMembers] = useState(String(initial?.maxMembers ?? 8));
  const [error, setError] = useState<string | null>(null);

  const minAllowed = Math.max(MIN_MEMBERS, currentMembers);
  const hasOldPassword = initial?.password != null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('방 이름을 입력해주세요');

    const max = Number(maxMembers);
    if (!Number.isInteger(max) || max < MIN_MEMBERS || max > MAX_MEMBERS) {
      return setError(`최대 인원은 ${MIN_MEMBERS}~${MAX_MEMBERS}명으로 정해주세요`);
    }
    if (max < currentMembers) return setError(`지금 ${currentMembers}명이 있어서 그보다 적게 할 수 없어요`);

    if (usePassword && !password && !hasOldPassword) return setError('비밀번호를 입력해주세요');
    const nextPassword = !usePassword ? null : password || initial?.password || null;

    onSubmit({ name: trimmed, isPublic, password: nextPassword, locked, maxMembers: max });
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
          <button type="submit" className="btn btn-primary">
            {mode === 'create' ? '방 만들기' : '저장'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
