/**
 * 연수 워크툴 오버레이
 *
 * WorkToolPage 에서 mount 되어 다음을 담당:
 *   - mode=training & role=ANSWER:
 *       진입 시 기존 정답지(있으면) 를 prefill (자막 store 로 주입)
 *       — 미디어/파형은 WorkToolPage 의 trainingFileId 분기가 처리.
 *   - mode=training & role=STUDENT:
 *       진입 시 1) 본인 배정 메타(트레이닝 파일) 조회 → trainingFileId 결정,
 *               2) 최신 WORK revision 자막(있으면) prefill,
 *               3) submitted 상태면 워크툴 잠금(read-only) + 결과 패널 표시,
 *       4) 우상단 floating [제출] 버튼 + 결과 모달.
 *
 * 자막 prefill 은 자막 store 의 setSubtitles 를 사용.
 * 저장은 SubtitleList 의 handleSaveClick 이 자체 분기 처리.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubtitleStore } from '../../stores/subtitleStore';
import { useSpeakerStore } from '../../stores/speakerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTrainingActionStore } from '../../stores/trainingActionStore';
import { toast } from '../../stores/toastStore';
import { confirm } from '../../stores/modalStore';
import { parseSubtitleJson } from '../../utils/subtitleJsonFormat';
import {
  getAnswer,
} from '../../api/v9/training/assignments';
import {
  getMyAssignment,
  getMyLatestWork,
  getMyAnswerForGrading,
  submitMyAssignment,
  getMyEvaluation,
} from '../../api/v9/training/trainee';
import {
  getTrainingFilePlaybackUrl,
  getTrainingWaveformDownloadUrl,
} from '../../api/v9';
import { computeAccuracyComparison } from '../../utils/accuracyScore';
import { accuracyColor } from './ScoreTable';

/**
 * 학생 자막 + 정답지 자막 → 정확도 산출.
 * 메인 에디터 AccuracyModal 과 동일한 어절단위 코어(computeAccuracyComparison)를 사용한다.
 * 반환: { accuracy, errorCount, formErrorCount, reason }
 */
function gradeSubtitles(studentSubs, answerSubs) {
  const speakers = useSpeakerStore.getState().speakers || {};
  const core = computeAccuracyComparison({
    originalSubtitles: answerSubs,   // 정답 = 기준
    currentSubtitles: studentSubs,   // 학생 = 비교
    speakers,
  });

  // 비교 대상이 비면 코어가 null → 채점 불가 폴백.
  if (!core) {
    return { accuracy: 0, errorCount: 0, formErrorCount: 0, reason: '{}' };
  }

  // 정확도: 어절단위 (0~100, 소수 2자리)
  const accuracy = Math.round((core.overallAccuracy ?? 0) * 100) / 100;

  // 오류 분류 (AccuracyModal 기준):
  //  - 텍스트 오류: typo + omission + addition
  //  - 형식 오류: space + punc
  const c = core.errorCounts || {};
  const errorCount = (c.typo || 0) + (c.omission || 0) + (c.addition || 0);
  const formErrorCount = (c.space || 0) + (c.punc || 0);

  const reason = JSON.stringify({
    version: 2,
    answerCueCount: answerSubs.length,
    studentCueCount: studentSubs.length,
    accuracy,
    errorCount,
    formErrorCount,
    errorCounts: c,
    matchedWords: core.matchedWords,
    totalRefWords: core.totalRefWords,
    rows: (core.alignedRows || []).slice(0, 500).map((r) => ({
      kind: r.kind,
      orig: r.origIdx != null ? (core.sortedOrig[r.origIdx]?.text || '') : null,
      curr: r.currIdx != null ? (core.sortedCurr[r.currIdx]?.text || '') : null,
    })),
  });

  return { accuracy, errorCount, formErrorCount, reason };
}

/**
 * 자막 envelope JSON → 자막 배열로 변환.
 * parseSubtitleJson 의 응답 shape 가 환경에 따라 다를 수 있어 안전한 폴백 적용.
 */
