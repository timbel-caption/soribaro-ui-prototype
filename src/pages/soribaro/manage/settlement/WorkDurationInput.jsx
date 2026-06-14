import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { minutesToHM, hmToMinutes } from '../../../../utils/workTimeUtils';
import './WorkDurationInput.css';

/**
 * 정산서 작업시간 입력 — 분 / 시·분 모드 공용 컴포넌트.
 * 저장 포맷은 항상 분(정수). 'hm' 모드는 내부에서 시·분으로 분해해 입력받고 합산해 전달한다.
 *
 * @param {object} props
 * @param {number|string} props.valueMinutes  현재 값(분)
 * @param {'min'|'hm'} props.mode             표시/입력 모드
 * @param {(totalMin: number|string) => void} props.onChangeMinutes  값 변경 콜백(분 단위)
 * @param {() => void} [props.onBlur]         blur 콜백
 * @param {boolean} [props.disabled]
 */
export default function WorkDurationInput({ valueMinutes, mode, onChangeMinutes, onBlur, disabled }) {
  const { t } = useTranslation('soribaro');

  if (mode === 'hm') {
    return (
      <HMInput
        valueMinutes={valueMinutes}
        onChangeMinutes={onChangeMinutes}
        onBlur={onBlur}
        disabled={disabled}
        t={t}
      />
    );
  }

  // 분 모드 — 기존 동작 그대로 (단일 분 입력)
  return (
    <>
      <input
        type="number"
        className="si-inline-input si-inline-input-sm"
        disabled={disabled}
        value={valueMinutes}
        onChange={(e) => onChangeMinutes(e.target.value)}
        onBlur={onBlur}
        min={0}
      />
      <span className="si-line-unit">{t('common.minuteUnit')}</span>
    </>
  );
}

function HMInput({ valueMinutes, onChangeMinutes, onBlur, disabled, t }) {
  const total = Math.max(0, Math.floor(Number(valueMinutes) || 0));
  const initial = minutesToHM(total);
  const [hStr, setHStr] = useState(String(initial.h));
  const [mStr, setMStr] = useState(String(initial.m));
  // 마지막으로 동기화한 총 분. 외부 valueMinutes 변경(항목 전환 등)과 내부 입력을 구분한다.
  const [syncedTotal, setSyncedTotal] = useState(total);

  // 외부에서 valueMinutes 가 바뀌면 로컬 입력을 재동기화 (React 권장 렌더-중 보정 패턴).
  // 우리가 emit 한 값은 syncedTotal 에 기록해 두므로 사용자의 입력 중간값을 덮어쓰지 않는다.
  if (total !== syncedTotal) {
    const split = minutesToHM(total);
    setHStr(String(split.h));
    setMStr(String(split.m));
    setSyncedTotal(total);
  }

  const emit = (hv, mv) => {
    const next = hmToMinutes(hv, mv);
    setSyncedTotal(next);
    onChangeMinutes(next);
  };

  const handleBlur = () => {
    // 분 ≥ 60 이면 시로 올림 정규화 (carry-over)
    const next = hmToMinutes(hStr, mStr);
    const split = minutesToHM(next);
    setHStr(String(split.h));
    setMStr(String(split.m));
    setSyncedTotal(next);
    onChangeMinutes(next);
    onBlur?.();
  };

  return (
    <span className="wd-hm">
      <input
        type="number"
        className="si-inline-input si-inline-input-sm wd-hm-input"
        disabled={disabled}
        value={hStr}
        onChange={(e) => { setHStr(e.target.value); emit(e.target.value, mStr); }}
        onBlur={handleBlur}
        min={0}
      />
      <span className="si-line-unit">{t('common.hourUnit')}</span>
      <input
        type="number"
        className="si-inline-input si-inline-input-sm wd-hm-input"
        disabled={disabled}
        value={mStr}
        onChange={(e) => { setMStr(e.target.value); emit(hStr, e.target.value); }}
        onBlur={handleBlur}
        min={0}
      />
      <span className="si-line-unit">{t('common.minuteUnit')}</span>
    </span>
  );
}
