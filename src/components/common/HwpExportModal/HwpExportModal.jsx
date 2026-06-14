import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { FileUp, X } from 'lucide-react';
import { toast } from '../Toast';
import { exportHwpRaw } from '../../../api/v9/tools/index';
import { fetchSubtitlesByType } from '../../../utils/subtitleFetchUtils';
import { normalizeSubtitles } from '../../../utils/subtitleExportUtils';
import './HwpExportModal.css';

export default function HwpExportModal({
  open,
  onClose,
  servCd,
  fileNo,
  fileNm,
  isTranslation = false,
  subtitles,
  files,
}) {
  const { t } = useTranslation('soribaro');
  const [templateFile, setTemplateFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const isBulk = Array.isArray(files) && files.length > 0;

  const handleClose = useCallback(() => {
    if (loading) return;
    setTemplateFile(null);
    onClose();
  }, [loading, onClose]);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) setTemplateFile(file);
    e.target.value = '';
  }, []);

  const handleRemoveFile = useCallback(() => {
    setTemplateFile(null);
  }, []);

  /**
   * 파일 번호 단위로 HWP 생성.
   * fetchSubtitlesByType는 fileNo에 속한 모든 project_files(분할 A/B 등)의
   * 자막을 병합해 반환하므로, 분할 파일도 누락 없이 하나의 HWP로 출력된다.
   * HWP 바이너리 생성 자체는 서버(exportHwpRaw)에서 수행.
   */
  const exportSingleFile = useCallback(
    async (targetFileNo, targetFileNm) => {
      const types = isTranslation ? ['FINAL', 'MID', 'START'] : ['START'];
      let collected = [];
      for (const type of types) {
        collected = await fetchSubtitlesByType(servCd, targetFileNo, type);
        if (collected.length > 0) break;
      }
      if (!collected.length) {
        throw new Error('NO_SUBTITLE');
      }
      const payloadSubtitles = normalizeSubtitles(collected);

      const blob = await exportHwpRaw(templateFile, payloadSubtitles);
      const downloadName = targetFileNm
        ? targetFileNm.replace(/\.[^/.]+$/, '') + '.hwp'
        : `${targetFileNo}.hwp`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);
    },
    [servCd, isTranslation, templateFile],
  );

  const handleExport = useCallback(async () => {
    if (!templateFile) return;

    if (isBulk) {
      setLoading(true);
      let success = 0;
      let failed = 0;
      try {
        for (const f of files) {
          try {
            await exportSingleFile(f.fileNo, f.fileNm);
            success++;
          } catch {
            failed++;
          }
        }
        if (success > 0) toast.success(t('enterprise.hwpExportSuccess'));
        if (failed > 0) toast.error(t('enterprise.hwpExportError'));
        handleClose();
      } finally {
        setLoading(false);
      }
      return;
    }

    const useProvidedSubtitles = subtitles?.length > 0;
    if (!useProvidedSubtitles && !fileNo) return;
    setLoading(true);
    try {
      let payloadSubtitles;
      if (useProvidedSubtitles) {
        // 편집 중 상태 등 호출측에서 직접 자막을 전달한 경우 (저장 전 프리뷰 용도)
        payloadSubtitles = subtitles;
      } else {
        // fileNo 기반 자막 수집 — 분할 세그먼트(A/B)가 있으면 모두 병합해서 출력
        const types = isTranslation ? ['FINAL', 'MID', 'START'] : ['START'];
        let collected = [];
        for (const type of types) {
          collected = await fetchSubtitlesByType(servCd, fileNo, type);
          if (collected.length > 0) break;
        }
        if (!collected.length) {
          toast.error(t('enterprise.hwpExportNoSubtitle'));
          return;
        }
        payloadSubtitles = normalizeSubtitles(collected);
      }

      const blob = await exportHwpRaw(templateFile, payloadSubtitles);
      const downloadName = fileNm
        ? fileNm.replace(/\.[^/.]+$/, '') + '.hwp'
        : 'export.hwp';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(t('enterprise.hwpExportSuccess'));
      handleClose();
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('404') || msg.includes('자막')) {
        toast.error(t('enterprise.hwpExportNoSubtitle'));
      } else if (msg.includes('400') || msg.includes('폼') || msg.includes('양식')) {
        toast.error(t('enterprise.hwpExportInvalidTemplate'));
      } else {
        toast.error(t('enterprise.hwpExportError'));
      }
    } finally {
      setLoading(false);
    }
  }, [templateFile, isBulk, files, exportSingleFile, subtitles, fileNo, fileNm, servCd, isTranslation, handleClose, t]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        className: 'hwp-export-modal',
        // MUI 기본 배경(#fff)이 다크/기본 테마에서 그대로 노출되던 문제 보정.
        // MergeExportModal 과 동일한 토큰을 사용해 톤 통일.
        sx: {
          background: 'var(--surface-dark, #1a1b26)',
          color: 'var(--text-primary, #c0caf5)',
        },
      }}
    >
      <DialogTitle className="hwp-export-modal__title">
        {isBulk
          ? `${t('enterprise.hwpExportTitle')} (${files.length})`
          : t('enterprise.hwpExportTitle')}
      </DialogTitle>

      <DialogContent className="hwp-export-modal__content">
        <p className="hwp-export-modal__desc">
          {t('enterprise.hwpExportDescription')}
        </p>

        <div className="hwp-export-modal__upload-area">
          {templateFile ? (
            <div className="hwp-export-modal__file-info">
              <FileUp size={20} />
              <span className="hwp-export-modal__file-name">
                {templateFile.name}
              </span>
              <button
                className="hwp-export-modal__file-remove"
                onClick={handleRemoveFile}
                disabled={loading}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              className="hwp-export-modal__select-btn"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <FileUp size={24} />
              <span>{t('enterprise.hwpExportSelectFile')}</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".hwp"
            onChange={handleFileChange}
            hidden
          />
        </div>
      </DialogContent>

      <DialogActions className="hwp-export-modal__actions">
        <Button onClick={handleClose} disabled={loading} size="small">
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleExport}
          disabled={!templateFile || loading}
          size="small"
        >
          {loading ? (
            <>
              <CircularProgress size={16} sx={{ mr: 1, color: 'inherit' }} />
              {t('enterprise.hwpExportProcessing')}
            </>
          ) : (
            t('enterprise.hwpExportButton')
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
