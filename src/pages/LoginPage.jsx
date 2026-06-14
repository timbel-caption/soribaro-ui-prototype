import { useState } from 'react';
import { useUserStore } from '../stores/userStore';
import './LoginPage.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const login = useUserStore((state) => state.login);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password.trim()) {
      setErrorMessage('아이디와 비밀번호를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      if (!result.success) {
        setErrorMessage(result.message || '로그인에 실패했습니다.');
      }
    } catch {
      setErrorMessage('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo-icon">
            <img src="/favicon.ico" alt="Soribaro" />
          </div>
          <h1 className="login-title">소리바로</h1>
          <p className="login-subtitle">계정에 로그인하여 시작하세요</p>
        </div>

        <div className="login-card">
          <form className="login-form" onSubmit={handleSubmit}>
            {errorMessage && (
              <div className="login-error">
                <span className="login-error-icon">!</span>
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="login-field">
              <label className="login-label" htmlFor="login-email">아이디</label>
              <input
                id="login-email"
                className="login-input"
                type="text"
                name="username"
                placeholder="아이디를 입력하세요"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoFocus
                disabled={isSubmitting}
              />
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="login-password">비밀번호</label>
              <input
                id="login-password"
                className="login-input"
                type="password"
                name="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              className="login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? <span className="login-spinner" /> : '로그인'}
            </button>
          </form>
        </div>

        <p className="login-footer">
          계정이 없으신가요? <span className="login-footer-highlight">관리자에게 문의하세요</span>
        </p>
      </div>
    </div>
  );
}