function decodeSubtitle(subtitleStr) {
  if (!subtitleStr) return [];
  try {
    const parsed = parseSubtitleJson(subtitleStr);
    const list = parsed?.subtitles || parsed?.data || parsed;
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn('[TrainingWorktoolOverlay] subtitle decode failed:', e);
    return [];
  }
}

/**
 * envelope 의 speakers + subtitles 를 store 로 복원.
 * - speakerStore: trainingFileId 를 localStorage 키로 사용해 다음 진입에도 살아남도록 함.
 *   envelope.speakers 가 있으면 단일 진실로 보고 store 를 덮어쓴다 — 그렇지 않으면
 *   재진입 시 cue 의 speakerId 가 어떤 화자도 가리키지 않아 드롭다운이 "미할당" 으로
 *   보이는 버그 발생.
 * - subtitles 배열만 반환 (호출자가 필요 시 setSubtitles 로 주입).
 */
function decodeEnvelopeAndRestoreSpeakers(subtitleStr, trainingFileId) {
  if (!subtitleStr) {
    if (trainingFileId) {
      useSpeakerStore.getState().loadSpeakersForFile(String(trainingFileId));
    }
    return [];
  }
  let parsed = null;
  try {
    parsed = parseSubtitleJson(subtitleStr);
  } catch (e) {
    console.warn('[TrainingWorktoolOverlay] envelope decode failed:', e);
  }
  const store = useSpeakerStore.getState();
  if (trainingFileId) {
    store.loadSpeakersForFile(String(trainingFileId));
  }
  if (parsed && Array.isArray(parsed.speakers) && parsed.speakers.length > 0) {
    store.clearAllSpeakers();
    parsed.speakers.forEach((s) => {
      const num = Number(s?.number);
      if (Number.isInteger(num) && num >= 1 && num <= 100) {
        store.addSpeakerWithNumber(num, s?.name || '');
      }
    });
  }
  const list = parsed?.subtitles || parsed?.data || parsed;
  return Array.isArray(list) ? list : [];
}

