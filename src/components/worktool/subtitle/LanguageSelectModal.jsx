import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import languages from '../../../constants/language.json';
import { useTranslation } from 'react-i18next';
import './LanguageSelectModal.css';

const LanguageSelectModal = memo(function LanguageSelectModal({ 
  isOpen, 
  onClose, 
  onSelect,
  title: titleProp,
}) {
  const { t } = useTranslation('worktool');
  const title = titleProp || t('languageSelect.title');
  const [selectedLanguage, setSelectedLanguage] = useState(languages[0]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onSelect(selectedLanguage);
    onClose();
  };

  return createPortal(
    <div className="language-modal-overlay">
      <div className="language-modal">
        <div className="language-modal-header">
          <h2>{title}</h2>
          <button className="language-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="language-modal-content">
          <p className="language-modal-description">
            {t('languageSelect.description')}
          </p>
          <div className="language-list">
            {languages.map((lang) => (
              <button
                key={lang.code}
                className={`language-item ${selectedLanguage?.code === lang.code ? 'selected' : ''}`}
                onClick={() => setSelectedLanguage(lang)}
              >
                <span className="language-code">{lang.code.toUpperCase()}</span>
                <span className="language-name">{lang.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="language-modal-footer">
          <button className="language-btn cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="language-btn confirm" onClick={handleConfirm}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});

export default LanguageSelectModal;
