import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useLocation } from 'react-router-dom';
import { useThemeStore } from './stores/themeStore';
import { useUserStore } from './stores/userStore';
import { useCommonCodeStore } from './stores/commonCodeStore';

// 레이아웃
import MainLayout from './components/layout/MainLayout';

// 페이지
import HomePage from './pages/HomePage';
import WorkToolPage from './pages/WorkToolPage';
import ProgressPage from './pages/ProgressPage';
import TranslatesPage from './pages/TranslatesPage';
import UserErrorPage from './pages/UserErrorPage';
import LoginPage from './pages/LoginPage';

// 소리바로 - 녹취록 페이지
import RecordingRequestPage from './pages/soribaro/recording/RecordingRequestPage';
import RecordingRequestDetailPage from './pages/soribaro/recording/RecordingRequestDetailPage';
import RecordingWorkPage from './pages/soribaro/recording/RecordingWorkPage';
import RecordingWorkDetailPage from './pages/soribaro/recording/RecordingWorkDetailPage';

// 소리바로 - 마이페이지
import MyPage from './pages/soribaro/mypage/MyPage';

// 소리바로 - 엔터프라이즈 페이지
import MeetingWorkPage from './pages/soribaro/meeting/MeetingWorkPage';
import StenographyWorkPage from './pages/soribaro/stenography/StenographyWorkPage';
import EnterpriseMeetingPage from './pages/soribaro/enterprise/EnterpriseMeetingPage';
import EnterpriseVodPage from './pages/soribaro/enterprise/EnterpriseVodPage';
import EnterpriseWorkDetailPage from './pages/soribaro/enterprise/EnterpriseWorkDetailPage';
// [5차 고도화 프로토타입]
import VodWorkDetailProto from './pages/soribaro/enterprise/proto/VodWorkDetailProto';
import MeetingWorkDetailProto from './pages/soribaro/enterprise/proto/MeetingWorkDetailProto';
import MeetingMenuDetailProto from './pages/soribaro/meeting/MeetingMenuDetailProto';

// 소리바로 - 번역 페이지
import TranslationWorkPage from './pages/soribaro/translation/TranslationWorkPage';
import TranslationWorkDetailPage from './pages/soribaro/translation/TranslationWorkDetailPage';
import PromptManagementPage from './pages/soribaro/translation/PromptManagementPage';
import PromptDetailPage from './pages/soribaro/translation/PromptDetailPage';
import TagManagementPage from './pages/soribaro/translation/TagManagementPage';

// 소리바로 - 서비스관리 페이지
import ManageEnterprisePage from './pages/soribaro/manage/ManageEnterprisePage';
import ManageEnterpriseDetailPage from './pages/soribaro/manage/ManageEnterpriseDetailPage';
import ManageEnterpriseCustomerPage from './pages/soribaro/manage/ManageEnterpriseCustomerPage';
import ManageEnterpriseCustomerDetailPage from './pages/soribaro/manage/ManageEnterpriseCustomerDetailPage';
import ManageSettlementPage from './pages/soribaro/manage/settlement/ManageSettlementPage';
import ManagePricingPage from './pages/soribaro/manage/ManagePricingPage';
import ManageDepreciationPage from './pages/soribaro/manage/ManageDepreciationPage';
import ManageWorkerPage from './pages/soribaro/manage/ManageWorkerPage';
import ManageWorkerDetailPage from './pages/soribaro/manage/ManageWorkerDetailPage';
import ManageEvaluationPage from './pages/soribaro/manage/ManageEvaluationPage';
import ManageNoticePage from './pages/soribaro/manage/notice/ManageNoticePage';

// 소리바로 - 연수(Training) 페이지
import TrainingFilesPage from './pages/soribaro/training/TrainingFilesPage';
import TrainingAssignmentsPage from './pages/soribaro/training/TrainingAssignmentsPage';
import TrainingAssignmentDetailPage from './pages/soribaro/training/TrainingAssignmentDetailPage';
import TraineeAssignmentsPage from './pages/soribaro/training/TraineeAssignmentsPage';
import TraineeAssignmentDetailPage from './pages/soribaro/training/TraineeAssignmentDetailPage';
import TrainingStudentsManagePage from './pages/soribaro/training/TrainingStudentsManagePage';

// 클립데스크 페이지
import VideoRequestPage from './pages/clipdesk/VideoRequestPage';
import VideoWorkPage from './pages/clipdesk/VideoWorkPage';

