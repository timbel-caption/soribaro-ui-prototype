import { memo } from "react";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useSubtitleStore } from "../../../stores/subtitleStore";
import { secondsToTimeCode } from "../../../utils/timeUtils";

import "./LockedSubtitleItem.css";

/**
 * VOD 분할 — 다른 작업자 구간의 최신 자막(상태 무관) 을 readonly 로 노출하는 카드.
 *
 * 일반 SubtitleItem 과 격리해서 별도 컴포넌트로 둔다. 이유:
 * - 텍스트/시간/화자/위치 등 모든 편집 경로가 처음부터 존재하지 않으므로 가드 누락이 불가능
 * - 화자 번호 충돌을 피하려고 화자 정보는 아예 표시하지 않는다 (시간 + 본문만 노출)
 */
const LockedSubtitleItem = memo(function LockedSubtitleItem({ subtitleId }) {
  const { t } = useTranslation("worktool");
  const subtitle = useSubtitleStore((s) =>
    s.subtitles.find((sub) => sub.id === subtitleId),
  );

  if (!subtitle) return null;

  const startLabel = secondsToTimeCode(subtitle.startTime);
  const endLabel = secondsToTimeCode(subtitle.endTime);

  return (
    <div
      className="locked-subtitle-card"
      title={t("subtitle.lockedOtherSegmentTooltip", {
        defaultValue: "다른 작업자 구간 — 수정 불가",
      })}
    >
      <div className="locked-subtitle-card__badge">
        <Lock size={14} aria-hidden="true" />
        <span>
          {t("subtitle.lockedOtherSegment", {
            defaultValue: "다른 구간 (수정 불가)",
          })}
        </span>
      </div>
      <div className="locked-subtitle-card__meta">
        <span className="locked-subtitle-card__time">
          {startLabel} → {endLabel}
        </span>
      </div>
      <div className="locked-subtitle-card__text">{subtitle.text || ""}</div>
    </div>
  );
});

export default LockedSubtitleItem;
