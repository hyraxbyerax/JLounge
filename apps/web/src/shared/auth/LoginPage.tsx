import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, errorMessage } from '../api/ApiError';
import { signIn } from '../api/session';
import { Modal } from '../ui/Modal';
import './login.css';

type FormProps = {
  /** 로그인 화면 위에 보여줄 안내 (예: 캠퍼스 플래너는 로그인이 필요해요) */
  lead?: string;
  /** 로그인·회원가입이 끝나면 */
  onDone?: () => void;
  /** 아래쪽 버튼 (돌아가기 등) */
  footer?: ReactNode;
  /** 대화상자 안에서는 제목을 대화상자가 보여준다 */
  showTitle?: boolean;
};

/**
 * 사이트 공용 로그인·회원가입 양식.
 * 캠퍼스 플래너 팀원이 만든 AuthPage 의 동작을 그대로 옮기고 라운지 디자인으로 다시 그렸다.
 */
export function LoginForm({
  lead = '로그인하면 캠퍼스 플래너와 친구 기능을 쓸 수 있어요',
  onDone,
  footer,
  showTitle = true,
}: FormProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      if (mode === 'login') await signIn({ mode, email, password });
      else await signIn({ mode, email, password, nickname });
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fields);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError(null);
    setFieldErrors({});
  };

  return (
    <form className="login-card" onSubmit={submit} noValidate>
      {showTitle && <h1 className="login-title">{mode === 'login' ? '로그인' : '회원가입'}</h1>}
      <p className="muted">{lead}</p>

      {mode === 'signup' && (
        <label className="login-field">
          <span className="form-label">닉네임</span>
          <input
            className="input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
          />
          {fieldErrors.nickname && <em className="form-error">{fieldErrors.nickname}</em>}
        </label>
      )}
      <label className="login-field">
        <span className="form-label">이메일</span>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        {fieldErrors.email && <em className="form-error">{fieldErrors.email}</em>}
      </label>
      <label className="login-field">
        <span className="form-label">비밀번호</span>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
        {mode === 'signup' && !fieldErrors.password && <small className="form-hint">8자 이상</small>}
        {fieldErrors.password && <em className="form-error">{fieldErrors.password}</em>}
      </label>

      {error && !Object.keys(fieldErrors).length && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}
      </button>
      <button type="button" className="btn-text" onClick={switchMode}>
        {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
      </button>
      {footer}
    </form>
  );
}

type PageProps = {
  lead?: string;
  onDone?: () => void;
  onBack: () => void;
};

/** 로그인 화면 (메인 화면 오른쪽 위 [로그인], 캠퍼스 플래너 입구) */
export function LoginPage({ lead, onDone, onBack }: PageProps) {
  return (
    <main className="login-page soft-light">
      <LoginForm
        lead={lead}
        onDone={onDone}
        footer={
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            라운지로 돌아가기
          </button>
        }
      />
    </main>
  );
}

/** 방 안에서 게스트가 로그인할 때 (로그인하면 같은 자리·방장을 그대로 이어받는다) */
export function LoginDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="로그인" onClose={onClose}>
      <LoginForm
        showTitle={false}
        lead="로그인해도 이 방에 그대로 있어요. 방장이었다면 방장도 그대로예요"
        onDone={onClose}
        footer={
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        }
      />
    </Modal>
  );
}