import { ToastContainer } from './components/common/Toast';
// [프로토타입] 화면 카탈로그
import ScreenIndexPage from './pages/_prototype/ScreenIndexPage';
// [프로토타입] README 뷰어
import ReadmePage from './pages/_prototype/ReadmePage';
// [프로토타입] 업데이트 내역
import UpdatesPage from './pages/_prototype/UpdatesPage';
import ProjectTaskTypePage from './pages/_prototype/ProjectTaskTypePage';
import './App.css';

/**
 * WorkToolGate — bare /worktool 진입 시 query 컨텍스트가 없으면 차단.
 * - 허용: mode=training | mode=merge(+servCd) | mode=local
 * - 차단: 그 외 (주소창에 그냥 /worktool 만 친 경우 포함)
 * path 가 있는 /worktool/:id, /worktool/:projectFileId/:fileNo/:servCd 는 영향 없음.
 */
function WorkToolGate({ children }) {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const isAllowed =
    mode === 'training' ||
    (mode === 'merge' && !!searchParams.get('servCd')) ||
    mode === 'local' ||
    mode === 'vod';
  if (!isAllowed) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', padding: '24px', textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠</div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
            잘못된 접근입니다
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.7 }}>
            작업툴은 URL 직접 진입으로 사용할 수 없습니다.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

function AdminRoute({ children }) {
  const isAdmin = useUserStore((state) => {
    const roles = state.user?.roles ?? [];
    const membLvl = String(state.user?.membLvl ?? '');
    return roles.includes('ROLE_ADMIN') || roles.includes('ROLE_SUPER') || membLvl === '2' || membLvl === '4';
  });
  const isTraineeOnly = useUserStore((state) => {
    const roles = state.user?.roles ?? [];
    const membLvl = String(state.user?.membLvl ?? '');
    const isAdm = roles.includes('ROLE_ADMIN') || roles.includes('ROLE_SUPER') || membLvl === '2' || membLvl === '4';
    const isTrn = roles.includes('ROLE_TRAINEE') || membLvl === '5';
    return isTrn && !isAdm;
  });
  if (isTraineeOnly) return <Navigate to="/soribaro/training/student" replace />;
  if (!isAdmin) return <Navigate to="/soribaro/mypage" replace />;
  return children;
}

/**
 * HomeRedirect — 인덱스(/) 진입 시 역할 기반 리다이렉트.
 * - TRAINEE (관리자 권한 없음) → /soribaro/training/student
 * - 그 외 → /soribaro/mypage
 */
function HomeRedirect() {
  const isTraineeOnly = useUserStore((state) => {
    const roles = state.user?.roles ?? [];
    const membLvl = String(state.user?.membLvl ?? '');
    const isAdm = roles.includes('ROLE_ADMIN') || roles.includes('ROLE_SUPER') || membLvl === '2' || membLvl === '4';
    const isTrn = roles.includes('ROLE_TRAINEE') || membLvl === '5';
    return isTrn && !isAdm;
  });
  return <Navigate to={isTraineeOnly ? '/soribaro/training/student' : '/soribaro/mypage'} replace />;
}

/**
 * TraineeRoute — 수강생 페이지 라우트.
 * - 인증 사용자(TRAINEE 또는 ADMIN) 모두 허용. TRAINEE 의 본인 일치 검증은 백엔드가 담당.
 * - 비로그인은 상위 AppRoutes 에서 이미 차단됨.
 */
function TraineeRoute({ children }) {
  return children;
}

/**
 * TRAINEE 가드 — ROLE_TRAINEE 만 보유한 사용자가 `/soribaro/training/student*` 외 경로에 진입하면
 * 무조건 본인 페이지로 리다이렉트.
 *
 * 예외: 워크툴 STUDENT 모드(/worktool?...role=STUDENT) 는 새 창에서 열리며 본인용이므로 통과.
 */
function TraineeGuard({ children }) {
  const location = useLocation();
  const isTraineeOnly = useUserStore((state) => {
    const roles = state.user?.roles ?? [];
    const membLvl = String(state.user?.membLvl ?? '');
    const isAdm = roles.includes('ROLE_ADMIN') || roles.includes('ROLE_SUPER') || membLvl === '2' || membLvl === '4';
    const isTrn = roles.includes('ROLE_TRAINEE') || membLvl === '5';
    return isTrn && !isAdm;
  });

  if (!isTraineeOnly) return children;

  const path = location.pathname;
  // 수강생 본인 페이지 또는 워크툴(쿼리로 STUDENT 모드 인지 식별 — 단순 허용)은 통과
  if (path.startsWith('/soribaro/training/student')) return children;
  if (path.startsWith('/worktool')) {
    // 워크툴은 새 창에서 사용 — STUDENT 모드 외에는 백엔드/SubtitleList 가드가 처리
    return children;
  }
  return <Navigate to="/soribaro/training/student" replace />;
}

