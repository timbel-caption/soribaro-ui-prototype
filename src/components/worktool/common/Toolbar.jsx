import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSubtitleStore } from '../../../stores/subtitleStore';
import { usePerformanceStore } from '../../../stores/performanceStore';
import { useRoleStore, Role, ROLE_INFO, getBaseRole } from '../../../stores/roleStore';
import { useThemeStore, THEMES } from '../../../stores/themeStore';
import { confirm } from '../../../stores/modalStore';
import SettingsModal from './SettingsModal';
import SttConfigModal from './SttConfigModal';
import SttMergeConflictModal from './SttMergeConflictModal';
import { ProcessModal } from '../../common/ProcessModal';
import { mapSTTErrorMessage } from '../../../services/ai/stt/sttErrorMapper';
import './Toolbar.css';

export default function Toolbar() {
  const { t } = useTranslation('worktool');
  const { id: fileNo } = useParams();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const urlReadOnly = searchParams.get('readonly') === 'true';
  const urlIsSplit = searchParams.get('isSplit') === 'true';
  const rawStartSec = searchParams.get('start_sec') !== null ? Number(searchParams.get('start_sec')) : null;
  const rawEndSec = searchParams.get('end_sec') !== null ? Number(searchParams.get('end_sec')) : null;
  const urlStartSec = (urlIsSplit && rawEndSec > 0) ? rawStartSec : null;
  const urlEndSec = (urlIsSplit && rawEndSec > 0) ? rawEndSec : null;
  const reset = useSubtitleStore((state) => state.reset);
  const mediaFileName = useSubtitleStore((state) => state.mediaFileName);
  const subtitleFileName = useSubtitleStore((state) => state.subtitleFileName);
  const lastRestoredInfo = useSubtitleStore((state) => state.lastRestoredInfo);
  const mediaUrl = useSubtitleStore((state) => state.mediaUrl);
  const mediaDuration = useSubtitleStore((state) => state.duration);
  const subtitles = useSubtitleStore((state) => state.subtitles);
  const clearSubtitles = useSubtitleStore((state) => state.clearSubtitles);
  const addSubtitle = useSubtitleStore((state) => state.addSubtitle);
  const triggerTranslateModal = useSubtitleStore((state) => state.triggerTranslateModal);
  const isServerMode = useSubtitleStore((state) => state.isServerMode);
  const initHardware = usePerformanceStore((state) => state.initHardware);
  
  // Role store (읽기 전용)
  const role = useRoleStore((state) => state.role);
  
  // Theme store
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const initTheme = useThemeStore((state) => state.initTheme);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showSttConfig, setShowSttConfig] = useState(false);
  const [showSttProcess, setShowSttProcess] = useState(false);
  const [sttOptions, setSttOptions] = useState({});
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [showMergeConflict, setShowMergeConflict] = useState(false);
  const [mergeConflictData, setMergeConflictData] = useState({ subtitles: [], overlaps: [] });
  
  const themeRef = useRef(null);
  
  // 앱 시작 시 하드웨어 감지 및 테마 초기화
  useEffect(() => {
    initHardware();
    initTheme();
  }, [initHardware, initTheme]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (themeRef.current && !themeRef.current.contains(e.target)) {
        setShowThemeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 새 프로젝트
  const handleNewProject = async () => {
    const confirmed = await confirm(t('toolbar.newProjectConfirm'), {
      title: t('toolbar.newProject'),
      confirmText: t('common.start'),
      cancelText: t('common.cancel'),
    });
    if (confirmed) {
      reset();
    }
  };

  // STT 설정 모달에서 실행 버튼 클릭 시
  const handleSttStart = (options) => {
    setSttOptions(options);
    setShowSttConfig(false);
    setShowSttProcess(true);
  };

  // 자막 결과를 subtitleStore에 적용하는 공통 함수
  const applySubtitlesToStore = useCallback((subtitleList) => {
    const { fileId } = useSubtitleStore.getState();
    clearSubtitles();
    if (fileId) {
      useSubtitleStore.getState().setFileId(fileId);
    }

    // STT 후처리: endTime을 다음 자막의 startTime과 동일하게 맞춤
    const sorted = [...(subtitleList || [])].sort(
      (a, b) => (a.startTime || 0) - (b.startTime || 0),
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      sorted[i].endTime = sorted[i + 1].startTime || 0;
    }

    sorted.forEach((sub) => {
      addSubtitle({
        text: sub.text || '',
        startTime: sub.startTime || 0,
        endTime: sub.endTime || 0,
        speakerId: sub.speaker?.label || sub.speakerId,
      }, false);
    });
    useSubtitleStore.getState().saveEditHistorySnapshot('STT 결과 적용', {
      count: sorted.length,
    });
  }, [clearSubtitles, addSubtitle]);

  // STT 처리 완료 시 - subtitleStore에 결과 저장
  const handleSttComplete = (result) => {
    if (!result?.subtitles) return;
    // 분할 STT에서 겹침이 있으면 병합 해결 모달 표시
    if (result.overlaps?.length > 0) {
      setMergeConflictData({
        subtitles: result.subtitles,
        overlaps: result.overlaps,
      });
      setShowMergeConflict(true);
      return;
    }

    applySubtitlesToStore(result.subtitles);
  };

  // 겹침 해결 완료 시
  const handleMergeResolved = useCallback((resolvedSubtitles) => {
    setShowMergeConflict(false);
    applySubtitlesToStore(resolvedSubtitles);
  }, [applySubtitlesToStore]);

  // STT 처리 에러 시 — 엔진명/스택이 노출되지 않도록 마스킹된 메시지만 콘솔에 남긴다.
  const handleSttError = (error) => {
    console.error('STT 처리 에러:', mapSTTErrorMessage(error));
  };

  // 상단 제목 결정 (미디어 파일명 또는 자막 파일명)
  const getTitle = () => {
    // if (mediaFileName) return mediaFileName;
    // if (subtitleFileName) return subtitleFileName;
    // if (lastRestoredInfo) {
    //   const restoredTime = new Date(lastRestoredInfo.restoredAt).toLocaleTimeString('ko-KR', {
    //     hour: '2-digit',
    //     minute: '2-digit',
    //   });
    //   return `복원됨 (${lastRestoredInfo.subtitleCount}개, ${restoredTime})`;
    // }
    return t('toolbar.appTitle');
  };

  // 연수 sub-role 인디케이터 — app-title 우측에 chip 으로 표시
  const trainingSubRole = mode === 'training' && searchParams.get('role')
    ? String(searchParams.get('role')).toUpperCase()
    : null;
  const trainingChip = (() => {
    if (!trainingSubRole) return null;
    if (trainingSubRole === 'ANSWER') {
      return { label: t('training.answerMode.title', { ns: 'common' }), bg: 'rgba(96,165,250,0.18)', color: '#60a5fa' };
    }
    if (trainingSubRole === 'STUDENT') {
      return { label: t('training.studentMode.title', { ns: 'common' }), bg: 'rgba(251,191,36,0.18)', color: '#fbbf24' };
    }
    if (trainingSubRole === 'REVIEW') {
      return { label: t('training.reviewMode.title', { ns: 'common' }), bg: 'rgba(167,139,250,0.20)', color: '#a78bfa' };
    }
    return null;
  })();

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="app-title">
          <h1>{getTitle()}</h1>
        </div>
        {trainingChip && (
          <span
            style={{
              marginLeft: 12,
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              background: trainingChip.bg,
              color: trainingChip.color,
              lineHeight: 1.6,
            }}
          >
            {trainingChip.label}
          </span>
        )}
      </div>

      <div className="toolbar-right">
        {/* 음성인식 버튼: 출발어 번역자, 번역자가 아닌 경우에만 표시 (ReadOnly 시 비활성화) */}
        {!urlReadOnly && mediaUrl && getBaseRole(role) !== Role.MID && getBaseRole(role) !== Role.FINAL && (
          <button
            onClick={() => setShowSttConfig(true)}
            className="btn-stt"
            title={t('toolbar.sttTitle')}
          >
            🎤 {t('toolbar.stt')}
          </button>
        )}

        {/* 번역 버튼: 출발어 번역자 또는 도착어 번역자이고, 자막이 있을 때만 표시 (ReadOnly 시 비활성화) */}
        {!urlReadOnly && subtitles.length > 0 && (getBaseRole(role) === Role.MID || getBaseRole(role) === Role.FINAL) && (
          <button 
            onClick={triggerTranslateModal} 
            className="btn-translate" 
            title={t('toolbar.translateTitle')}
          >
            🌐 {t('toolbar.translate')}
          </button>
        )}
        
        {/* Role 표시 (읽기 전용) */}
        <div className="role-selector readonly">
          <div 
            className="btn-role-toggle readonly"
            title={t(ROLE_INFO[role]?.descKey)}
          >
            <span className="role-icon">{ROLE_INFO[role]?.icon}</span>
            <span className="role-label">{t(ROLE_INFO[role]?.nameKey)}</span>
          </div>
        </div>
        
        {/* Theme 선택 */}
        <div className="theme-selector" ref={themeRef}>
          <button 
            className="btn-theme-toggle"
            onClick={() => setShowThemeDropdown(!showThemeDropdown)}
            title={t('toolbar.themeTitle', { themeLabel: THEMES[theme]?.label })}
          >
            <span className="theme-icon">{THEMES[theme]?.icon}</span>
          </button>
          {showThemeDropdown && (
            <div className="theme-dropdown show">
              {Object.values(THEMES).map((t) => (
                <button
                  key={t.name}
                  className={`theme-option ${theme === t.name ? 'active' : ''}`}
                  onClick={() => {
                    setTheme(t.name);
                    setShowThemeDropdown(false);
                  }}
                >
                  <span className="theme-icon">{t.icon}</span>
                  <span className="theme-label">{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <button 
          onClick={() => setShowSettings(true)} 
          className="btn-settings" 
          title={t('toolbar.settingsTitle')}
        >
          ⚙️
        </button>
        {/* 로컬 모드에서만 새 프로젝트 버튼 표시 */}
        {!isServerMode && (
          <button onClick={handleNewProject} className="btn-new" title={t('toolbar.newProjectTitle')}>
            {t('toolbar.newProject')}
          </button>
        )}
      </div>
      
      {/* 환경설정 모달 */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />

      {/* STT 설정 모달 */}
      <SttConfigModal
        isOpen={showSttConfig}
        onClose={() => setShowSttConfig(false)}
        onStart={handleSttStart}
        fileId={fileNo}
        mediaUrl={mediaUrl}
        mode={mode}
        mediaDuration={mediaDuration}
        allowedStartSec={urlStartSec}
        allowedEndSec={urlEndSec}
      />

      {/* STT 처리 모달 */}
      <ProcessModal
        isOpen={showSttProcess}
        onClose={() => setShowSttProcess(false)}
        type="stt"
        fileId={fileNo}
        sttOptions={sttOptions}
        onComplete={handleSttComplete}
        onError={handleSttError}
        skipRedirect={true}
      />

      {/* 분할 STT 겹침 해결 모달 */}
      <SttMergeConflictModal
        isOpen={showMergeConflict}
        subtitles={mergeConflictData.subtitles}
        overlaps={mergeConflictData.overlaps}
        onResolve={handleMergeResolved}
        onClose={() => setShowMergeConflict(false)}
      />
    </div>
  );
}
