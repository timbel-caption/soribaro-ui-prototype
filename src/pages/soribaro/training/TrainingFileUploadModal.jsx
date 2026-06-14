/**
 * 연수 파일 업로드 모달 (관리자 전용)
 *
 * - 영상/음성 라디오 없음 — 확장자 화이트리스트로 분류
 * - HTML5 <video>/<audio> 메타로 duration(초, 정수) 자동 측정
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadTrainingFile } from '../../../api/v9/training';
import { generateWaveformArrayBuffer } from '../../../utils/waveformGen';
import { uploadTrainingWaveformToServer } from '../../../utils/trainingWaveformUpload';
import { toast } from '../../../stores/toastStore';
import '../../../styles/notion-list.css';

const ALLOWED_EXTENSIONS = ['mp4', 'mov', 'mkv', 'webm', 'mp3', 'wav', 'm4a', 'flac'];
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'webm']);
const TITLE_MAX = 256;
const DESC_MAX = 1000;

function getExtension(name) {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  if (i === -1 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
}

async function readMediaDuration(file, ext) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const isVideo = VIDEO_EXTENSIONS.has(ext);
    const el = document.createElement(isVideo ? 'video' : 'audio');
    el.preload = 'metadata';
    el.muted = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      el.src = '';
    };

    const onMeta = () => {
      const d = el.duration;
      cleanup();
      if (Number.isFinite(d) && d > 0) {
        resolve(Math.round(d));
      } else {
        resolve(null);
      }
    };

    el.onloadedmetadata = onMeta;
    el.onerror = () => {
      cleanup();
      resolve(null);
    };
    el.src = url;
  });
}

export default function TrainingFileUploadModal({ open, onClose, onUploaded }) {
  const { t } = useTranslation('common');
  const fileInputRef = useRef(null);

  // 부모(TrainingFilesPage)가 open=false 일 때 컴포넌트를 unmount 하므로
  // 매 진입마다 새로 마운트 → useState 기본값이 자동으로 초기화된다.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  // 단계: 'idle' | 'waveform' | 'upload' | 'waveformUpload'
  const [stage, setStage] = useState('idle');
  const [errors, setErrors] = useState({});
  const abortRef = useRef(null);

  const handleFileChange = useCallback(
    async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const ext = getExtension(f.name);
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setErrors((prev) => ({
          ...prev,
          file: t('training.validation.invalidExtension', {
            allowed: ALLOWED_EXTENSIONS.join(', '),
          }),
        }));
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setErrors((prev) => ({ ...prev, file: undefined }));
      setFile(f);
      try {
        const d = await readMediaDuration(f, ext);
        setDuration(d);
      } catch {
        setDuration(null);
      }
    },
    [t]
  );

  const handleSubmit = useCallback(async () => {
    const next = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) next.title = t('training.validation.titleRequired');
    else if (trimmedTitle.length > TITLE_MAX) next.title = t('training.validation.titleTooLong');
    if (description.length > DESC_MAX) next.description = t('training.validation.descriptionTooLong');
    if (!file) next.file = t('training.validation.fileRequired');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    setProgress(0);
    setStage('waveform');

    const abortController = new AbortController();
    abortRef.current = abortController;

    let waveformArrayBuffer = null;

    // ── (1) 파형 분석: 0~40% ──
    // 실패해도 본 파일 등록은 진행 (warn 로그만). 사용자 경험 우선.
    try {
      waveformArrayBuffer = await generateWaveformArrayBuffer(file, {
        signal: abortController.signal,
        onProgress: (p) => setProgress(Math.round(p * 0.4)),
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        setSubmitting(false);
        setStage('idle');
        abortRef.current = null;
        return;
      }
      console.warn('[TrainingFileUploadModal] waveform 생성 실패 (계속):', err?.message || err);
      waveformArrayBuffer = null;
    }
    setProgress(40);

    if (abortController.signal.aborted) {
      setSubmitting(false);
      setStage('idle');
      abortRef.current = null;
      return;
    }

    // ── (2) 본 파일 업로드: 40~80% ──
    let trainingFileId = null;
    try {
      setStage('upload');
      const meta = {
        title: trimmedTitle,
        ...(description ? { description } : {}),
        ...(duration ? { duration } : {}),
      };
      const res = await uploadTrainingFile({
        file,
        meta,
        onProgress: (p) => setProgress(40 + Math.round(p * 0.4)),
      });
      // 응답 envelope 의 id 위치 — 정확한 위치 모를 때를 위한 fallback 체인.
      trainingFileId =
        res?.data?.id ?? res?.id ?? res?.data?.trainingFileId ?? null;
      setProgress(80);
    } catch (err) {
      console.error('[TrainingFileUploadModal] upload failed:', err);
      toast.error(err?.message || t('training.errors.uploadFailed'));
      setSubmitting(false);
      setStage('idle');
      abortRef.current = null;
      return;
    }

    // ── (3) 파형 업로드 + 메타 저장: 80~100% ──
    // 본 파일 등록은 이미 성공한 상태이므로 실패는 warn 로그만 + 모달은 정상 종료.
    if (waveformArrayBuffer && trainingFileId) {
      try {
        setStage('waveformUpload');
        await uploadTrainingWaveformToServer(trainingFileId, waveformArrayBuffer, {
          signal: abortController.signal,
          onProgress: (p) => setProgress(80 + Math.round(p * 0.2)),
        });
      } catch (err) {
        if (err?.name === 'AbortError') {
          console.warn('[TrainingFileUploadModal] 파형 업로드 취소 — 본 파일은 남음');
        } else {
          console.warn(
            '[TrainingFileUploadModal] 파형 업로드/메타 저장 실패 (본 파일은 등록됨):',
            err?.message || err,
          );
        }
      }
    } else if (!trainingFileId) {
      console.warn('[TrainingFileUploadModal] 업로드 응답에서 trainingFileId 추출 실패 — 파형 업로드 건너뜀');
    }

    setProgress(100);
    setStage('idle');
    abortRef.current = null;

    toast.success(t('training.register'));
    if (typeof onUploaded === 'function') onUploaded();
    onClose?.();
  }, [title, description, file, duration, onUploaded, onClose, t]);

  const handleClose = useCallback(() => {
    if (submitting) {
      // 진행 중 닫기 시도 시 모든 단계 abort 신호를 보낸다.
      abortRef.current?.abort();
      return;
    }
    onClose?.();
  }, [submitting, onClose]);

  // ESC 로 닫기 지원 — 진행 중일 땐 abort 동작
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  if (!open) return null;

  const stageLabel =
    stage === 'waveform'
      ? t('training.stage.waveform', { percent: progress })
      : stage === 'upload'
      ? t('training.stage.upload', { percent: progress })
      : stage === 'waveformUpload'
      ? t('training.stage.waveformUpload', { percent: progress })
      : t('training.uploadProgress', { percent: progress });

  return (
    <div className="notion-modal-overlay" onClick={handleClose}>
      <div className="notion-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notion-modal-header">
          <h3>{t('training.uploadTitle')}</h3>
          <button
            type="button"
            className="notion-modal-close"
            onClick={handleClose}
            disabled={submitting}
            aria-label="close"
          >
            &times;
          </button>
        </div>

        <div className="notion-modal-body">
          <div className="form-group">
            <label>{t('training.fields.title')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              disabled={submitting}
              placeholder={t('training.fields.title')}
            />
            {errors.title && (
              <span className="form-error">{errors.title}</span>
            )}
          </div>

          <div className="form-group">
            <label>{t('training.fields.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESC_MAX}
              disabled={submitting}
              rows={4}
              placeholder={t('training.fields.description')}
            />
            <span className="form-hint">
              {errors.description || `${description.length} / ${DESC_MAX}`}
            </span>
          </div>

          <div className="form-group">
            <label>{t('training.fields.file')}</label>
            <div className="training-file-pick-row">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
              >
                {t('training.selectFile')}
              </button>
              <span className="training-file-name">
                {file ? file.name : t('training.noFileSelected')}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {file && duration != null && (
              <span className="form-hint">
                {t('training.fields.duration')}: {duration}s
              </span>
            )}
            {errors.file && (
              <span className="form-error">{errors.file}</span>
            )}
          </div>

          {submitting && (
            <div className="training-upload-progress">
              <div className="training-progress-bar">
                <div
                  className="training-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="form-hint">{stageLabel}</span>
            </div>
          )}
        </div>

        <div className="notion-modal-footer">
          <button
            type="button"
            className="btn-ghost"
            onClick={handleClose}
            disabled={submitting}
          >
            {t('training.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? stageLabel : t('training.register')}
          </button>
        </div>
      </div>
    </div>
  );
}