/**
 * 앱 라우트 (BrowserRouter 내부)
 * - mode=test 는 당분간 진입 차단 (보안 점검)
 * - mode=local 이 아닌 경우, 사용자 인증 상태를 확인
 * - 인증 실패 시 에러 페이지를 표시하고 다른 페이지 접근을 차단
 */
function AppRoutes() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const isLoading = useUserStore((state) => state.isLoading);
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);

  // mode=test 진입 차단
  if (mode === 'test') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', padding: '24px', textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠</div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
            현재 사용할 수 없는 모드입니다
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.7 }}>
            테스트 모드는 점검을 위해 일시적으로 차단되었습니다.
          </p>
        </div>
      </div>
    );
  }

  const isTestMode = mode === 'local';

  // local 모드가 아니고, 로딩 중이면 빈 화면 (깜빡임 방지)
  if (!isTestMode && isLoading) {
    return null;
  }

  // local 모드가 아니고, 인증 실패 시 로그인 페이지
  if (!isTestMode && !isLoading && !isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<TraineeGuard><MainLayout /></TraineeGuard>}>
        {/* 홈 → 역할에 따른 진입 페이지 */}
        <Route index element={<HomeRedirect />} />

        {/* [프로토타입] 화면 카탈로그 */}
        <Route path="screens" element={<ScreenIndexPage />} />

        {/* [프로토타입] README 뷰어 */}
        <Route path="readme" element={<ReadmePage />} />

        {/* [프로토타입] 업데이트 내역 */}
        <Route path="updates" element={<UpdatesPage />} />

        {/* [프로토타입 · 개발중] 프로젝트 작업 유형 및 용어집 설정 */}
        <Route path="dev/project-task-types" element={<ProjectTaskTypePage />} />

        {/* 소리바로 - 마이페이지 */}
        <Route path="soribaro/mypage" element={<MyPage />} />

        {/* 소리바로 - 녹취록 (관리자 전용) */}
        <Route path="soribaro/recording/request" element={<AdminRoute><RecordingRequestPage /></AdminRoute>} />
        <Route path="soribaro/recording/request/:servCd" element={<AdminRoute><RecordingRequestDetailPage /></AdminRoute>} />
        <Route path="soribaro/recording/work" element={<AdminRoute><RecordingWorkPage /></AdminRoute>} />
        <Route path="soribaro/recording/work/:servCd" element={<RecordingWorkDetailPage />} />

        {/* 소리바로 - 엔터프라이즈 */}
        <Route path="soribaro/meeting/work" element={<AdminRoute><MeetingWorkPage /></AdminRoute>} />
        <Route path="soribaro/stenography/work" element={<AdminRoute><StenographyWorkPage /></AdminRoute>} />
        <Route path="soribaro/enterprise/meeting" element={<AdminRoute><EnterpriseMeetingPage /></AdminRoute>} />
        <Route path="soribaro/enterprise/meeting/:servCd" element={<EnterpriseWorkDetailPage />} />
        <Route path="soribaro/enterprise/vod" element={<AdminRoute><EnterpriseVodPage /></AdminRoute>} />
        <Route path="soribaro/enterprise/vod/:servCd" element={<EnterpriseWorkDetailPage />} />

        {/* [5차 고도화 프로토타입] 샘플 상세 */}
        <Route path="soribaro/enterprise/vod-proto/:id" element={<VodWorkDetailProto />} />
        <Route path="soribaro/enterprise/meeting-proto/:id" element={<MeetingWorkDetailProto />} />
        <Route path="soribaro/meeting/detail/:id" element={<MeetingMenuDetailProto />} />

        {/* 소리바로 - 서비스관리 (관리자 전용) */}
        <Route path="soribaro/manage/enterprise" element={<AdminRoute><ManageEnterprisePage /></AdminRoute>} />
        <Route path="soribaro/manage/enterprise/:entNo" element={<AdminRoute><ManageEnterpriseDetailPage /></AdminRoute>} />
        <Route path="soribaro/manage/enterprise-customer" element={<AdminRoute><ManageEnterpriseCustomerPage /></AdminRoute>} />
        <Route path="soribaro/manage/enterprise-customer/:membNo" element={<AdminRoute><ManageEnterpriseCustomerDetailPage /></AdminRoute>} />
        <Route path="soribaro/manage/settlement" element={<AdminRoute><ManageSettlementPage /></AdminRoute>} />
        <Route path="soribaro/manage/pricing" element={<AdminRoute><ManagePricingPage /></AdminRoute>} />
        <Route path="soribaro/manage/depreciation" element={<AdminRoute><ManageDepreciationPage /></AdminRoute>} />
        <Route path="soribaro/manage/worker" element={<AdminRoute><ManageWorkerPage /></AdminRoute>} />
        <Route path="soribaro/manage/worker/:membNo" element={<AdminRoute><ManageWorkerDetailPage /></AdminRoute>} />
        <Route path="soribaro/manage/evaluation" element={<AdminRoute><ManageEvaluationPage /></AdminRoute>} />
        <Route path="soribaro/manage/notice" element={<AdminRoute><ManageNoticePage /></AdminRoute>} />

        {/* 소리바로 - 번역 */}
        <Route path="soribaro/translation/work" element={<AdminRoute><TranslationWorkPage /></AdminRoute>} />
        <Route path="soribaro/translation/work/:servCd" element={<TranslationWorkDetailPage />} />
        <Route path="soribaro/translation/prompt" element={<AdminRoute><PromptManagementPage /></AdminRoute>} />
        <Route path="soribaro/translation/prompt/:id" element={<AdminRoute><PromptDetailPage /></AdminRoute>} />
        <Route path="soribaro/translation/tags" element={<AdminRoute><TagManagementPage /></AdminRoute>} />

        {/* 소리바로 - 연수(Training) — 파일 관리는 관리자 전용. 작업툴 실행은 사이드바에서 새 창으로 직접 띄움. */}
        <Route path="soribaro/training" element={<Navigate to="/soribaro/training/files" replace />} />
        <Route path="soribaro/training/files" element={<AdminRoute><TrainingFilesPage /></AdminRoute>} />
        {/* 과제 관리 (관리자) */}
        <Route path="soribaro/training/assignments" element={<AdminRoute><TrainingAssignmentsPage /></AdminRoute>} />
        <Route path="soribaro/training/assignments/:id" element={<AdminRoute><TrainingAssignmentDetailPage /></AdminRoute>} />
        {/* 수강생 페이지 (TRAINEE 또는 ADMIN) */}
        <Route path="soribaro/training/student" element={<TraineeRoute><TraineeAssignmentsPage /></TraineeRoute>} />
        <Route path="soribaro/training/student/:assignmentStudentId" element={<TraineeRoute><TraineeAssignmentDetailPage /></TraineeRoute>} />
        {/* 수강생 관리 (관리자) */}
        <Route path="soribaro/training/students" element={<AdminRoute><TrainingStudentsManagePage /></AdminRoute>} />

        {/* 클립데스크 - 영상작업관리 (관리자 전용) */}
        <Route path="clipdesk/video/request" element={<AdminRoute><VideoRequestPage /></AdminRoute>} />
        <Route path="clipdesk/video/work" element={<AdminRoute><VideoWorkPage /></AdminRoute>} />

        {/* 작업툴 */}
        <Route path="worktool" element={<WorkToolGate><WorkToolPage /></WorkToolGate>} />
        <Route path="worktool/:id" element={<WorkToolPage />} />
        <Route path="worktool/:projectFileId/:fileNo/:servCd" element={<WorkToolPage />} />

        {/* 진행현황 (관리자 전용) */}
        <Route path="progress" element={<AdminRoute><ProgressPage /></AdminRoute>} />
        <Route path="progress/:id" element={<AdminRoute><ProgressPage /></AdminRoute>} />

        {/* 번역 (관리자 전용) */}
        <Route path="translates" element={<AdminRoute><TranslatesPage /></AdminRoute>} />
        <Route path="translates/:id" element={<AdminRoute><TranslatesPage /></AdminRoute>} />

        {/* 404 - 홈으로 리다이렉트 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  const initTheme = useThemeStore((state) => state.initTheme);
  const fetchUser = useUserStore((state) => state.fetchUser);
  const fetchAllCodes = useCommonCodeStore((state) => state.fetchAllCodes);

  // 앱 시작시 저장된 테마 적용
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  // 앱 시작시 사용자 정보 초기화
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // 앱 시작시 공통코드 일괄 조회
  useEffect(() => {
    fetchAllCodes();
  }, [fetchAllCodes]);

  // GitHub Pages 등 하위 경로 배포 지원 (vite base 값과 동기화)
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

  return (
    <BrowserRouter basename={basename}>
      <div className="app">
        <ToastContainer />
        <AppRoutes />
      </div>
    </BrowserRouter>
  );
}

export default App;
