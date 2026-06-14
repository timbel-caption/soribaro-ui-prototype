/**
 * 연수 모드에서 미디어 불러오기 시 표시되는 파일 선택 모달
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listTrainingFiles,
  getTrainingFilePlaybackUrl,
  getTrainingWaveformDownloadUrl,
} from '../../../api/v9/training';
import { toast } from '../../../stores/toastStore';
import '../../../styles/notion-list.css';
import '../../../pages/soribaro/training/TrainingFilesPage.css';

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg']);
const PAGE_SIZE = 50;

function classifyKind(format) {
  if (!format) return 'unknown';
  const ext = String(format).toLowerCase().replace(/^\./, '');
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return 'unknown';
}

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '-';
  const total = Math.max(0, Math.round(Number(seconds)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function TrainingFilePickerModal({ open, onClose, onPick }) {
  const { t } = useTranslation('common');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [committedKeyword, setCommittedKeyword] = useState('');
  const [picking, setPicking] = useState(false);

  const fetchData = useCallback(
    async (targetPage, search) => {
      setLoading(true);
      try {
        const res = await listTrainingFiles({
          page: targetPage,
          size: PAGE_SIZE,
          keyword: search || undefined,
        });
        const envelope = res?.data ?? res;
        if (Array.isArray(envelope)) {
          setRows(envelope);
          setTotalPages(1);
        } else if (envelope && Array.isArray(envelope.content)) {
          setRows(envelope.content);
          setTotalPages(envelope.totalPages ?? 1);
        } else {
          setRows([]);
          setTotalPages(0);
        }
      } catch (err) {
        console.error('[TrainingFilePickerModal] load failed:', err);
        toast.error(err?.message || t('training.errors.loadFailed'));
        setRows([]);
        setTotalPages(0);
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (!open) return;
    fetchData(page, committedKeyword);
  }, [open, page, committedKeyword, fetchData]);

  useEffect(() => {
    if (!open) {
      setKeyword('');
      setCommittedKeyword('');
      setPage(0);
      setRows([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape' && !picking) onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, picking]);

  const handleSearch = useCallback(() => {
    setPage(0);
    setCommittedKeyword(keyword.trim());
  }, [keyword]);

  const handlePick = useCallback(
    async (row) => {
      if (!row?.id || picking) return;
      setPicking(true);

      // playback-url 과 waveform-url 을 병렬 발급.
      // waveform-url 은 404 등 실패해도 모달은 닫고 미디어만이라도 로드한다.
      const [playbackResult, waveformResult] = await Promise.allSettled([
        getTrainingFilePlaybackUrl(row.id),
        getTrainingWaveformDownloadUrl(row.id),
      ]);

      try {
        if (playbackResult.status !== 'fulfilled') {
          const err = playbackResult.reason;
          console.error('[TrainingFilePickerModal] playback URL failed:', err);
          toast.error(err?.message || t('training.errors.playbackFailed'));
          return;
        }

        const data = playbackResult.value?.data ?? playbackResult.value;
        const playbackUrl = data?.playbackUrl;
        const fileName = data?.name || row.name;
        const format = data?.format || row.format;
        if (!playbackUrl) {
          toast.error(t('training.errors.playbackFailed'));
          return;
        }

        let waveformUrl = null;
        if (waveformResult.status === 'fulfilled') {
          const wfData = waveformResult.value?.data ?? waveformResult.value;
          waveformUrl = wfData?.url || null;
        } else {
          console.warn(
            '[TrainingFilePickerModal] waveform URL 없음/실패 (무시):',
            waveformResult.reason?.message || waveformResult.reason,
          );
        }

        const kind = classifyKind(format);
        const mediaType = kind === 'audio' ? 'audio' : 'video';
        onPick?.({
          id: row.id,
          playbackUrl,
          waveformUrl,
          mediaType,
          fileName,
          title: row.title,
        });
        onClose?.();
      } finally {
        setPicking(false);
      }
    },
    [picking, onPick, onClose, t]
  );

  if (!open) return null;

  return (
    <div className="notion-modal-overlay" onClick={() => !picking && onClose?.()}>
      <div className="notion-modal notion-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="notion-modal-header">
          <h3>{t('training.picker.title')}</h3>
          <button
            type="button"
            className="notion-modal-close"
            onClick={onClose}
            disabled={picking}
            aria-label="close"
          >
            &times;
          </button>
        </div>

        <div className="notion-modal-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-search">
              <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                className="filter-input"
                placeholder={t('training.searchPlaceholder')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
              />
            </div>
            <div className="filter-actions">
              <button className="btn-primary" onClick={handleSearch} disabled={loading}>
                {loading ? t('training.loading') : t('training.search')}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="training-picker-loading">{t('training.picker.loading')}</div>
          ) : rows.length === 0 ? (
            <div className="training-picker-empty">{t('training.picker.empty')}</div>
          ) : (
            <div className="training-picker-list">
              {rows.map((row) => {
                const kind = classifyKind(row.format);
                return (
                  <div
                    key={row.id}
                    className={`training-picker-row${picking ? ' is-disabled' : ''}`}
                    onClick={() => handlePick(row)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handlePick(row);
                      }
                    }}
                    title={row.title || row.name}
                  >
                    <div className="training-picker-row-main">
                      <div className="training-picker-title">
                        {row.title || row.name}
                      </div>
                      <div className="training-picker-meta">
                        {row.name} · {t(`training.kind.${kind}`)} · {formatDuration(row.duration)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="pagination" style={{ padding: '8px 0 0' }}>
              <div className="pagination-pages">
                <button
                  disabled={page <= 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  &lsaquo;
                </button>
                <span className="pagination-info" style={{ padding: '0 10px' }}>
                  {page + 1} / {totalPages}
                </span>
                <button
                  disabled={page + 1 >= totalPages || loading}
                  onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                >
                  &rsaquo;
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="notion-modal-footer">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={picking}
          >
            {t('training.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
