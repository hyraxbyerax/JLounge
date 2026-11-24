import { useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../api/ApiError';
import { signIn } from '../api/session';
import './login.css';

type Props = {
  /** 로그인 화면 위에 보여줄 안내 (예: 캠퍼스 플래너는 로그인이 필요해요) */
  lead?: string;
  /** 로그인·회원가입이 끝나면 */
  onDone?: () => void;
  onBack: () => void;
};

/**
 * 사이트 공용 로그인·회원가입 (메인 화면 오른쪽 위 [로그인], 캠퍼스 플래너 입구).
 * 캠퍼스 플래너 팀원이 만든 AuthPage 의 동작을 그대로 옮기고 라운지 디자인으로 다시 그렸다.
 */
export function LoginPage({ lead = '로그인하면 캠퍼스 플래너를 쓸 수 있어요', onDone, onBack }: Props) {
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
    <main className="login-page soft-light">
      <form className="login-card" onSubmit={submit} noValidate>
        <h1 className="login-title">{mode === 'login' ? '로그인' : '회원가입'}</h1>
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
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          라운지로 돌아가기
        </button>
      </form>
    </main>
  );
}
