import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { FileUp, X } from 'lucide-react';

const MERGE_FORMATS = [
  { id: 'json', label: 'JSON', extension: '.json' },
  { id: 'txt', label: 'TXT (빈줄 포함)', extension: '.txt' },
  { id: 'txt-noblank', label: 'TXT (빈줄 미포함)', extension: '.txt' },
  { id: 'hwp', label: 'HWP (템플릿)', extension: '.hwp' },
];

export default function MergeExportModal({ open, onClose, onExport }) {
  const { t } = useTranslation('soribaro');
  const [selectedFormat, setSelectedFormat] = useState('json');
  const [templateFile, setTemplateFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleClose = useCallback(() => {
    setSelectedFormat('json');
    setTemplateFile(null);
    onClose();
  }, [onClose]);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) setTemplateFile(file);
    e.target.value = '';
  }, []);

  const handleExport = useCallback(() => {
    if (selectedFormat === 'hwp' && !templateFile) return;
    onExport(selectedFormat, { templateFile });
    handleClose();
  }, [selectedFormat, templateFile, onExport, handleClose]);

  const isHwp = selectedFormat === 'hwp';
  const canExport = isHwp ? !!templateFile : true;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { background: 'var(--surface-dark, #1a1b26)', color: 'var(--text-primary, #c0caf5)' } }}
    >
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600, pb: 1 }}>
        {t('enterprise.mergeExportTitle', '병합파일 내보내기')}
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {MERGE_FORMATS.map((fmt) => (
            <label
              key={fmt.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                border: `1px solid ${selectedFormat === fmt.id ? 'var(--accent-color, #4ecdc4)' : 'var(--border-color, #333)'}`,
                background: selectedFormat === fmt.id ? 'rgba(78, 205, 196, 0.1)' : 'transparent',
                fontSize: 14,
              }}
            >
              <input
                type="radio"
                name="mergeFormat"
                value={fmt.id}
                checked={selectedFormat === fmt.id}
                onChange={() => setSelectedFormat(fmt.id)}
                style={{ accentColor: 'var(--accent-color, #4ecdc4)' }}
              />
              {fmt.label}
            </label>
          ))}
        </div>

        {isHwp && (
          <div style={{ marginTop: 4 }}>
            {templateFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-light, #24283b)', borderRadius: 6 }}>
                <FileUp size={18} />
                <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {templateFile.name}
                </span>
                <button
                  onClick={() => setTemplateFile(null)}
                  style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: 2 }}
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px dashed var(--border-color, #444)',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--text-secondary, #888)',
                  cursor: 'pointer',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
                type="button"
              >
                <FileUp size={20} />
                {t('enterprise.hwpExportSelectFile', 'HWP 템플릿 선택')}
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
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} size="small">
          {t('common.cancel', '취소')}
        </Button>
        <Button
          variant="contained"
          onClick={handleExport}
          disabled={!canExport}
          size="small"
          sx={{ backgroundColor: 'var(--accent-color, #4ecdc4)', color: '#1a1b26', '&:hover': { backgroundColor: '#3dbdb5' } }}
        >
          {t('enterprise.mergeExportButton', '다운로드')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
