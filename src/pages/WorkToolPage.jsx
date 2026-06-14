import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useThemeStore } from '../stores/themeStore';
import { useSubtitleStore } from '../stores/subtitleStore';
import { useRoleStore, Role } from '../stores/roleStore';
import { useSettingsStore } from '../stores/settingsStore';
import { ffmpegService } from '../services/audio/ffmpegService';
import { concatWavFiles, allWavFiles } from '../utils/wavConcat';
import { toast } from '../stores/toastStore';
import {
  getProjectFileInfo,
  getProjectFileById,
  updateProjectFile,
  getServByServCd,
  updateServWorkStat,
  getFileStreamUrl,
  getFileDownloadUrl,
  getTrainingFilePlaybackUrl,
  getTrainingWaveformDownloadUrl,
} from '../api/v9';
import { useModalStore } from '../stores/modalStore';
import { useShortcutsStore } from '../stores/shortcutsStore';
import {
  getEntryWorkStatByRole,
  isWorkStatTransitionAllowed,
  normalizeWorkStat,
} from '../utils/workStatUtils';
import { isValidWorkCategory } from '../utils/worktoolRoute';
import { mockWorktoolSubtitles } from '../mocks/fixtures/index.js';
import Toolbar from '../components/worktool/common/Toolbar';
import WidgetLayout from '../components/worktool/common/WidgetLayout';
import ConfirmModal from '../components/worktool/common/ConfirmModal';
import ValidationModal from '../components/worktool/subtitle/ValidationModal';
import NetflixQCModal from '../components/worktool/subtitle/NetflixQCModal';
import TrainingWorktoolOverlay from '../components/training/TrainingWorktoolOverlay';
import './WorkToolPage.css';

