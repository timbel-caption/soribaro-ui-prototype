import { memo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getBaseRole, Role } from '../../../stores/roleStore';
import { useTranslation } from 'react-i18next';
import './FormatModal.css';

export const SUPPORTED_FORMATS = [
  {
    id: 'json',
    name: 'JSON',
    extension: '.json',
    mimeType: 'application/json',
    descriptionKey: 'format.soribaroFormat',
  },
  {
    id: 'dfxp',
    name: 'DFXP',
    extension: '.dfxp',
    mimeType: 'application/ttml+xml',
    descriptionKey: 'format.dfxpFormat',
  },
  {
    id: 'smi',
    name: 'SMI',
    extension: '.smi',
    mimeType: 'text/plain',
    descriptionKey: 'format.samiFormat',
  },
  {
    id: 'srt',
    name: 'SRT',
    extension: '.srt',
    mimeType: 'text/plain',
    descriptionKey: 'format.srtFormat',
  },
  {
    id: 'vtt',
    name: 'VTT',
    extension: '.vtt',
    mimeType: 'text/vtt',
    descriptionKey: 'format.vttFormat',
  },
  {
    id: 'txt',
    name: 'TXT',
    extension: '.txt',
    mimeType: 'text/plain',
    descriptionKey: 'format.txtFormat',
    exportOnly: true,
  },
];

// 포맷별 지원 옵션 정의
const FORMAT_OPTIONS = {
  smi: ['position', 'nbsp', 'tags'],
  srt: ['position', 'includeEmpty'],
  dfxp: ['position'],
  vtt: ['position'],
  txt: ['blankLines'],
  json: [],
};

const DEFAULT_FORMAT_SETTINGS = () => ({
  encoding: 'utf-8',
  includePosition: true,
  includeNbsp: true,
  includeTags: true,
  includeEmpty: true,
  blankLines: true,
});

function getFieldOptions(role, mode) {
  const baseRole = getBaseRole(role);

  if (baseRole === Role.FINAL) {
    return [
      { field: 'sourceText', labelKey: 'common.sourceLanguage', icon: '🅰' },
      { field: 'middleText', labelKey: 'common.middleLanguage', icon: '🅱' },
      { field: 'text', labelKey: 'common.targetLanguage', icon: '🅲' },
    ];
  }

  if (baseRole === Role.MID) {
    return [
      { field: 'sourceText', labelKey: 'common.sourceLanguage', icon: '🅰' },
      { field: 'text', labelKey: 'common.middleLanguage', icon: '🅱' },
    ];
  }

  return null;
}

function OptionToggle({ label, value, onChange }) {
  return (
    <div className="export-option-row">
      <span className="export-option-label">{label}</span>
      <div className="encoding-toggle">
        <button className={`encoding-btn ${value ? 'active' : ''}`} onClick={() => onChange(true)}>ON</button>
        <button className={`encoding-btn ${!value ? 'active' : ''}`} onClick={() => onChange(false)}>OFF</button>
      </div>
    </div>
  );
}

function FormatOptionsSection({ formatId, settings, onChange, t }) {
  const opts = FORMAT_OPTIONS[formatId] || [];

  const update = (key, val) => onChange({ ...settings, [key]: val });

  return (
    <div className="format-options-section">
      <div className="export-option-row">
        <span className="export-option-label">{t('format.encoding')}</span>
        <div className="encoding-toggle">
          <button className={`encoding-btn ${settings.encoding === 'utf-8' ? 'active' : ''}`} onClick={() => update('encoding', 'utf-8')}>UTF-8</button>
          <button className={`encoding-btn ${settings.encoding === 'utf-8-bom' ? 'active' : ''}`} onClick={() => update('encoding', 'utf-8-bom')}>UTF-8(BOM)</button>
          <button className={`encoding-btn ${settings.encoding === 'ansi' ? 'active' : ''}`} onClick={() => update('encoding', 'ansi')}>ANSI</button>
        </div>
      </div>
      {opts.includes('position') && (
        <OptionToggle label={t('format.optPosition')} value={settings.includePosition} onChange={(v) => update('includePosition', v)} />
      )}
      {opts.includes('nbsp') && (
        <OptionToggle label={t('format.optNbsp')} value={settings.includeNbsp} onChange={(v) => update('includeNbsp', v)} />
      )}
      {opts.includes('tags') && (
        <OptionToggle label={t('format.optTags')} value={settings.includeTags} onChange={(v) => update('includeTags', v)} />
      )}
      {opts.includes('includeEmpty') && (
        <OptionToggle label={t('format.optIncludeEmpty')} value={settings.includeEmpty} onChange={(v) => update('includeEmpty', v)} />
      )}
      {opts.includes('blankLines') && (
        <OptionToggle label={t('format.optBlankLines')} value={settings.blankLines} onChange={(v) => update('blankLines', v)} />
      )}
    </div>
  );
}

