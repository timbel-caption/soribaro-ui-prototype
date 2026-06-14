import { useUserStore } from '../stores/userStore';
import './UserErrorPage.css';

export default function UserErrorPage() {
  const error = useUserStore((state) => state.error);
  const fetchUser = useUserStore((state) => state.fetchUser);

  const handleRetry = () => {
    fetchUser();
  };

  return (
    <div className="user-error-page">
      <div className="user-error-content">
        <div className="user-error-icon">⚠</div>
        <h1 className="user-error-title">사용자 정보를 찾을 수 없습니다</h1>
        <p className="user-error-description">
          로그인 정보를 확인할 수 없어 서비스를 이용할 수 없습니다.
        </p>
        {error && (
          <div className="user-error-detail">
            <span className="user-error-detail-label">상세:</span> {error}
          </div>
        )}
        <button className="user-error-retry-btn" onClick={handleRetry}>
          다시 시도
        </button>
      </div>
    </div>
  );
}