export default function WorkToolPage() {
  const { id, projectFileId, fileNo, servCd } = useParams();
  const [searchParams] = useSearchParams();
  const step = searchParams.get('step');
  const roleParam = searchParams.get('role');
  const workCategoryParam = searchParams.get('workCategory');
  const workCategory = isValidWorkCategory(workCategoryParam)
    ? workCategoryParam
    : null;
  const isPopup = searchParams.get('popup') === 'true';
  const mode = searchParams.get('mode');
  const mergeServCd = searchParams.get('servCd');
  const isMergeMode = mode === 'merge' && !!mergeServCd;
  const isTrainingMode = mode === 'training';
  const trainingFileId = searchParams.get('trainingFileId');
  const trainingAssignmentId = searchParams.get('assignmentId');
  const trainingAssignmentStudentId = searchParams.get('assignmentStudentId');
  // 연수 sub-role: START(기본/시연), ANSWER(정답지 작성), STUDENT(수강생 작업),
  // REVIEW(관리자가 학생 자막을 읽기 전용으로 확인 — readonly=true 와 함께)
  const trainingSubRole = isTrainingMode
    ? (roleParam ? String(roleParam).toUpperCase() : 'START')
    : null;

  const initTheme = useThemeStore((state) => state.initTheme);
  const setMediaUrl = useSubtitleStore((state) => state.setMediaUrl);
  const setFileId = useSubtitleStore((state) => state.setFileId);
  const setServerMode = useSubtitleStore((state) => state.setServerMode);
  const setServerFileError = useSubtitleStore((state) => state.setServerFileError);
  const setServerWaveformOverrideUrl = useSubtitleStore(
    (state) => state.setServerWaveformOverrideUrl,
  );
  const setSubtitles = useSubtitleStore((state) => state.setSubtitles);
  const setSplitRange = useSubtitleStore((state) => state.setSplitRange);
  const splitStartSec = useSubtitleStore((state) => state.splitStartSec);
  const splitEndSec = useSubtitleStore((state) => state.splitEndSec);
  const setMergeMode = useSubtitleStore((state) => state.setMergeMode);
  const setVideoMinimized = useSubtitleStore((state) => state.setVideoMinimized);
  const setRole = useRoleStore((state) => state.setRole);
  const isValidationOpen = useModalStore((state) => state.isValidationOpen);
  const closeValidation = useModalStore((state) => state.closeValidation);
  const getShortcutId = useShortcutsStore((state) => state.getShortcutId);
  const mediaSeekStepSec = useSettingsStore(
    (state) => state.subtitleEditor?.mediaSeekStepSec ?? 3
  );
  const currentWorkStatRef = useRef(null);
  const [mergeProgress, setMergeProgress] = useState(null);
  const mergeInitRef = useRef(false);

  const updateServWorkStatSilently = useCallback(async (nextWorkStat, reason = 'unknown') => {
    if (!servCd || !nextWorkStat) return;

    const currentWorkStat = normalizeWorkStat(currentWorkStatRef.current);
    const normalizedNext = normalizeWorkStat(nextWorkStat);

    if (currentWorkStat === normalizedNext) return;

    if (currentWorkStat && !isWorkStatTransitionAllowed(currentWorkStat, normalizedNext)) {
      console.warn(`[WorkToolPage] 비허용 workStat 전이 차단 (${reason}): ${currentWorkStat} -> ${normalizedNext}`);
      return;
    }

    try {
      await updateServWorkStat(servCd, normalizedNext);
      currentWorkStatRef.current = normalizedNext;
    } catch (error) {
      // silent 정책: 저장/진입 흐름은 유지하고 로그만 남긴다.
      console.warn(`[WorkToolPage] workStat 업데이트 실패 (${reason}):`, error);
    }
  }, [servCd]);

  useEffect(() => {
    if (!isPopup) return;
    const handler = (e) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isPopup]);

  // 앱 시작시 저장된 테마 적용
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  // URL query parameter로 role 설정
  useEffect(() => {
    // 연수(training) 모드: URL role 은 START/ANSWER/STUDENT/REVIEW 라서
    // Role enum(START/MID/FINAL/*_REVIEW) 과 매칭되지 않아 setRole 이 스킵되고
    // 이전 세션의 persisted role(MID/FINAL 등) 이 그대로 남아 번역 모드 UI 가
    // 잘못 표시된다. 연수에서는 항상 자막 편집(START) 기준으로 강제한다.
    if (isTrainingMode) {
      setRole(Role.START);
      return;
    }
    if (roleParam) {
      // Role enum 값과 일치하는지 확인
      const upperRole = roleParam.toUpperCase();
      if (Object.values(Role).includes(upperRole)) {
        console.log('[WorkToolPage] role 설정:', upperRole);
        setRole(upperRole);
      } else {
        console.warn(`[WorkToolPage] 유효하지 않은 role: ${roleParam}`);
      }
    }
  }, [roleParam, setRole, isTrainingMode]);

  useEffect(() => {
    if (!workCategoryParam) return;

    if (!workCategory) {
      console.warn(`[WorkToolPage] 유효하지 않은 workCategory: ${workCategoryParam}`);
      return;
    }

    console.log('[WorkToolPage] workCategory 설정:', workCategory);
  }, [workCategoryParam, workCategory]);

  // 서버/로컬 모드 설정
  useEffect(() => {
    // 병합 모드는 별도 effect에서 처리
    if (isMergeMode) {
      setServerMode(true);
      return;
    }
    // URL에 id 또는 fileNo가 있으면 서버 모드, 없으면 로컬 모드
    const isServer = !!(id || fileNo);
    setServerMode(isServer);
    
    // 로컬 모드면 에러 초기화
    if (!isServer) {
      setServerFileError(null);
    }
  }, [id, fileNo, isMergeMode, setServerMode, setServerFileError]);

  // 분할 파일 구간 정보 설정
  useEffect(() => {
    const startSec = searchParams.get('start_sec');
    const endSec = searchParams.get('end_sec');
    if (startSec !== null && endSec !== null) {
      setSplitRange(Number(startSec), Number(endSec));
    } else {
      setSplitRange(null, null);
    }
  }, [searchParams, setSplitRange]);

  // 병합 검수 모드 진입
  useEffect(() => {
    if (!isMergeMode) return;

    const raw = sessionStorage.getItem('soribaro-merge-review');
    if (!raw) return;

    let mergeData;
    try { mergeData = JSON.parse(raw); } catch { return; }
    const { files } = mergeData;
    if (!files || files.length < 1) return;

    // 스토어에 병합 모드 상태 설정 (새로고침 시 복원)
    setServerMode(true);
    setMergeMode(mergeServCd, files);
    setVideoMinimized(true);
    setRole('START_REVIEW');

    // 중복 실행 방지 (StrictMode 대응)
    if (mergeInitRef.current) return;
    mergeInitRef.current = true;

    // 미디어가 이미 로드된 경우 다시 병합하지 않음
    const currentMediaUrl = useSubtitleStore.getState().mediaUrl;
    if (currentMediaUrl) return;

    const initMerge = async () => {
      try {
        // 단일 파일 분할 병합검수: ffmpeg concat 불필요, 원본 파일 그대로 사용
        if (files.length === 1) {
          setMergeProgress('downloading');
          toast.info('파일 로드 중...');
          const result = await getFileStreamUrl(files[0].fileNo);
          const d = result?.data || result;
          const streamUrl = d?.url || d?.streamUrl;
          const fileName = d?.fileName || d?.name || `file_${files[0].fileNo}`;
          if (!streamUrl) {
            toast.error('파일 스트림 URL 발급 실패');
            setMergeProgress(null);
            return;
          }
          const ext = String(fileName).split('.').pop()?.toLowerCase() || 'mp4';
          const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
          const mediaType = videoExts.includes(ext) ? 'video' : 'audio';
          setMediaUrl(streamUrl, mediaType, fileName, null, true);
          setMergeProgress(null);
          toast.success('파일 로드 완료. 자막 로드 중...');
          return;
        }

        setMergeProgress('downloading');
        const blobs = [];
        const fileNames = [];
        for (let i = 0; i < files.length; i++) {
          toast.info(`파일 다운로드 중 (${i + 1}/${files.length})`);
          const result = await getFileDownloadUrl(files[i].fileNo);
          const d = result?.data || result;
          if (d?.url) {
            const resp = await fetch(d.url);
            const blob = await resp.blob();
            const ext = d.fileName?.split('.').pop() || 'mp3';
            blobs.push(blob);
            fileNames.push(`file_${i}.${ext}`);
          }
        }

        if (blobs.length < 2) {
          toast.error('다운로드된 파일이 부족합니다.');
          setMergeProgress(null);
          return;
        }

        setMergeProgress('merging');
        toast.info('미디어 병합 중...');

        // WAV 전용 무손실 병합 시도 → 실패하면 ffmpeg 재인코딩으로 폴백.
        // WAV concat 은 디코딩/인코딩 없이 RIFF 헤더와 PCM 바이트만 합쳐서
        //  - 음질 무손실
        //  - ffmpeg.wasm 로딩 + 인코딩 시간 절감
        //  - 출력이 WAV → WaveformViewer 의 RIFF 스트리밍 파서로 처리되어
        //    대용량 병합 시 decodeAudioData 의 OOM 위험 회피
        let mergedBlob = null;
        let outputExt = null;
        let mediaType = null;

        if (allWavFiles(fileNames)) {
          try {
            mergedBlob = await concatWavFiles(blobs);
            outputExt = 'wav';
            mediaType = 'audio';
          } catch (wavErr) {
            console.warn('[WorkToolPage] WAV 무손실 병합 실패, ffmpeg 폴백:', wavErr.message);
            mergedBlob = null;
          }
        }

        if (!mergedBlob) {
          mergedBlob = await ffmpegService.concatFiles(blobs, fileNames);
          // ffmpegService.concatFiles 는 오디오 입력을 mp3, 영상 입력을 mp4 로
          // 재인코딩하므로 원본 확장자가 아니라 ffmpeg 출력 확장자를 사용해야
          // WaveformViewer 의 포맷 감지(isWAVFile/isMP3File)가 일치한다.
          const inputExt = fileNames[0].split('.').pop()?.toLowerCase();
          const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
          const isVideo = videoExts.includes(inputExt);
          outputExt = isVideo ? 'mp4' : 'mp3';
          mediaType = isVideo ? 'video' : 'audio';
        }

        const mergedUrl = URL.createObjectURL(mergedBlob);
        setMediaUrl(mergedUrl, mediaType, `merged.${outputExt}`, mergedBlob.size);

        setMergeProgress(null);
        toast.success('미디어 병합 완료. 자막 로드 중...');
      } catch (err) {
        console.error('[WorkToolPage] 병합 모드 초기화 실패:', err);
        toast.error('병합 처리 중 오류가 발생했습니다.');
        setMergeProgress(null);
      }
    };

    initMerge();
  }, [isMergeMode, mergeServCd]);

  // 연수(Training) 모드: trainingFileId 가 있으면 자동으로 미디어 + waveform 로딩
  useEffect(() => {
    if (!isTrainingMode || !trainingFileId) return;

    let aborted = false;

    // (1) 본 파일 playback URL — 실패하면 모드 자체가 의미 없으니 에러 toast
    // (2) waveform URL — 404 포함 실패는 무시 (파형 없이도 워크툴은 동작)
    (async () => {
      // 매 진입마다 이전 override 를 클리어해서 잔여 URL 로 잘못 로드되는 것을 막는다.
      setServerWaveformOverrideUrl(null);

      try {
        const res = await getTrainingFilePlaybackUrl(trainingFileId);
        if (aborted) return;
        const data = res?.data ?? res;
        const playbackUrl = data?.playbackUrl;
        const fileName = data?.name || '';
        const format = data?.format || '';
        if (!playbackUrl) {
          toast.error('연수 파일 재생 URL을 발급하지 못했습니다.');
          return;
        }
        const ext = String(format).toLowerCase().replace(/^\./, '');
        const videoExts = ['mp4', 'mov', 'mkv', 'webm', 'avi'];
        const mediaType = videoExts.includes(ext) ? 'video' : 'audio';
        setMediaUrl(playbackUrl, mediaType, fileName, null, true);
        // WaveformViewer 의 server 분기 진입 조건(fileId + isServerFile) 충족.
        setFileId(trainingFileId);
        if (fileName) {
          toast.info(fileName);
        }
      } catch (error) {
        console.error('[WorkToolPage] training playback URL failed:', error);
        toast.error('연수 파일을 불러오지 못했습니다.');
      }
    })();

    (async () => {
      try {
        const wfRes = await getTrainingWaveformDownloadUrl(trainingFileId);
        if (aborted) return;
        const wfData = wfRes?.data ?? wfRes;
        const wfUrl = wfData?.url;
        if (wfUrl) {
          setServerWaveformOverrideUrl(wfUrl);
        }
      } catch (error) {
        // 404 등은 정상(파형 미등록 파일) — 워크툴은 그대로 진행
        console.warn(
          '[WorkToolPage] training waveform URL 없음/실패 (무시):',
          error?.message || error,
        );
      }
    })();

    return () => {
      aborted = true;
    };
  }, [
    isTrainingMode,
    trainingFileId,
    setMediaUrl,
    setFileId,
    setServerWaveformOverrideUrl,
  ]);

  // 연수(Training) START 목업 모드: trainingFileId 없이 사이드바에서 그냥 띄운 경우
  // (mode=training&role=START&popup=true) 는 더 이상 실데이터를 받지 않는 "목업 화면"이다.
  // 파형/미디어/자막이 비어 보이지 않도록 번들된 샘플 음성 + 더미 자막을 주입한다.
  useEffect(() => {
    if (!isTrainingMode || trainingSubRole !== 'START') return;
    if (trainingFileId) return; // 실제 연수 파일이 지정된 경우는 위 effect 가 처리

    // 로컬 모드로 두어 WaveformViewer 가 mediaUrl 에서 직접 파형을 생성하게 한다.
    setServerMode(false);
    setServerFileError(null);
    const sampleUrl = `${import.meta.env.BASE_URL}mock/sample-voice.wav`;
    setMediaUrl(sampleUrl, 'audio', 'sample-voice.wav');
    setSubtitles(mockWorktoolSubtitles());
  }, [
    isTrainingMode,
    trainingSubRole,
    trainingFileId,
    setServerMode,
    setServerFileError,
    setMediaUrl,
    setSubtitles,
  ]);

  // URL 파라미터 출력 및 파일 다운로드 URL 조회
  useEffect(() => {
    if (isMergeMode) return;
    if (isTrainingMode) return;

    // 미디어를 불러올 파일 ID 결정 (새 라우트의 fileNo 우선, 없으면 기존 id)
    const targetFileId = fileNo || id;

    if (targetFileId) {
      console.log('[WorkToolPage] targetFileId:', targetFileId);
      if (projectFileId) console.log('[WorkToolPage] projectFileId:', projectFileId);
      if (servCd) console.log('[WorkToolPage] servCd:', servCd);
      
      // 파일 스트리밍 URL 조회 및 미디어 열기 (v9: Content-Disposition: inline, 1일 유효)
      getFileStreamUrl(targetFileId)
        .then((result) => {
          console.log('getFileStreamUrl result:', result);

          const d = result?.data || result;
          if (d?.url) {
            const fileName = d.fileName;
            const extension = fileName?.split('.').pop()?.toLowerCase();
            const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
            const mediaType = videoExtensions.includes(extension) ? 'video' : 'audio';

            setMediaUrl(d.url, mediaType, fileName, null, true);
            setServerFileError(null);
          } else {
            setServerFileError('파일을 찾을 수 없습니다.');
          }
        })
        .catch((error) => {
          console.log('getFileStreamUrl error:', error);
          setServerFileError('파일을 불러올 수 없습니다.');
        });
      
      // 파일 ID 저장 (SubtitleList에서 자막 로드에 사용)
      setFileId(targetFileId);
    }
    if (step) {
      console.log('step:', step);
    }
  }, [id, fileNo, projectFileId, servCd, step, isMergeMode, isTrainingMode, setMediaUrl, setFileId, setServerFileError]);

  // role에 따라 getProjectFileInfo 조회
  useEffect(() => {
    if (!servCd || !fileNo || !roleParam) return;

    // role에서 기본 유형 추출 (_REVIEW 접미사 제거)
    const baseType = roleParam.toUpperCase().replace('_REVIEW', '');

    // 유형별 조회 대상 결정
    const TYPE_QUERY_MAP = {
      'START': ['START'],
      'MID': ['START', 'MID'],
      'FINAL': ['START', 'MID', 'FINAL'],
    };

    const typesToQuery = TYPE_QUERY_MAP[baseType];
    if (!typesToQuery) {
      console.warn(`[WorkToolPage] 알 수 없는 프로젝트 유형: ${baseType}`);
      return;
    }

    typesToQuery.forEach((type) => {
      getProjectFileInfo(servCd, type, fileNo)
        .then((result) => {
          console.log(`[WorkToolPage] getProjectFileInfo (type=${type}):`, result);
        })
        .catch((error) => {
          console.error(`[WorkToolPage] getProjectFileInfo (type=${type}) error:`, error);
        });
    });
  }, [servCd, fileNo, roleParam]);

  // 현재 서비스 상태 조회(중복 전이 방지용)
  useEffect(() => {
    if (!servCd) return;

    getServByServCd(servCd)
      .then((result) => {
        if (result?.status === 'SUCCESS') {
          currentWorkStatRef.current = normalizeWorkStat(result?.data?.workStat);
        }
      })
      .catch((error) => {
        console.warn('[WorkToolPage] 현재 workStat 조회 실패:', error);
      });
  }, [servCd]);

  // 작업 페이지 진입 시 project_files.status 전이
  useEffect(() => {
    if (!projectFileId) return;

    const isReviewRole = roleParam?.toUpperCase().includes('_REVIEW');

    const updateStatusIfNeeded = async () => {
      try {
        const res = await getProjectFileById(projectFileId);
        if (res?.status !== 'SUCCESS') return;
        const currentStatus = res.data?.status;

        if (!isReviewRole && currentStatus === 'STANDBY') {
          await updateProjectFile(projectFileId, { status: 'WORKING' });
          console.log('[WorkToolPage] project_files.status: STANDBY → WORKING');
          const entryWorkStat = getEntryWorkStatByRole(roleParam || Role.START);
          await updateServWorkStatSilently(entryWorkStat, 'worktool-entry');
        } else if (isReviewRole && currentStatus === 'WORK_DONE') {
          await updateProjectFile(projectFileId, { status: 'REVIEWING' });
          console.log('[WorkToolPage] project_files.status: WORK_DONE → REVIEWING');
          const entryWorkStat = getEntryWorkStatByRole(roleParam || Role.START);
          await updateServWorkStatSilently(entryWorkStat, 'worktool-entry');
        } else if (!isReviewRole && currentStatus === 'REVIEW_REJECT') {
          await updateProjectFile(projectFileId, { status: 'WORKING' });
          console.log('[WorkToolPage] project_files.status: REVIEW_REJECT → WORKING');
          const entryWorkStat = getEntryWorkStatByRole(roleParam || Role.START);
          await updateServWorkStatSilently(entryWorkStat, 'worktool-entry');
        }
      } catch (error) {
        console.error('[WorkToolPage] project_files status 변경 실패:', error);
      }
    };

    updateStatusIfNeeded();
  }, [projectFileId, roleParam, updateServWorkStatSilently]);

  // 전역 단축키: 재생/일시정지 (Shift + Space), 시간 이동 (Shift + ←/→)
  const handleGlobalKeyDown = useCallback((e) => {
    const media = document.querySelector('video, audio');
    const shortcutId = getShortcutId(e);

    // Shift + Space: 재생/일시정지 (input/textarea 포함 어디서든 동작)
    if (shortcutId === 'playPause') {
      e.preventDefault();
      if (media) {
        if (media.paused) {
          media.play();
        } else {
          media.pause();
        }
      }
      return;
    }

    // 그 외 단축키는 input/textarea에서 무시
    const tagName = e.target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea') return;
    // Shift + ←: 뒤로 시간 이동
    else if (shortcutId === 'seekBackward') {
      e.preventDefault();
      if (media) {
        const minTime = splitStartSec ?? 0;
        const maxTime = splitEndSec ?? (Number.isFinite(media.duration) ? media.duration : Infinity);
        const nextTime = media.currentTime - mediaSeekStepSec;
        media.currentTime = Math.max(minTime, Math.min(nextTime, maxTime));
      }
    }
    // Shift + →: 앞으로 시간 이동
    else if (shortcutId === 'seekForward') {
      e.preventDefault();
      if (media) {
        const minTime = splitStartSec ?? 0;
        const maxTime = splitEndSec ?? (Number.isFinite(media.duration) ? media.duration : Infinity);
        const nextTime = media.currentTime + mediaSeekStepSec;
        media.currentTime = Math.max(minTime, Math.min(nextTime, maxTime));
      }
    }
  }, [getShortcutId, mediaSeekStepSec, splitStartSec, splitEndSec]);

  // 전역 키보드 이벤트 리스너
  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  return (
    <div className="worktool-page">
      {mergeProgress && (
        <div className="merge-progress-overlay">
          <div className="merge-progress-card">
            <div className="merge-progress-spinner" />
            <p>
              {mergeProgress === 'downloading' && '파일 다운로드 중...'}
              {mergeProgress === 'merging' && '미디어 병합 중...'}
              {mergeProgress === 'subtitles' && '자막 병합 중...'}
            </p>
          </div>
        </div>
      )}
      <Toolbar />
      <WidgetLayout workCategory={workCategory} />
      <ConfirmModal />
      
      {/* 검수 모달 (전체 화면 기준) */}
      <ValidationModal 
        isOpen={isValidationOpen} 
        onClose={closeValidation}
      />
      
      {/* Netflix QC 모달 */}
      <NetflixQCModal />

      {/* 연수 모드 오버레이 (ANSWER prefill, STUDENT prefill+제출+잠금) */}
      {isTrainingMode && trainingSubRole !== 'START' && (
        <TrainingWorktoolOverlay
          role={trainingSubRole}
          assignmentId={trainingAssignmentId}
          trainingFileId={trainingFileId}
          assignmentStudentId={trainingAssignmentStudentId}
        />
      )}
    </div>
  );
}