export default function TrainingWorktoolOverlay({
  role, // 'ANSWER' | 'STUDENT' | 'START' | 'REVIEW'
  assignmentId,
  trainingFileId,
  assignmentStudentId,
}) {
  const { t } = useTranslation('common');
  const setSubtitles = useSubtitleStore((s) => s.setSubtitles);
  const setMediaUrl = useSubtitleStore((s) => s.setMediaUrl);
  const setFileId = useSubtitleStore((s) => s.setFileId);
  const setServerWaveformOverrideUrl = useSubtitleStore(
    (s) => s.setServerWaveformOverrideUrl,
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resultEval, setResultEval] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const initRef = useRef(false);

  // SubtitleList toolbar 의 [제출] / [결과] 버튼이 트리거하는 nonce
  const submitNonce = useTrainingActionStore((s) => s.submitNonce);
  const showResultNonce = useTrainingActionStore((s) => s.showResultNonce);
  const setStudentSubmitted = useTrainingActionStore((s) => s.setStudentSubmitted);
  const setStudentHasResult = useTrainingActionStore((s) => s.setStudentHasResult);
  const resetActionStore = useTrainingActionStore((s) => s.reset);
  const lastSubmitNonceRef = useRef(submitNonce);
  const lastShowResultNonceRef = useRef(showResultNonce);

  // mount/unmount 시 액션 store 초기화 — 다른 진입에 잔여 상태 누수 방지
  useEffect(() => {
    resetActionStore();
    return () => resetActionStore();
  }, [resetActionStore]);

  // submitted / resultEval 변화를 store 에 publish — SubtitleList 가 구독
  useEffect(() => {
    setStudentSubmitted(role === 'STUDENT' && submitted);
  }, [role, submitted, setStudentSubmitted]);

  useEffect(() => {
    setStudentHasResult(role === 'STUDENT' && !!resultEval);
  }, [role, resultEval, setStudentHasResult]);

  // ── REVIEW 모드: 관리자가 학생 자막을 읽기 전용으로 확인 ──
  // SUBMIT 이 있으면 그것을, 없으면 최신 WORK 를 prefill. 미디어/파형은 URL 의
  // trainingFileId 로 WorkToolPage 분기가 자동 로드. readonly=true 가 SubtitleList
  // 의 편집을 막아준다 (저장/제출 버튼도 안 보임).
  useEffect(() => {
    if (role !== 'REVIEW') return;
    if (!assignmentId || !assignmentStudentId) return;
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        const mod = await import('../../api/v9/training/assignments');
        const res = await mod.getStudentReviewWork(assignmentId, assignmentStudentId);
        const data = res?.data ?? res;
        const list = decodeEnvelopeAndRestoreSpeakers(data?.subtitle, trainingFileId);
        if (list.length > 0) {
          setSubtitles(list);
          toast.info(t('training.reviewMode.loaded', { defaultValue: t('training.answer.upload') }));
        } else {
          toast.info(t('training.reviewMode.emptyWork', { defaultValue: t('training.student.notSubmitted') }));
        }
      } catch (err) {
        console.error('[TrainingWorktoolOverlay] review work fetch failed:', err);
        toast.error(err?.message || t('training.errors.loadFailed'));
      }
    })();
  }, [role, assignmentId, assignmentStudentId, setSubtitles, t]);

  // ── ANSWER 모드: 기존 정답지 prefill ──
  // 정답지는 trainingFileId 단위 — assignmentId 는 backward-compat 으로만 받고
  // 강제하지 않는다 (연수 파일 관리에서 직접 진입하는 경로 지원).
  useEffect(() => {
    if (role !== 'ANSWER') return;
    if (!trainingFileId) return;
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        const res = await getAnswer(trainingFileId);
        const data = res?.data ?? res;
        const list = decodeEnvelopeAndRestoreSpeakers(data?.subtitle, trainingFileId);
        if (list.length > 0) {
          setSubtitles(list);
          toast.info(t('training.answer.upload'));
        }
      } catch (err) {
        // 404 (정답지 미작성) 는 정상
        if (err?.status !== 404) {
          console.warn('[TrainingWorktoolOverlay] answer prefill failed:', err);
        }
      }
    })();
  }, [role, assignmentId, trainingFileId, setSubtitles, t]);

  // ── STUDENT 모드: 배정 메타 + 미디어/파형 + 최신 WORK + 제출 상태 ──
  useEffect(() => {
    if (role !== 'STUDENT') return;
    if (!assignmentStudentId) return;
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      let myTrainingFileId = trainingFileId;
      let isAlreadySubmitted = false;
      try {
        const res = await getMyAssignment(assignmentStudentId);
        // 응답: { assignment, latestWorkRevision, submitRevision, evaluation }
        const detail = res?.data ?? res;
        const assignment = detail?.assignment ?? detail;
        myTrainingFileId = assignment?.trainingFileId || myTrainingFileId;
        if (assignment?.status === 'SUBMITTED' || assignment?.status === 'SCORED') {
          isAlreadySubmitted = true;
        }
      } catch (err) {
        console.error('[TrainingWorktoolOverlay] getMyAssignment failed:', err);
        toast.error(err?.message || t('training.errors.loadFailed'));
      }

      // 미디어/파형 — URL 에 trainingFileId 가 있으면 WorkToolPage 의 training 분기가
      // 이미 미디어/파형을 발급한다. 폴백: URL 에 없을 때만 본인 배정에서 추출해 보충.
      if (!trainingFileId && myTrainingFileId) {
        try {
          const r = await getTrainingFilePlaybackUrl(myTrainingFileId);
          const d = r?.data ?? r;
          if (d?.playbackUrl) {
            const ext = String(d.format || '').toLowerCase().replace(/^\./, '');
            const videoExts = ['mp4', 'mov', 'mkv', 'webm', 'avi'];
            const mediaType = videoExts.includes(ext) ? 'video' : 'audio';
            setMediaUrl(d.playbackUrl, mediaType, d.name || '', null, true);
            setFileId(myTrainingFileId);
          }
        } catch (err) {
          console.warn('[TrainingWorktoolOverlay] training playback url failed:', err);
        }
        try {
          const wf = await getTrainingWaveformDownloadUrl(myTrainingFileId);
          const wfUrl = wf?.data?.url ?? wf?.url;
          if (wfUrl) setServerWaveformOverrideUrl(wfUrl);
        } catch {
          /* 파형 없음은 정상 */
        }
      }

      // 최신 WORK 자막 prefill — 신규 진입(404 등) 이어도 화자 store 의 fileId 는 맞춰 둔다
      try {
        const r = await getMyLatestWork(assignmentStudentId);
        const list = decodeEnvelopeAndRestoreSpeakers(
          r?.data?.subtitle ?? r?.subtitle,
          myTrainingFileId || trainingFileId,
        );
        if (list.length > 0) setSubtitles(list);
      } catch {
        // 신규 진입 — envelope 가 없어도 currentProjectFileId 만큼은 설정해서
        // 사용자가 추가하는 화자가 localStorage 로 영속되도록 한다.
        const fid = myTrainingFileId || trainingFileId;
        if (fid) useSpeakerStore.getState().loadSpeakersForFile(String(fid));
      }

      // 이미 제출됨 → read-only 모드 + 결과 표시
      if (isAlreadySubmitted) {
        setSubmitted(true);
        try {
          const r = await getMyEvaluation(assignmentStudentId);
          setResultEval(r?.data ?? r);
        } catch {
          /* 결과 못 받아도 잠금만 유지 */
        }
        toast.info(t('training.submit.locked'));
      }
    })();
  }, [
    role,
    assignmentStudentId,
    trainingFileId,
    setSubtitles,
    setMediaUrl,
    setFileId,
    setServerWaveformOverrideUrl,
    t,
  ]);

  // ── 제출 ──
  const handleSubmit = useCallback(async () => {
    if (role !== 'STUDENT' || !assignmentStudentId) return;
    if (submitted) {
      toast.info(t('training.submit.alreadySubmitted'));
      return;
    }
    const ok = await confirm(t('training.submit.confirm'), {
      title: t('training.submit.title'),
      confirmText: t('training.submit.button'),
      cancelText: t('training.cancel'),
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      // 1) 학생 자막 envelope 직렬화 — SubtitleList 의 buildSubtitleEnvelope 와 일치
      const { serializeSubtitleJson } = await import('../../utils/subtitleJsonFormat');
      const studentSubtitles = useSubtitleStore.getState().subtitles;
      const frameRate = useSubtitleStore.getState().frameRate || 30;
      const settings = useSettingsStore.getState();
      const { secondsToTimeCode } = await import('../../utils/timeUtils');
      const { useSpeakerStore } = await import('../../stores/speakerStore');
      const allSpeakers = useSpeakerStore.getState().speakers;
      const studentEnvelope = serializeSubtitleJson({
        permission: 'FINAL',
        frameRate,
        languages: settings?.languages || {},
        speakers: Object.values(allSpeakers).sort((a, b) => a.number - b.number),
        subtitles: studentSubtitles.map((sub) => ({
          id: sub.id,
          startTime: sub.startTime,
          endTime: sub.endTime,
          start: secondsToTimeCode(sub.startTime),
          end: secondsToTimeCode(sub.endTime),
          text: sub.text || '',
          speaker: sub.speakerId != null ? String(sub.speakerId) : '',
          speakerId: sub.speakerId ?? null,
          position: sub.position || 'bottomCenter',
        })),
      });

      // 2) 정답지 fetch
      let answerSubs = [];
      try {
        const ansRes = await getMyAnswerForGrading(assignmentStudentId);
        answerSubs = decodeSubtitle(ansRes?.data?.subtitle ?? ansRes?.subtitle);
      } catch (err) {
        console.error('[TrainingWorktoolOverlay] answer fetch failed:', err);
        if (err?.status === 404) {
          toast.error(t('training.submit.answerMissing'));
          setSubmitting(false);
          return;
        }
        // 정답지 fetch 실패 — 채점 없이 SUBMIT 만 시도 (백엔드가 채점하지 않을 수 있음)
      }

      // 3) 채점
      const grading = answerSubs.length
        ? gradeSubtitles(studentSubtitles, answerSubs)
        : { accuracy: 0, errorCount: 0, formErrorCount: 0, reason: '{}' };

      // 4) SUBMIT
      const submitRes = await submitMyAssignment(assignmentStudentId, {
        subtitle: studentEnvelope,
        accuracy: grading.accuracy,
        errorCount: grading.errorCount,
        formErrorCount: grading.formErrorCount,
        reason: grading.reason,
      });
      // 채점 결과는 수강생에게 노출하지 않는다 — 제출 완료 toast 만 띄우고
      // 결과 모달은 표시하지 않는다. setResultEval 도 store publish 도 생략.
      setSubmitted(true);
      toast.success(t('training.submit.submitted'));
    } catch (err) {
      console.error('[TrainingWorktoolOverlay] submit failed:', err);
      if (err?.status === 409) {
        toast.error(t('training.submit.alreadySubmitted'));
        setSubmitted(true);
      } else {
        toast.error(err?.message || t('training.submit.failed'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [role, assignmentStudentId, submitted, t]);

  // SubtitleList toolbar 의 [제출] 버튼이 store nonce 를 증가시키면 제출 로직 실행
  useEffect(() => {
    if (submitNonce === lastSubmitNonceRef.current) return;
    lastSubmitNonceRef.current = submitNonce;
    if (role === 'STUDENT') handleSubmit();
  }, [submitNonce, role, handleSubmit]);

  // [결과] 버튼 트리거는 STUDENT 모드에서 비활성 — 수강생에게 결과 미노출 정책.
  // (nonce 만 ref 에 동기화하여 의도치 않은 모달 표시를 막는다)
  useEffect(() => {
    if (showResultNonce === lastShowResultNonceRef.current) return;
    lastShowResultNonceRef.current = showResultNonce;
  }, [showResultNonce]);

  // ANSWER / STUDENT / REVIEW 만 오버레이 노출. (START 는 시연 모드라 별도 UI 없음)
  // 모드 인디케이터(chip) 는 Toolbar 가 app-title 우측에 표시 — 여기서 별도 렌더 X.
  if (role !== 'STUDENT' && role !== 'ANSWER' && role !== 'REVIEW') return null;

  return (
    <>
      {/* 결과 모달 — notion-modal 구조로 CSS 시스템과 통일 */}
      {showResult && resultEval && (
        <div className="notion-modal-overlay" onClick={() => setShowResult(false)}>
          <div
            className="notion-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ minWidth: '420px' }}
          >
            <div className="notion-modal-header">
              <h3>{t('training.submit.resultTitle')}</h3>
              <button
                type="button"
                className="notion-modal-close"
                onClick={() => setShowResult(false)}
              >
                &times;
              </button>
            </div>
            <div className="notion-modal-body">
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <ResultCell label={t('training.score.accuracy')} value={resultEval.accuracy} type="accuracy" />
                <ResultCell label={t('training.score.errorCount')} value={resultEval.errorCount} />
                <ResultCell label={t('training.score.formError')} value={resultEval.formErrorCount} />
              </div>
            </div>
            <div className="notion-modal-footer">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowResult(false)}
              >
                {t('training.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultCell({ label, value, type }) {
  const color = type === 'accuracy' ? accuracyColor(value) : 'inherit';
  return (
    <div style={{ minWidth: '110px' }}>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color }}>
        {value == null ? '-' : type === 'accuracy' ? `${Number(value).toFixed(2)}%` : value}
      </div>
    </div>
  );
}
