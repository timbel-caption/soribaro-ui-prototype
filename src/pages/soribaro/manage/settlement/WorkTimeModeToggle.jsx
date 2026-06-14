import { useTranslation } from 'react-i18next';
import { useSettlementUiStore } from '../../../../stores/settlementUiStore';
import './WorkTimeModeToggle.css';

/**
 * 작업시간 표시 모드(분 / 시·분) 세그먼트 토글.
 * 선택값은 settlementUiStore 에 영속 저장된다.
 */
export default function WorkTimeModeToggle() {
  const { t } = useTranslation('soribaro');
  const mode = useSettlementUiStore((s) => s.workTimeDisplayMode);
  const setMode = useSettlementUiStore((s) => s.setWorkTimeDisplayMode);

  return (
    <div className="wt-toggle" role="group" aria-label={t('manage.settlement.workTimeToggle.label')}>
      <button
        type="button"
        className={`wt-toggle-opt${mode === 'min' ? ' is-active' : ''}`}
        onClick={() => setMode('min')}
      >
        {t('manage.settlement.workTimeToggle.min')}
      </button>
      <button
        type="button"
        className={`wt-toggle-opt${mode === 'hm' ? ' is-active' : ''}`}
        onClick={() => setMode('hm')}
      >
        {t('manage.settlement.workTimeToggle.hm')}
      </button>
    </div>
  );
}