const FormatModal = memo(function FormatModal({
  isOpen,
  mode,
  role,
  onClose,
  onSelect,
  onHwpExport,
}) {
  const { t } = useTranslation('worktool');
  const [step, setStep] = useState('format'); // 'format' | 'options' | 'field'
  const [encoding, setEncoding] = useState('utf-8');

  // 단일 선택 (import 모드 + 단일 export)
  const [selectedFormat, setSelectedFormat] = useState(null);

  // 멀티 선택 (export 모드)
  const [checkedFormats, setCheckedFormats] = useState(new Set());
  const [formatSettings, setFormatSettings] = useState({});

  // 멀티 다운로드 시 필드 선택용
  const [pendingDownloads, setPendingDownloads] = useState([]);

  const handleClose = useCallback(() => {
    setStep('format');
    setSelectedFormat(null);
    setCheckedFormats(new Set());
    setFormatSettings({});
    setPendingDownloads([]);
    setEncoding('utf-8');
    onClose();
  }, [onClose]);

  const toggleFormat = useCallback((formatId) => {
    setCheckedFormats((prev) => {
      const next = new Set(prev);
      if (next.has(formatId)) {
        next.delete(formatId);
        setFormatSettings((s) => { const n = { ...s }; delete n[formatId]; return n; });
      } else {
        next.add(formatId);
        setFormatSettings((s) => ({ ...s, [formatId]: DEFAULT_FORMAT_SETTINGS() }));
      }
      return next;
    });
  }, []);

  const updateFormatSettings = useCallback((formatId, newSettings) => {
    setFormatSettings((prev) => ({ ...prev, [formatId]: newSettings }));
  }, []);

  const resolveFormat = useCallback((format, settings) => {
    let id = format.id;
    if (id === 'txt' && !settings.blankLines) id = 'txt-noblank';
    if (id === 'srt' && !settings.includeEmpty) id = 'srt-noblank';
    if (id === 'smi' && !settings.includeTags) id = 'smi-notag';
    return { ...format, id };
  }, []);

  const buildOptions = useCallback((settings) => ({
    includePosition: settings.includePosition,
    includeNbsp: settings.includeNbsp,
    includeTags: settings.includeTags,
  }), []);

  // import 모드: 단일 클릭
  const handleImportFormatClick = useCallback((format) => {
    const fieldOptions = getFieldOptions(role, mode);
    if (!fieldOptions) {
      onSelect(format, 'text', encoding);
      return;
    }
    setSelectedFormat(format);
    setStep('field');
  }, [role, mode, onSelect, encoding]);

  // export: 포맷 선택 → 옵션 화면으로 전환
  const handleGoToOptions = useCallback(() => {
    if (checkedFormats.size === 0) return;
    setStep('options');
  }, [checkedFormats]);

  // export: 옵션 확정 후 다운로드 진행
  const handleConfirmDownload = useCallback(() => {
    if (checkedFormats.size === 0) return;

    const fieldOptions = getFieldOptions(role, mode);
    const downloads = [];
    for (const fmtId of checkedFormats) {
      const format = SUPPORTED_FORMATS.find((f) => f.id === fmtId);
      if (!format) continue;
      const settings = formatSettings[fmtId] || DEFAULT_FORMAT_SETTINGS();
      downloads.push({ format, settings });
    }

    if (fieldOptions) {
      setPendingDownloads(downloads);
      setStep('field');
      return;
    }

    for (const { format, settings } of downloads) {
      const resolved = resolveFormat(format, settings);
      const options = buildOptions(settings);
      onSelect(resolved, 'text', settings.encoding || 'utf-8', options);
    }
    handleClose();
  }, [checkedFormats, formatSettings, role, mode, onSelect, resolveFormat, buildOptions, handleClose]);

  // 필드 선택 (멀티 다운로드)
  const handleFieldClick = useCallback((field) => {
    if (pendingDownloads.length > 0) {
      for (const { format, settings } of pendingDownloads) {
        const resolved = resolveFormat(format, settings);
        const options = buildOptions(settings);
        onSelect(resolved, field, settings.encoding || 'utf-8', options);
      }
      handleClose();
      return;
    }
    // 단일 (import)
    if (selectedFormat) {
      onSelect(selectedFormat, field, 'utf-8');
      handleClose();
    }
  }, [pendingDownloads, selectedFormat, resolveFormat, buildOptions, onSelect, handleClose]);

  const handleBack = useCallback(() => {
    if (step === 'field' && pendingDownloads.length > 0) {
      setPendingDownloads([]);
      setStep('options');
      return;
    }
    if (step === 'options') {
      setStep('format');
      return;
    }
    setStep('format');
    setSelectedFormat(null);
  }, [step, pendingDownloads]);

  if (!isOpen) return null;

  const modeLabel = mode === 'import' ? t('format.importTab') : t('format.exportTab');
  const fieldOptions = getFieldOptions(role, mode);
  const checkedList = SUPPORTED_FORMATS.filter((f) => checkedFormats.has(f.id));
  const hasOptions = checkedList.some((f) => (FORMAT_OPTIONS[f.id] || []).length > 0);

  return createPortal(
    <div className="format-modal-overlay">
      <div className="format-modal">
        {step === 'format' && (
          <>
            <div className="format-modal-header">
              <h2>{modeLabel} {t('format.selectFormat')}</h2>
              <button className="format-modal-close" onClick={handleClose}>✕</button>
            </div>
            <div className="format-modal-content">
              <p className="format-modal-description">
                {mode === 'import'
                  ? t('format.importFormatGuide')
                  : t('format.exportFormatGuide')}
              </p>
              <div className="format-list">
                {SUPPORTED_FORMATS
                  .filter((f) => !f.exportOnly || mode === 'export')
                  .map((format) => (
                  <div
                    key={format.id}
                    className={`format-item ${checkedFormats.has(format.id) ? 'checked' : ''}`}
                    onClick={() => mode === 'import' ? handleImportFormatClick(format) : toggleFormat(format.id)}
                  >
                    {mode === 'export' && (
                      <input
                        type="checkbox"
                        className="format-checkbox"
                        checked={checkedFormats.has(format.id)}
                        onChange={() => toggleFormat(format.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div className="format-item-main">
                      <div className="format-info">
                        <span className="format-name">{format.name}</span>
                        <span className="format-extension">{format.extension}</span>
                      </div>
                      <span className="format-description">{t(format.descriptionKey)}</span>
                    </div>
                  </div>
                ))}
                {mode === 'export' && onHwpExport && (
                  <>
                    <div className="format-list-divider" />
                    <button
                      className="format-item"
                      onClick={() => { onHwpExport(); handleClose(); }}
                    >
                      <div className="format-item-main">
                        <div className="format-info">
                          <span className="format-name">HWP</span>
                          <span className="format-extension">.hwp</span>
                        </div>
                        <span className="format-description">{t('format.hwpFormat')}</span>
                      </div>
                    </button>
                  </>
                )}
              </div>

              {mode === 'export' && checkedFormats.size > 0 && (
                <div className="export-download-footer">
                  <button className="export-download-btn" onClick={handleGoToOptions}>
                    {t('format.next')} ({checkedFormats.size})
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {step === 'options' && (
          <>
            <div className="format-modal-header">
              <div className="format-modal-header-left">
                <button className="format-modal-back" onClick={handleBack}>←</button>
                <h2>{t('format.exportOptions')}</h2>
              </div>
              <button className="format-modal-close" onClick={handleClose}>✕</button>
            </div>
            <div className="format-modal-content">
              <div className="multi-export-options">
                {checkedList.map((format) => {
                  const opts = FORMAT_OPTIONS[format.id] || [];
                  return (
                    <div key={format.id} className="multi-export-format-section">
                      <div className="multi-export-format-title">{format.name}</div>
                      <FormatOptionsSection
                        formatId={format.id}
                        settings={formatSettings[format.id] || DEFAULT_FORMAT_SETTINGS()}
                        onChange={(s) => updateFormatSettings(format.id, s)}
                        t={t}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="export-download-footer">
                <button className="export-download-btn" onClick={handleConfirmDownload}>
                  {t('format.confirmDownload')}
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'field' && (
          <>
            <div className="format-modal-header">
              <div className="format-modal-header-left">
                <button className="format-modal-back" onClick={handleBack}>←</button>
                <h2>{modeLabel} {t('format.selectField')}</h2>
              </div>
              <button className="format-modal-close" onClick={handleClose}>✕</button>
            </div>
            <div className="format-modal-content">
              <p className="format-modal-description">
                {pendingDownloads.length > 0 && (
                  <span className="format-modal-selected-format">
                    {pendingDownloads.map((d) => d.format.name).join(', ')}
                  </span>
                )}
                {selectedFormat && !pendingDownloads.length && (
                  <span className="format-modal-selected-format">
                    {selectedFormat.name} ({selectedFormat.extension})
                  </span>
                )}
                {mode === 'import'
                  ? ` ${t('format.importFieldGuide')}`
                  : ` ${t('format.exportFieldGuide')}`}
              </p>
              <div className="format-list">
                {fieldOptions && fieldOptions.map((option) => (
                  <button
                    key={option.field}
                    className="format-item field-item"
                    onClick={() => handleFieldClick(option.field)}
                  >
                    <div className="format-info">
                      <span className="field-icon">{option.icon}</span>
                      <span className="format-name">{t(option.labelKey)}</span>
                    </div>
                    <span className="format-description">
                      {mode === 'import'
                        ? t('format.importFieldDesc', { label: t(option.labelKey) })
                        : t('format.exportFieldDesc', { label: t(option.labelKey) })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
});

export default FormatModal;
