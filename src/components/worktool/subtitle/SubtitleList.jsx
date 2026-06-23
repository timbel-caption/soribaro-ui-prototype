import {
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
  useMemo,
  createContext,
  useContext,
} from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { List as VirtualList, useListCallbackRef } from "react-window";
import { useSubtitleStore } from "../../../stores/subtitleStore";
import { useTrainingActionStore } from "../../../stores/trainingActionStore";
import { usePlaybackStore } from "../../../stores/playbackStore";
import { confirm, useModalStore } from "../../../stores/modalStore";
import { useValidationStore } from "../../../stores/validationStore";
import { useShortcutsStore } from "../../../stores/shortcutsStore";
import { SEVERITY_ICONS, VALIDATION_RULES } from "../../../utils/validationRules";
import { getSubtitleCpsInfo } from "../../../utils/cpsUtils";
import { secondsToTimeCode, timeCodeToSeconds } from "../../../utils/timeUtils";
import { parseDFXP, exportToDFXP } from "../../../utils/dfxpUtils";
import { parseSMI, exportToSMI } from "../../../utils/smiUtils";
import { parseSRT, exportToSRT } from "../../../utils/srtUtils";
import { parseVTT, exportToVTT } from "../../../utils/vttUtils";
import { createEncodedBlob } from "../../../utils/encodingUtils";
import {
  parseSubtitleJson,
  serializeSubtitleJson,
} from "../../../utils/subtitleJsonFormat";
import FormatModal from "./FormatModal";
import HwpExportModal from "../../common/HwpExportModal/HwpExportModal";
import EditHistoryModal from "./EditHistoryModal";
import SpeakerSelectModal from "./SpeakerSelectModal";
import SpeakerSelectDropdown from "./SpeakerSelectDropdown";
import LanguageSelectModal from "./LanguageSelectModal";
import ColumnSettingsModal from "./ColumnSettingsModal";
import TimeJumpModal from "./TimeJumpModal";
import BoilerplateModal from "./BoilerplateModal";
import GapFillModal from "./GapFillModal";
import CommentListModal from "./CommentListModal";
import FindReplaceModal from "./FindReplaceModal";
import AccuracyModal from "./AccuracyModal";
import ReviewTagPopover from "./ReviewTagPopover";
import ReviewSummaryModal from "./ReviewSummaryModal";
import CommentPopover from "./CommentPopover";
import TranslateConfigModal from "../common/TranslateConfigModal";
import { ProcessModal } from "../../common/ProcessModal";
import { useSpeakerStore } from "../../../stores/speakerStore";
import {
  useRoleStore,
  Role,
  isReviewer,
  getBaseRole,
  ROLE_INFO,
} from "../../../stores/roleStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useAIStore } from "../../../stores/aiStore";
import { useUserStore } from "../../../stores/userStore";
import LockedSubtitleItem from "./LockedSubtitleItem";
import { getProjectFileInfo, getProjectFileById, updateProjectFile } from "../../../api/v9/projectFiles/index";
import {
  createSubtitleWork,
  getLatestSubtitleWork,
  getLatestSubtitleWorkForReview,
  getLatestSubtitleWorkForWorker,
  getLatestMergedSubtitleWork,
  getLockedOthers,
} from "../../../api/v9/subtitleWorks/index";
import { fetchSubtitlesByType, fetchReviewDoneSubtitlesByType, mergeTranslationSubtitles } from "../../../utils/subtitleFetchUtils";
import { mergeSubtitleFiles } from "../../../utils/subtitleExportUtils";
import { detectOverlaps } from "../../../utils/sttMergeUtils";
import SttMergeConflictModal from "../common/SttMergeConflictModal";
import {
  getAllReviewTags,
  getAllReviewTagGroups,
  getServByServCd,
  updateServWorkStat,
} from "../../../api/v9";
import {
  getSubtitleReviewTags,
  createSubtitleReviewTag,
  deleteSubtitleReviewTag,
} from "../../../api/v9/subtitleReviewTags";
import {
  getSubtitleComments,
  createSubtitleComment,
  updateSubtitleComment,
  deleteSubtitleComment,
} from "../../../api/v9/subtitleComments";
import {
  getTrainingComments,
  createTrainingComment,
  updateTrainingComment,
  deleteTrainingComment,
} from "../../../api/v9/training/comments";
import { upsertProjectFileEvaluation } from "../../../api/v9/projectFileEvaluations/index";
import { timeCodeToSeconds as parseTimeCode } from "../../../utils/timeUtils";
import languages from "../../../constants/language.json";
import { toast } from "../../../stores/toastStore";
import { saveEditHistory } from "../../../utils/waveformCache";
import { useTranslation } from "react-i18next";
import {
  getWorkStatOnSave,
  isWorkStatTransitionAllowed,
  normalizeWorkStat,
} from "../../../utils/workStatUtils";
import "flag-icons/css/flag-icons.min.css";
import "./SubtitleList.css";

// ─── AI QC 더미 데이터 ────────────────────────────────────────────────────────
const AI_QC_ISSUES = [
  { id: 1, kind: "error", type: "CPS 오류", text: "00:01:23,450 → 00:01:25,200\n자막이 CPS 기준(17)을 초과합니다.", time: "00:01:23" },
  { id: 2, kind: "error", type: "글자 수 오류", text: "00:02:10,100 → 00:02:12,300\n한 줄 최대 글자 수(16자)를 초과합니다.", time: "00:02:10" },
  { id: 3, kind: "error", type: "싱크 오류", text: "00:03:45,800 → 00:03:45,600\n시작 시간이 종료 시간보다 늦습니다.", time: "00:03:45" },
  { id: 4, kind: "error", type: "용어집 불일치", text: "00:05:02,000 → 00:05:04,500\n'캐릭터' → 용어집 기준 '캐릭터(character)'", time: "00:05:02" },
  { id: 5, kind: "error", type: "줄 수 오류", text: "00:06:30,200 → 00:06:33,100\n줄 수가 최대(2줄)를 초과합니다.", time: "00:06:30" },
  { id: 6, kind: "suspect", type: "문맥 어색", text: "00:08:14,400 → 00:08:16,900\n발화 맥락과 어울리지 않을 가능성이 있습니다.", time: "00:08:14" },
  { id: 7, kind: "suspect", type: "발화 불명확", text: "00:10:22,700 → 00:10:25,300\n노이즈·웅얼거림으로 발화 내용이 불명확합니다.", time: "00:10:22" },
  { id: 8, kind: "suspect", type: "발화 누락 가능", text: "00:12:55,100 → 00:12:58,600\n자막 없이 발화가 감지된 구간입니다.", time: "00:12:55" },
  { id: 9, kind: "suspect", type: "문맥 어색", text: "00:15:03,200 → 00:15:06,400\n앞 자막과 이어지는 맥락이 자연스럽지 않습니다.", time: "00:15:03" },
];

const AI_QC_FILTERS = ["전체", "확정 오류", "의심 구간", "띄어쓰기", "맞춤법", "CPS"];

// 자막 index → ai-qc 종류 (더미: 0~4 확정 오류, 5~8 의심 구간)
const AI_QC_INDEX_MAP = { 0: "error", 1: "error", 2: "error", 3: "error", 4: "error", 5: "suspect", 6: "suspect", 7: "suspect", 8: "suspect" };

function AiQcPanel({ filter, onFilterChange, onClose }) {
  const errorCount = AI_QC_ISSUES.filter((i) => i.kind === "error").length;
  const suspectCount = AI_QC_ISSUES.filter((i) => i.kind === "suspect").length;

  const filtered = AI_QC_ISSUES.filter((issue) => {
    if (filter === "전체") return true;
    if (filter === "확정 오류") return issue.kind === "error";
    if (filter === "의심 구간") return issue.kind === "suspect";
    if (filter === "CPS") return issue.type === "CPS 오류";
    if (filter === "띄어쓰기") return issue.type === "띄어쓰기 오류";
    if (filter === "맞춤법") return issue.type === "맞춤법 오류";
    return true;
  });

  return (
    <div className="ai-qc-panel">
      <div className="ai-qc-panel-header">
        <span className="ai-qc-panel-title">AI QC 결과 필터</span>
        <div className="ai-qc-panel-counts">
          <span className="ai-qc-count-error">총 오류: {errorCount}건</span>
          <span className="ai-qc-count-suspect">의심: {suspectCount}건</span>
        </div>
        <button className="ai-qc-panel-close" onClick={onClose}>×</button>
      </div>

      <div className="ai-qc-filters">
        {AI_QC_FILTERS.map((f) => (
          <button
            key={f}
            className={`ai-qc-filter-chip${filter === f ? " active" : ""}`}
            onClick={() => onFilterChange(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="ai-qc-issue-list">
        {filtered.map((issue) => (
          <div key={issue.id} className="ai-qc-issue-item">
            <span className="ai-qc-issue-num">#{issue.id}</span>
            <span className="ai-qc-issue-icon">
              {issue.kind === "error" ? "🔴" : "🟠"}
            </span>
            <div className="ai-qc-issue-body">
              <div className={`ai-qc-issue-type ${issue.kind}`}>{issue.type}</div>
              <div className="ai-qc-issue-text">{issue.text.split("\n")[1]}</div>
              <div className="ai-qc-issue-time">{issue.time}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="ai-qc-feature-cards">
        <div className="ai-qc-feature-cards-title">핵심 기능</div>
        <div className="ai-qc-feature-grid">
          <div className="ai-qc-feature-card">라인별 QC 표시</div>
          <div className="ai-qc-feature-card">오류 유형별 필터</div>
          <div className="ai-qc-feature-card">해당 라인 바로 이동</div>
          <div className="ai-qc-feature-card">확인 후 즉시 수정</div>
          <div className="ai-qc-feature-card full-width">확정 오류·의심 구간 색상 하이라이트</div>
        </div>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

const BLOCKED_EDIT_SHORTCUT_IDS = new Set([
  "outSync",
  "mergePrev",
  "mergeNext",
  "splitSync",
  "moveWordUp",
  "moveWordDown",
  "adjustSyncStart",
  "adjustSyncEnd",
  "adjustSyncEndPointLeft",
  "adjustSyncEndPointRight",
  "nudgeSyncLeft",
  "nudgeSyncRight",
  "undo",
  "redo",
  "useBoilerplate",
  "registerBoilerplate",
  "save",
  "openSpeakerManager",
  "addRow",
  "toggleCheck",
  "selectSpeaker",
]);

// 언어 선택 드롭다운 컴포넌트
const getLanguageDisplayName = (lang, uiLang) =>
  uiLang === "ko" ? lang.name : (lang.enName || lang.name);

const LanguageDropdown = memo(function LanguageDropdown({
  value,
  onChange,
  accentColor,
  disabled = false,
  style,
}) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const uiLang = i18n.language;

  const selectedLang = languages.find((l) => l.code === value) || languages[0];

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (code) => {
    if (disabled) return;
    onChange(code);
    setIsOpen(false);
  };

  const handleClick = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
  };

  return (
    <div
      className={`language-dropdown ${disabled ? "disabled" : ""}`}
      ref={dropdownRef}
      style={style}
    >
      <button
        className="language-dropdown-trigger"
        onClick={handleClick}
        style={{ borderColor: accentColor }}
        disabled={disabled}
      >
        <span className={`fi fi-${selectedLang.country?.toLowerCase()}`}></span>
        <span className="dropdown-lang-name">
          {getLanguageDisplayName(selectedLang, uiLang)}
        </span>
        {!disabled && (
          <span className="dropdown-arrow">{isOpen ? "▲" : "▼"}</span>
        )}
      </button>

      {isOpen && !disabled && (
        <div className="language-dropdown-menu">
          {languages.map((lang) => (
            <div
              key={lang.code}
              className={`language-dropdown-item ${lang.code === value ? "selected" : ""}`}
              onClick={() => handleSelect(lang.code)}
            >
              <span className={`fi fi-${lang.country?.toLowerCase()}`}></span>
              <span className="item-name">{getLanguageDisplayName(lang, uiLang)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// 체크박스 상태 Context (memo 우회용)
const CheckedContext = createContext({
  checkedIds: new Set(),
  onToggleCheck: () => {},
});

// 9-grid 위치 옵션
const POSITION_GRID = [
  ["topLeft", "topCenter", "topRight"],
  ["middleLeft", "center", "middleRight"],
  ["bottomLeft", "bottomCenter", "bottomRight"],
];

const EMPTY_ARRAY = [];

// 찾기/바꾸기 모달의 input(검색/대체)에 포커스가 있는 동안에는 자막 textarea
// 포커스 탈취를 금지한다.
//   - 검색 결과 클릭(또는 키보드 네비게이션 후 selectedSubtitleId 변경) 으로
//     이미 textarea 가 자동 포커스되던 회귀를 차단해, 사용자가 모달 input
//     에서 계속 검색어/치환어를 타이핑할 수 있도록 한다.
//   - 모달이 명시적으로 닫힐 때(onClose → focusSubtitleTextarea) 의 정상
//     포커스 흐름은 그대로 유지.
const isFindReplaceModalActive = () => {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  return !!active?.closest?.(".find-replace-modal-overlay");
};

// SubtitleItem 스토어 셀렉터용 O(1) 캐시 Map
let _cachedSubtitles = null;
let _cachedMap = null;

function getSubtitleById(subtitles, id) {
  if (subtitles !== _cachedSubtitles) {
    _cachedSubtitles = subtitles;
    _cachedMap = new Map(subtitles.map((s) => [s.id, s]));
  }
  return _cachedMap.get(id);
}

// 위치 선택 컴포넌트 - 메모이제이션
const PositionSelector = memo(function PositionSelector({
  position,
  onChange,
  onClick,
}) {
  return (
    <div className="position-selector" onClick={onClick}>
      {POSITION_GRID.map((row, rowIdx) => (
        <div key={rowIdx} className="position-row">
          {row.map((pos) => (
            <button
              key={pos}
              className={`position-cell ${position === pos ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(pos);
              }}
              title={pos}
            />
          ))}
        </div>
      ))}
    </div>
  );
});

// 시간 편집기 컴포넌트 - 인라인
const TimeEditor = memo(function TimeEditor({
  initialTime,
  onSave,
  onCancel,
  label,
}) {
  const [time, setTime] = useState(initialTime);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleSave = useCallback(() => {
    onSave(Math.max(0, time));
  }, [time, onSave]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        onCancel();
      }
    },
    [handleSave, onCancel],
  );

  const adjustTime = useCallback((delta) => {
    setTime((prev) => Math.max(0, prev + delta));
  }, []);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    // 타임코드 형식 또는 초 단위 숫자 허용
    const seconds = timeCodeToSeconds(value);
    if (!isNaN(seconds)) {
      setTime(seconds);
    }
  }, []);

  // 버튼 클릭 시 input blur 방지
  const handleButtonMouseDown = useCallback((e) => {
    e.preventDefault();
  }, []);

  return (
    <div className="time-editor-inline" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        type="text"
        className="time-editor-input"
        value={secondsToTimeCode(time)}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
      />
      <div className="time-editor-buttons">
        <button
          onMouseDown={handleButtonMouseDown}
          onClick={() => adjustTime(-1)}
          title="-1s"
        >
          -1
        </button>
        <button
          onMouseDown={handleButtonMouseDown}
          onClick={() => adjustTime(-0.1)}
          title="-100ms"
        >
          -.1
        </button>
        <button
          onMouseDown={handleButtonMouseDown}
          onClick={() => adjustTime(0.1)}
          title="+100ms"
        >
          +.1
        </button>
        <button
          onMouseDown={handleButtonMouseDown}
          onClick={() => adjustTime(1)}
          title="+1s"
        >
          +1
        </button>
      </div>
    </div>
  );
});

// 검수 결과 팝오버 컴포넌트
const ValidationPopover = memo(function ValidationPopover({ issues, onClose }) {
  const { t } = useTranslation("worktool");
  if (!issues || issues.length === 0) return null;

  return (
    <div className="validation-popover" onClick={(e) => e.stopPropagation()}>
      <div className="popover-header">
        <span>{t("subtitle.validationResult")}</span>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="popover-content">
        {issues.map((issue, idx) => (
          <div key={idx} className={`popover-issue ${issue.rule.severity}`}>
            <span className="issue-icon">{issue.rule.icon}</span>
            <div className="issue-info">
              <span className="issue-label">{issue.rule.label}</span>
              <span className="issue-msg">
                {issue.rule.getMessage(issue.value, issue.limit)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// 개별 자막 항목 컴포넌트 - 카드 스타일
const SubtitleItem = memo(
  function SubtitleItem({
    subtitleId,
    index,
    onSelect,
    updateSubtitle,
    onAdjustSyncStart,
    onAdjustSyncEnd,
    onNudgeSync,
    onNavigatePrev,
    onNavigateNext,
    onMoveToPrev,
    onMoveToNext,
    onMergeWithPrevious,
    onMergeWithNext,
    onSplitSubtitle,
    onMoveTextToPrev,
    onMoveTextToNext,
    onDeleteSubtitle,
    onOutSync,
    onUndo,
    onRedo,
    syncStartNudgeStepSec,
    onToggleLoop,
    onPlaySegment,
    onTogglePlayPause,
    onMediaSeek,
    forceEditing, // true 또는 { cursor: number }

    itemRef,
    validationResult,
    speakers,
    isTranslatorMode,
    showMiddleText,
    columnVisibility,
    onOpenSpeakerSelect,
    searchMatch, // 검색 매칭 정보
    readOnly = false, // 검수 완료로 인한 읽기 전용
    saveEditHistorySnapshot,
    reviewGroups = [],
    reviewTags = [],
    appliedReviewTags = [],
    onReviewTagToggle,
    isReviewMode = false,
    appliedComments = [],
    onCommentAdd,
    onCommentUpdate,
    onCommentDelete,
    currentUserId = "",
    projectFileId,
    onSpeakerNav,
    onSpeakerDropdownRef,
    onContextMenu,
    isContextTarget = false,
    aiQcKind,
  }) {
    const subtitle = useSubtitleStore(
      (s) => getSubtitleById(s.subtitles, subtitleId),
    );
    const { t } = useTranslation("worktool");
    const { checkedIds, onToggleCheck } = useContext(CheckedContext);
    const isChecked = checkedIds.has(subtitleId);

    const [showPopover, setShowPopover] = useState(false);
    const [showTagPopover, setShowTagPopover] = useState(false);
    const [tagPopoverAnchor, setTagPopoverAnchor] = useState(null);
    // 선택/활성 상태를 store에서 직접 구독 (부모 리렌더 방지)
    const isSelected = useSubtitleStore(
      (s) => s.selectedSubtitleId === subtitleId,
    );
    const isActive = usePlaybackStore((s) => {
      if (!subtitle) return false;
      const { currentTime } = s;
      return currentTime >= subtitle.startTime && currentTime <= subtitle.endTime;
    });

    const [showCommentPopover, setShowCommentPopover] = useState(false);
    const [commentPopoverAnchor, setCommentPopoverAnchor] = useState(null);


    // 로컬 텍스트 상태 (성능 최적화: 디바운스 저장)
    const [localText, setLocalText] = useState(subtitle?.text || "");
    const debounceRef = useRef(null);
    const skipTextSyncRef = useRef(false);
    const textDirtyRef = useRef(false);
    const undoSnapshotSavedRef = useRef(false);
    const undoBoundaryTimerRef = useRef(null);

    // 시간 편집 상태
    const [editingTime, setEditingTime] = useState(null); // 'start' | 'end' | null
    const [localStartTime, setLocalStartTime] = useState("");
    const [localEndTime, setLocalEndTime] = useState("");
    const startTimeRef = useRef(null);
    const endTimeRef = useRef(null);

    // subtitle.text가 외부에서 변경되면 로컬 상태 동기화
    useEffect(() => {
      if (skipTextSyncRef.current) {
        skipTextSyncRef.current = false;
        return;
      }
      // textDirtyRef가 false이면 undo/redo 등 외부 변경이므로 포커스 중이어도 동기화
      if (textDirtyRef.current && document.activeElement === textareaRef.current) return;
      setLocalText(subtitle?.text || ""); // eslint-disable-line -- prop→local state 동기화
      textDirtyRef.current = false;
    }, [subtitle?.text]);

    // 단축키/설정 store
    const getShortcutId = useShortcutsStore((state) => state.getShortcutId);
    const generalSettings = useSettingsStore((state) => state.general);

    const textareaRef = useRef(null);
    const divRef = useRef(null);

    // itemRef 콜백과 내부 ref 연결
    const setRefs = useCallback(
      (el) => {
        divRef.current = el;
        if (itemRef) itemRef(el);
      },
      [itemRef],
    );

    // 화자 드롭다운 imperative ref 등록 (Ctrl+F1 글로벌 단축키에서 open() 호출용)
    const setSpeakerDropdownRefForRow = useCallback(
      (instance) => {
        onSpeakerDropdownRef?.(subtitleId, instance);
      },
      [onSpeakerDropdownRef, subtitleId],
    );

    const handleClick = (e) => {
      onSelect(subtitle.id, subtitle.startTime, subtitle.endTime);
      if (e?.ctrlKey || e?.metaKey) {
        onPlaySegment?.(subtitle);
      }
    };
    const durationSec = (subtitle.endTime - subtitle.startTime).toFixed(2);
    const durationMs = (subtitle.endTime - subtitle.startTime) * 1000;
    const isDurationOutOfRange =
      Number.isFinite(durationMs) &&
      durationMs > 0 &&
      (durationMs < (generalSettings?.minDurationMs ?? 0) ||
        durationMs > (generalSettings?.maxDurationMs ?? Infinity));
    const isLineCountExceeded =
      localText.split('\n').length > (generalSettings?.maxNumberOfLines ?? Infinity);

    // 시간 편집 시작
    const handleTimeClick = useCallback(
      (type, e) => {
        e.stopPropagation();
        if (type === "start") {
          setLocalStartTime(secondsToTimeCode(subtitle.startTime));
          setEditingTime("start");
          setTimeout(() => startTimeRef.current?.select(), 0);
        } else {
          setLocalEndTime(secondsToTimeCode(subtitle.endTime));
          setEditingTime("end");
          setTimeout(() => endTimeRef.current?.select(), 0);
        }
      },
      [subtitle.startTime, subtitle.endTime],
    );

    // 시간 편집 저장
    const handleTimeSave = useCallback(
      (type) => {
        const value = type === "start" ? localStartTime : localEndTime;
        const seconds = timeCodeToSeconds(value);

        if (seconds !== null && !isNaN(seconds)) {
          if (type === "start") {
            // 시작 시간이 종료 시간보다 크면 무시
            if (seconds < subtitle.endTime) {
              updateSubtitle(subtitle.id, { startTime: seconds });
            }
          } else {
            // 종료 시간이 시작 시간보다 작으면 무시
            if (seconds > subtitle.startTime) {
              updateSubtitle(subtitle.id, { endTime: seconds });
            }
          }
        }
        setEditingTime(null);
      },
      [
        localStartTime,
        localEndTime,
        subtitleId,
        subtitle?.startTime,
        subtitle?.endTime,
        updateSubtitle,
      ],
    );

    // 시간 편집 키보드 핸들러
    const handleTimeKeyDown = useCallback(
      (type, e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleTimeSave(type);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setEditingTime(null);
        } else if (e.key === "Tab") {
          e.preventDefault();
          handleTimeSave(type);
          // Tab으로 다음 필드로 이동
          if (type === "start") {
            setLocalEndTime(secondsToTimeCode(subtitle.endTime));
            setEditingTime("end");
            setTimeout(() => endTimeRef.current?.select(), 0);
          }
        }
      },
      [handleTimeSave, subtitle?.endTime],
    );

    // 텍스트 변경 핸들러 (디바운스 적용 + 타이핑 세션 undo)
    const handleTextChange = useCallback(
      (e) => {
        const newText = e.target.value;
        setLocalText(newText);
        textDirtyRef.current = true;

        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }

        // 타이핑 세션의 첫 입력 시 undo 스냅샷 1회 저장 (비동기로 지연하여 입력 차단 방지)
        if (!undoSnapshotSavedRef.current) {
          undoSnapshotSavedRef.current = true;
          queueMicrotask(() => useSubtitleStore.getState().pushUndo());
        }

        // 1초간 입력 없으면 undo 경계 리셋 → 다음 입력이 새 undo 단계
        if (undoBoundaryTimerRef.current) {
          clearTimeout(undoBoundaryTimerRef.current);
        }
        undoBoundaryTimerRef.current = setTimeout(() => {
          undoSnapshotSavedRef.current = false;
        }, 1000);

        // textDirtyRef 는 "blur 시점에 saveEditHistorySnapshot 을 호출해야 하는가"
        // 를 추적하므로 디바운스/공백 커밋 경로에서 리셋하지 않는다.
        // (리셋하면 사용자가 타이핑한 텍스트가 로컬 편집 이력에 절대 쌓이지 않는다.)
        const inputData = e.nativeEvent?.data;
        if (inputData === " " || inputData === "\n") {
          updateSubtitle(subtitleId, { text: newText }, { skipHistory: true });
          undoSnapshotSavedRef.current = false;
          return;
        }

        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          updateSubtitle(subtitleId, { text: newText }, { skipHistory: true });
        }, 300);
      },
      [subtitleId, updateSubtitle],
    );

    // 컴포넌트 언마운트(또는 subtitleId 변경) 시, 보류 중인 디바운스 텍스트를 즉시 스토어로 flush.
    // (ref 값은 cleanup 시점에 직접 읽어야 한다. setup 시점에 const 로 캡처하면 마운트 직후의
    //  null 값을 보존하게 되어 실제 unmount 시점의 debounceRef.current 를 못 본다.)
    useEffect(() => {
      return () => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
          if (textareaRef.current) {
            updateSubtitle(
              subtitleId,
              // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 cleanup 시점의 ref 값 사용
              { text: textareaRef.current.value },
              { skipHistory: true },
            );
          }
        }
      };
    }, [subtitleId, updateSubtitle]);

    // CPS 계산 (메모이제이션) — cpsUtils 통합 유틸 사용
    const { maxCharactersPerSec, maxLineLength, charCountPreset } = generalSettings;
    const maxSegmentLen = useAIStore(
      (state) => state.stt?.segmentOptions?.maxSegmentLength ?? 0,
    );
    const cpsInfo = useMemo(() => {
      const info = getSubtitleCpsInfo(localText, subtitle.endTime - subtitle.startTime, charCountPreset);
      // 바이트 수 계산 (한글 등 CJK=2, ASCII=1)
      const textBytes = (localText || '').split('').reduce(
        (acc, ch) => acc + (ch.charCodeAt(0) > 0x7F ? 2 : 1), 0,
      );
      return {
        ...info,
        textBytes,
        isBytesOver: maxSegmentLen > 0 && textBytes > maxSegmentLen,
        isCpsOver: info.cps > maxCharactersPerSec,
        hasLineOver: info.lineLengths.some((len) => len > maxLineLength),
      };
    }, [localText, subtitle?.startTime, subtitle?.endTime, maxCharactersPerSec, maxLineLength, charCountPreset, maxSegmentLen]);

    useEffect(() => {
      if (readOnly) return;
      if (forceEditing) {
        setTimeout(() => {
          // 가상화 환경에서 행이 remount 될 때 forceEditing 이 그대로 truthy 면
          // 사용자가 다른 모달(찾기/바꾸기) 입력 중에도 textarea 가 포커스를 가로채는
          // 회귀가 발생할 수 있어 가드.
          if (isFindReplaceModalActive()) return;
          if (textareaRef.current) {
            textareaRef.current.focus();
            const pos = typeof forceEditing === 'object' && forceEditing.cursor != null
              ? forceEditing.cursor
              : textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(pos, pos);
          }
        }, 0);
      }
    }, [forceEditing, readOnly]);

    const focusTextarea = useCallback(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }, []);

    const focusCard = useCallback(() => {
      if (divRef.current) {
        divRef.current.focus();
      }
    }, []);

    const isCtrlEnter = useCallback(
      (e) =>
        (e.key === "Enter" ||
          e.key === "NumpadEnter" ||
          e.code === "Enter" ||
          e.code === "NumpadEnter") &&
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey,
      [],
    );

    // div 키보드 핸들러
    const handleItemKeyDown = useCallback(
      (e) => {
        const shortcutId = getShortcutId(e);
        if (readOnly && BLOCKED_EDIT_SHORTCUT_IDS.has(shortcutId)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Ctrl/⌘ + Space: 선택 싱크 라인 재생
        if (
          (e.ctrlKey || e.metaKey) &&
          !e.altKey &&
          !e.shiftKey &&
          (e.key === " " || e.code === "Space")
        ) {
          e.preventDefault();
          onPlaySegment?.(subtitle);
          return;
        }
        // Shift + Space: 재생/일시정지 토글
        if (
          e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          (e.key === " " || e.code === "Space")
        ) {
          e.preventDefault();
          e.stopPropagation();
          onTogglePlayPause?.();
          return;
        }
        // Alt + ↑: 이전 싱크 라인으로 이동
        if (shortcutId === "prevSyncLine") {
          e.preventDefault();
          if (document.activeElement !== textareaRef.current) {
            onMoveToPrev(subtitle.id);
          }
        }
        // Alt + ↓: 다음 싱크 라인으로 이동
        else if (shortcutId === "nextSyncLine") {
          e.preventDefault();
          if (document.activeElement !== textareaRef.current) {
            onMoveToNext(subtitle.id);
          }
        }
        // Ctrl/⌘ + Enter: 아웃 싱크 입력
        else if (shortcutId === "outSync") {
          e.preventDefault();
          onOutSync?.(subtitle.id);
        }
        // 편집 모드 전환 (Alt + Enter)
        else if (shortcutId === "toggleEditMode") {
          e.preventDefault();
          e.stopPropagation();
          if (document.activeElement === textareaRef.current) {
            textareaRef.current.blur();
            const card = textareaRef.current.closest(".subtitle-card");
            if (card) card.focus();
          } else if (textareaRef.current && !readOnly) {
            textareaRef.current.focus();
          }
        }
      },
      [
        readOnly,
        subtitle,
        subtitleId,
        getShortcutId,
        onMoveToPrev,
        onMoveToNext,
        focusTextarea,
        onOutSync,
        onToggleLoop,
        onPlaySegment,
        onTogglePlayPause,
      ],
    );

    // 더블클릭 → textarea에 포커스
    const handleDoubleClick = useCallback((e) => {
      if (e.target.closest(".card-checkbox")) return;
      e.stopPropagation();
      if (readOnly) return;
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
    }, [readOnly]);

    // 커서가 첫 줄에 있는지 확인
    const isOnFirstLine = useCallback((textarea) => {
      const pos = textarea.selectionStart;
      const text = textarea.value;
      // 커서 위치 이전에 줄바꿈이 없으면 첫 줄
      return !text.substring(0, pos).includes("\n");
    }, []);

    // 커서가 마지막 줄에 있는지 확인
    const isOnLastLine = useCallback((textarea) => {
      const pos = textarea.selectionStart;
      const text = textarea.value;
      // 커서 위치 이후에 줄바꿈이 없으면 마지막 줄
      return !text.substring(pos).includes("\n");
    }, []);

    // 이전 자막과 합치기 (Ctrl + ↑)
    const mergeWithPrev = useCallback(() => {
      onMergeWithPrevious(subtitleId);
    }, [subtitleId, onMergeWithPrevious]);

    // 다음 자막과 합치기 (Ctrl + ↓)
    const mergeWithNext = useCallback(() => {
      onMergeWithNext(subtitleId);
    }, [subtitleId, onMergeWithNext]);

    // 자막 나누기 (Shift + Enter)
    const splitAtCursor = useCallback(() => {
      if (textareaRef.current) {
        const cursorPos = textareaRef.current.selectionStart;
        const currentText = textareaRef.current.value;
        onSplitSubtitle(subtitleId, cursorPos, currentText);
      }
    }, [subtitleId, onSplitSubtitle]);

    // 커서 앞 텍스트를 이전 자막으로 이동 (Shift + ↑)
    const moveTextToPrev = useCallback(() => {
      const cursorPos = textareaRef.current?.selectionStart ?? 0;
      onMoveTextToPrev(subtitleId, cursorPos);
    }, [subtitleId, onMoveTextToPrev]);

    // 커서 뒤 텍스트를 다음 자막으로 이동 (Shift + ↓)
    const moveTextToNext = useCallback(() => {
      const cursorPos =
        textareaRef.current?.selectionStart ??
        textareaRef.current?.value?.length ??
        0;
      onMoveTextToNext(subtitleId, cursorPos);
    }, [subtitleId, onMoveTextToNext]);

    const deleteCurrentSubtitle = useCallback(() => {
      if (subtitleId) {
        onDeleteSubtitle(subtitleId);
      }
    }, [subtitleId, onDeleteSubtitle]);

    const selectByWord = useCallback(
      (direction) => {
        if (!textareaRef.current) return;
        const textarea = textareaRef.current;
        const text = textarea.value;
        const selectionStart = textarea.selectionStart;
        const selectionEnd = textarea.selectionEnd;
        const isCollapsed = selectionStart === selectionEnd;
        const isWhitespace = (ch) => /\s/.test(ch);
        const len = text.length;
        const pos =
          direction === "left"
            ? isCollapsed
              ? selectionStart
              : Math.min(selectionStart, selectionEnd)
            : isCollapsed
              ? selectionStart
              : Math.max(selectionStart, selectionEnd);

        // 이미 텍스트 경계에 있으면 이전/다음 세그먼트로 이동
        if (direction === "left" && pos === 0) {
          onNavigatePrev(subtitle.id);
          return;
        }
        if (direction === "right" && pos === len) {
          onNavigateNext(subtitle.id, 0);
          return;
        }

        if (direction === "left") {
          let end = pos;
          while (end > 0 && isWhitespace(text[end - 1])) end -= 1;
          if (end === 0) {
            onNavigatePrev(subtitle.id, 0);
            return;
          }
          let start = end;
          while (start > 0 && !isWhitespace(text[start - 1])) start -= 1;
          textarea.setSelectionRange(start, end);
          return;
        }

        let start = pos;
        while (start < len && isWhitespace(text[start])) start += 1;
        if (start >= len) {
          onNavigateNext(subtitle.id, 0);
          return;
        }
        let end = start;
        while (end < len && !isWhitespace(text[end])) end += 1;
        textarea.setSelectionRange(start, end);
      },
      [onNavigatePrev, onNavigateNext, subtitle.id],
    );

    const moveCursorToBlockEdge = useCallback((direction) => {
      if (!textareaRef.current) return;
      const textarea = textareaRef.current;
      const text = textarea.value;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      const isWhitespace = (ch) => /\s/.test(ch);

      if (selectionStart !== selectionEnd) {
        const target =
          direction === "home"
            ? Math.min(selectionStart, selectionEnd)
            : Math.max(selectionStart, selectionEnd);
        textarea.setSelectionRange(target, target);
        return;
      }

      const pos = selectionStart;
      let nextPos = pos;

      if (direction === "home") {
        let i = pos;
        while (i > 0 && isWhitespace(text[i - 1])) i -= 1;
        while (i > 0 && !isWhitespace(text[i - 1])) i -= 1;
        nextPos = i;
      } else {
        let i = pos;
        while (i < text.length && isWhitespace(text[i])) i += 1;
        while (i < text.length && !isWhitespace(text[i])) i += 1;
        nextPos = i;
      }

      textarea.setSelectionRange(nextPos, nextPos);
    }, []);

    // 키보드 핸들러
    const handleKeyDown = useCallback(
      (e) => {
        const shortcutId = getShortcutId(e);
        // 편집 모드 전환: textarea → 카드 포커스
        if (shortcutId === "toggleEditMode") {
          e.preventDefault();
          e.stopPropagation();
          textareaRef.current?.blur();
          const card = textareaRef.current?.closest(".subtitle-card");
          if (card) card.focus();
          return;
        }
        // Ctrl/⌘ + Enter: 아웃 싱크 입력 (현재 자막 뒤에 빈 자막 추가)
        if (shortcutId === "outSync") {
          e.preventDefault();
          e.stopPropagation();
          onOutSync?.(subtitle.id);
          return;
        }
        // Ctrl/⌘ + Space: 선택 싱크 라인 재생
        if (
          (e.ctrlKey || e.metaKey) &&
          !e.altKey &&
          !e.shiftKey &&
          (e.key === " " || e.code === "Space")
        ) {
          e.preventDefault();
          onPlaySegment?.(subtitle);
          return;
        }
        // Shift + Space: 재생/일시정지 토글
        if (
          e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          (e.key === " " || e.code === "Space")
        ) {
          e.preventDefault();
          e.stopPropagation();
          onTogglePlayPause?.();
          return;
        }
        // Shift + ←: 뒤로 시간 이동
        if (shortcutId === "seekBackward") {
          e.preventDefault();
          e.stopPropagation();
          onMediaSeek?.("backward");
          return;
        }
        // Shift + →: 앞으로 시간 이동
        if (shortcutId === "seekForward") {
          e.preventDefault();
          e.stopPropagation();
          onMediaSeek?.("forward");
          return;
        }
        if (
          readOnly &&
          (BLOCKED_EDIT_SHORTCUT_IDS.has(shortcutId) ||
            ((e.ctrlKey || e.metaKey) &&
              !e.altKey &&
              !e.shiftKey &&
              (e.key === "ArrowLeft" || e.key === "ArrowRight")) ||
            (e.key === "Backspace" &&
              e.shiftKey &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey))
        ) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // F10: 상용구 즉시 등록 (key:word 형식)
        if (shortcutId === "registerBoilerplate") {
          e.preventDefault();
          const textarea = textareaRef.current;
          if (!textarea) return;

          const text = textarea.value;
          const cursorPos = textarea.selectionStart;
          // 커서 앞쪽 텍스트에서 key:value 패턴 찾기
          const textBeforeCursor = text.slice(0, cursorPos);
          // 키 시작점: 커서 앞 텍스트에서 마지막 줄바꿈 이후의 첫 번째 : 를 찾고, 그 앞의 공백 위치
          let lineStart = textBeforeCursor.lastIndexOf('\n') + 1;
          const lineText = textBeforeCursor.slice(lineStart);
          const colonInLine = lineText.indexOf(":");
          if (colonInLine < 0) {
            toast.warning(t("subtitle.boilerplateInvalidFormat"));
            return;
          }
          // : 앞에서 공백을 역방향 탐색하여 키 시작점 결정
          let keyStart = colonInLine;
          while (keyStart > 0 && lineText[keyStart - 1] !== ' ' && lineText[keyStart - 1] !== '\t') {
            keyStart--;
          }
          const entryStart = lineStart + keyStart;

          const rawText = text.slice(entryStart, cursorPos);
          const colonIdx = rawText.indexOf(":");
          if (colonIdx <= 0 || colonIdx >= rawText.length - 1) {
            toast.warning(t("subtitle.boilerplateInvalidFormat"));
            return;
          }

          const bpKey = rawText.slice(0, colonIdx).trim();
          const bpWord = rawText.slice(colonIdx + 1).trim();
          if (!bpKey || !bpWord) {
            toast.warning(t("subtitle.boilerplateInvalidFormat"));
            return;
          }

          try {
            const stored = localStorage.getItem("boilerplate_data");
            const list = stored ? JSON.parse(stored) : [];
            const existIdx = list.findIndex((item) => item.key === bpKey);
            if (existIdx >= 0) {
              list[existIdx].word = bpWord;
            } else {
              list.push({ key: bpKey, word: bpWord });
            }
            localStorage.setItem("boilerplate_data", JSON.stringify(list));
          } catch {
            toast.error(t("subtitle.boilerplateRegisterFailed"));
            return;
          }

          const newText = text.slice(0, entryStart) + text.slice(cursorPos);
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          skipTextSyncRef.current = true;
          setLocalText(newText);
          updateSubtitle(subtitle.id, { text: newText });
          setTimeout(() => {
            textarea.setSelectionRange(entryStart, entryStart);
          }, 0);
          toast.success(t("subtitle.boilerplateRegistered", { key: bpKey, word: bpWord }));
          return;
        }
        // F3: 상용구 사용
        if (shortcutId === "useBoilerplate") {
          e.preventDefault();
          const textarea = textareaRef.current;
          if (textarea) {
            const text = textarea.value;
            const cursorPos = textarea.selectionStart;
            // 커서 왼쪽 단어 경계 찾기 (공백 기준)
            let wordStart = cursorPos;
            while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) {
              wordStart--;
            }

            if (cursorPos > wordStart) {
              try {
                const storedData = localStorage.getItem("boilerplate_data");
                if (storedData) {
                  const boilerplateList = JSON.parse(storedData);
                  // 커서 왼쪽 부분 문자열에서 가장 긴 매칭부터 탐색
                  let matched = null;
                  let matchStart = wordStart;
                  for (let i = wordStart; i < cursorPos; i++) {
                    const candidate = text.slice(i, cursorPos);
                    const found = boilerplateList.find(
                      (item) => item.key === candidate,
                    );
                    if (found) {
                      matched = found;
                      matchStart = i;
                      break;
                    }
                  }
                  if (matched) {
                    if (debounceRef.current) {
                      clearTimeout(debounceRef.current);
                      debounceRef.current = null;
                    }
                    const newText =
                      text.slice(0, matchStart) +
                      matched.word +
                      text.slice(cursorPos);
                    skipTextSyncRef.current = true;
                    setLocalText(newText);
                    updateSubtitle(subtitle.id, { text: newText });

                    const newCursorPos = matchStart + matched.word.length;
                    setTimeout(() => {
                      textarea.setSelectionRange(newCursorPos, newCursorPos);
                    }, 0);
                  }
                }
              } catch (err) {
                console.error("상용구 데이터 로드 실패:", err);
              }
            }
          }
          return;
        }
        // F10: 상용구 관리 모달 열기 (전역 핸들러에서 처리)
        // Alt + ↑: 편집 중 이전 싱크 편집으로 이동
        else if (shortcutId === "prevSyncLine") {
          e.preventDefault();
          onNavigatePrev(subtitle.id);
        }
        // Alt + ↓: 편집 중 다음 싱크 편집으로 이동
        else if (shortcutId === "nextSyncLine") {
          e.preventDefault();
          onNavigateNext(subtitle.id);
        }
        // Alt/⌥ + ←: 싱크 시작점 앞으로 미세 조정
        else if (shortcutId === "adjustSyncStart") {
          e.preventDefault();
          const step = syncStartNudgeStepSec ?? 0.1;
          onAdjustSyncStart?.(subtitle.id, -step);
        }
        // Alt/⌥ + →: 싱크 시작점 뒤로 미세 조정
        else if (shortcutId === "adjustSyncEnd") {
          e.preventDefault();
          const step = syncStartNudgeStepSec ?? 0.1;
          onAdjustSyncStart?.(subtitle.id, step);
        }
        // Alt/⌥ + Shift + ←: 싱크 종료점 앞으로 미세 조정
        else if (shortcutId === "adjustSyncEndPointLeft") {
          e.preventDefault();
          const step = syncStartNudgeStepSec ?? 0.1;
          onAdjustSyncEnd?.(subtitle.id, -step);
        }
        // Alt/⌥ + Shift + →: 싱크 종료점 뒤로 미세 조정
        else if (shortcutId === "adjustSyncEndPointRight") {
          e.preventDefault();
          const step = syncStartNudgeStepSec ?? 0.1;
          onAdjustSyncEnd?.(subtitle.id, step);
        }
        // Ctrl + Alt/⌥ + ←: 싱크 전체 앞으로 이동
        else if (shortcutId === "nudgeSyncLeft") {
          e.preventDefault();
          const step = syncStartNudgeStepSec ?? 0.1;
          onNudgeSync?.(subtitle.id, -step);
        }
        // Ctrl + Alt/⌥ + →: 싱크 전체 뒤로 이동
        else if (shortcutId === "nudgeSyncRight") {
          e.preventDefault();
          const step = syncStartNudgeStepSec ?? 0.1;
          onNudgeSync?.(subtitle.id, step);
        }
        // Shift + Enter: 자막 나누기
        else if (shortcutId === "splitSync") {
          e.preventDefault();
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          textDirtyRef.current = false;
          splitAtCursor();
        }
        // Ctrl/⌘ + Z: 되돌리기
        else if (shortcutId === "undo") {
          e.preventDefault();
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
            updateSubtitle(subtitleId, { text: textareaRef.current.value }, { skipHistory: true });
          }
          if (undoBoundaryTimerRef.current) {
            clearTimeout(undoBoundaryTimerRef.current);
            undoBoundaryTimerRef.current = null;
          }
          undoSnapshotSavedRef.current = false;
          textDirtyRef.current = false;
          onUndo();
        }
        // Ctrl/⌘ + Shift + Z: 다시 실행
        else if (shortcutId === "redo") {
          e.preventDefault();
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
            updateSubtitle(subtitleId, { text: textareaRef.current.value }, { skipHistory: true });
          }
          if (undoBoundaryTimerRef.current) {
            clearTimeout(undoBoundaryTimerRef.current);
            undoBoundaryTimerRef.current = null;
          }
          undoSnapshotSavedRef.current = false;
          textDirtyRef.current = false;
          onRedo();
        }
        // Ctrl/⌘ + ↑: 이전 자막과 합치기
        else if (shortcutId === "mergePrev") {
          e.preventDefault();
          mergeWithPrev();
        }
        // Ctrl/⌘ + ↓: 다음 자막과 합치기
        else if (shortcutId === "mergeNext") {
          e.preventDefault();
          mergeWithNext();
        }
        // Shift + ↑: 커서 앞 텍스트를 이전 자막으로 이동
        else if (shortcutId === "moveWordUp") {
          e.preventDefault();
          moveTextToPrev();
        }
        // Shift + ↓: 커서 뒤 텍스트를 다음 자막으로 이동
        else if (shortcutId === "moveWordDown") {
          e.preventDefault();
          moveTextToNext();
        }
        // Ctrl/⌘ + ←: 왼쪽으로 커서 이동 (단어 단위)
        else if (
          e.key === "ArrowLeft" &&
          (e.ctrlKey || e.metaKey) &&
          !e.altKey &&
          !e.shiftKey
        ) {
          e.preventDefault();
          selectByWord("left");
        }
        // Ctrl/⌘ + →: 오른쪽으로 커서 이동 (단어 단위)
        else if (
          e.key === "ArrowRight" &&
          (e.ctrlKey || e.metaKey) &&
          !e.altKey &&
          !e.shiftKey
        ) {
          e.preventDefault();
          selectByWord("right");
        }
        // Shift + Backspace: 싱크 지우기
        else if (
          e.key === "Backspace" &&
          e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          e.preventDefault();
          deleteCurrentSubtitle();
        }
        // Shift + Home: 선택 해제 후 블록 앞으로 커서 이동
        else if (
          e.key === "Home" &&
          e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          e.preventDefault();
          moveCursorToBlockEdge("home");
        }
        // Shift + End: 선택 해제 후 블록 뒤로 커서 이동
        else if (
          e.key === "End" &&
          e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          e.preventDefault();
          moveCursorToBlockEdge("end");
        }
        // Escape: 포커스 해제
        else if (e.key === "Escape") {
          e.preventDefault();
          textareaRef.current?.blur();
        }
        // 위쪽 방향키: 첫 줄에서 이전 자막으로 이동
        else if (
          e.key === "ArrowUp" &&
          !e.shiftKey &&
          textareaRef.current &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          if (isOnFirstLine(textareaRef.current)) {
            e.preventDefault();
            onNavigatePrev(subtitle.id, 0);
          }
        }
        // 아래쪽 방향키: 마지막 줄에서 다음 자막으로 이동
        else if (
          e.key === "ArrowDown" &&
          !e.shiftKey &&
          textareaRef.current &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          if (isOnLastLine(textareaRef.current)) {
            e.preventDefault();
            onNavigateNext(subtitle.id, 0);
          }
        }
        // 왼쪽 방향키: 텍스트 시작에서 이전 자막 끝으로 이동
        else if (
          e.key === "ArrowLeft" &&
          !e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          textareaRef.current
        ) {
          const textarea = textareaRef.current;
          if (textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
            e.preventDefault();
            onNavigatePrev(subtitle.id);
          }
        }
        // 오른쪽 방향키: 텍스트 끝에서 다음 자막 처음으로 이동
        else if (
          e.key === "ArrowRight" &&
          !e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          textareaRef.current
        ) {
          const textarea = textareaRef.current;
          const len = textarea.value.length;
          if (
            textarea.selectionStart === len &&
            textarea.selectionEnd === len
          ) {
            e.preventDefault();
            onNavigateNext(subtitle.id, 0);
          }
        }
      },
      [
        readOnly,
        subtitle,
        subtitleId,
        subtitle?.speakerId,
        isOnFirstLine,
        isOnLastLine,
        onNavigatePrev,
        onNavigateNext,
        mergeWithPrev,
        mergeWithNext,
        splitAtCursor,
        moveTextToPrev,
        moveTextToNext,
        getShortcutId,
        onOpenSpeakerSelect,
        onAdjustSyncStart,
        onAdjustSyncEnd,
        onNudgeSync,
        syncStartNudgeStepSec,
        selectByWord,
        moveCursorToBlockEdge,
        deleteCurrentSubtitle,
        focusCard,
        onOutSync,
        onToggleLoop,
        onPlaySegment,
        onTogglePlayPause,
        onMediaSeek,
        updateSubtitle,
        onUndo,
        onRedo,
        t,
      ],
    );

    // 검수 결과 아이콘 결정
    const validationIcon = useMemo(() => {
      if (!validationResult) return null;
      if (!validationResult.issues || validationResult.issues.length === 0) {
        return SEVERITY_ICONS.pass;
      }
      return SEVERITY_ICONS[validationResult.severity] || null;
    }, [validationResult]);

    const handleValidationClick = useCallback(
      (e) => {
        e.stopPropagation();
        if (validationResult?.issues?.length > 0) {
          setShowPopover((prev) => !prev);
        }
      },
      [validationResult],
    );

    if (!subtitle) return null;

    // 화자 정보
    const speaker =
      subtitle.speakerId != null ? speakers[subtitle.speakerId] : null;

    const handleContextMenu = (e) => {
      if (!onContextMenu) return;
      e.preventDefault();
      onContextMenu(e, subtitleId);
    };

    return (
      <div
        ref={setRefs}
        className={`subtitle-card ${isSelected ? "selected" : ""} ${isActive ? "active" : ""} ${validationResult?.severity ? `validation-${validationResult.severity}` : ""} ${aiQcKind ? `ai-qc-${aiQcKind}` : ""} ${searchMatch ? "search-match" : ""} ${isContextTarget ? "context-target" : ""}`}
        tabIndex={isSelected ? 0 : -1}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleItemKeyDown}
        onContextMenu={handleContextMenu}
      >
        {/* 화자/위치 설정 영역 */}
        {columnVisibility?.speakerPosition !== false && (
          <div className="card-left">
            <div className="card-index">
              <span
                className={`card-checkbox ${isChecked ? "checked" : ""}`}
                title={t("subtitle.checkboxShiftHint")}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCheck?.(subtitle.id, !isChecked, e.shiftKey);
                }}
              />
              <span className="index-number">#{index + 1}</span>
              {isActive && <span className="now-playing-indicator">▶</span>}
            </div>
            <div className="card-speaker" onClick={(e) => e.stopPropagation()}>
              {speaker && (
                <span
                  className="speaker-dot"
                  style={{ background: speaker.color }}
                />
              )}
              <SpeakerSelectDropdown
                ref={setSpeakerDropdownRefForRow}
                value={subtitle.speakerId ?? null}
                speakers={speakers}
                onChange={(newId) => {
                  updateSubtitle(subtitle.id, { speakerId: newId });
                }}
                onClosedArrowVertical={(dir) => onSpeakerNav?.(subtitle.id, dir)}
                onClosedArrowLeft={() => onSpeakerNav?.(subtitle.id, -1)}
                onClosedArrowRight={() => textareaRef.current?.focus()}
                onClosedEscape={() => textareaRef.current?.focus()}
              />
            </div>
            <div className="card-position" onClick={(e) => e.stopPropagation()}>
              <PositionSelector
                position={subtitle.position || "bottomCenter"}
                onChange={(pos) =>
                  updateSubtitle(subtitle.id, { position: pos })
                }
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {validationIcon && (
              <div className="card-validation" onClick={handleValidationClick}>
                <span
                  className={`validation-icon ${validationResult?.severity || "pass"}`}
                  title={t("subtitle.validationResult")}
                >
                  {validationIcon}
                </span>
                {showPopover && validationResult?.issues?.length > 0 && (
                  <ValidationPopover
                    issues={validationResult.issues}
                    onClose={() => setShowPopover(false)}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* 텍스트 영역 */}
        <div
          className={`card-right ${!columnVisibility?.speakerPosition ? "full-width" : ""}`}
        >
          <div
            className={`card-text ${isTranslatorMode ? "translator-mode" : ""}`}
          >
            {/* 출발어 */}
            {isTranslatorMode && columnVisibility?.sourceText !== false && (
              <div className="source-text-column">
                <div
                  className="source-text-content"
                  title={subtitle.sourceText || ""}
                >
                  {subtitle.sourceText || "-"}
                </div>
              </div>
            )}
            {/* 중간어 */}
            {isTranslatorMode &&
              showMiddleText &&
              columnVisibility?.middleText !== false && (
                <div className="middle-text-column">
                  <div
                    className="middle-text-content"
                    title={subtitle.middleText || ""}
                  >
                    {subtitle.middleText || "-"}
                  </div>
                </div>
              )}
            {/* 도착어 (편집 가능, 항상 표시) */}
            <textarea
              ref={textareaRef}
              className={`card-text-editor always-editable ${isTranslatorMode ? "translator-target" : ""} ${readOnly ? "read-only" : ""} ${isDurationOutOfRange || isLineCountExceeded ? "duration-out-of-range" : ""}`}
              value={localText}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onBlur={(e) => {
                // 보류 중인 텍스트 변경 즉시 반영
                if (debounceRef.current) {
                  clearTimeout(debounceRef.current);
                  debounceRef.current = null;
                  updateSubtitle(
                    subtitle.id,
                    { text: textareaRef.current.value },
                    { skipHistory: true },
                  );
                }
                // 실제로 텍스트가 변경된 경우에만 이력 저장
                if (textDirtyRef.current) {
                  textDirtyRef.current = false;
                  saveEditHistorySnapshot?.(t("subtitle.editButton"), {
                    text: localText,
                  });
                }

                if (e.relatedTarget && !divRef.current?.contains(e.relatedTarget)) return;
                // 화자 select 로 focus 가 명시적으로 이동한 경우는 카드로 되돌리지 않음
                // (Ctrl+F1 등에서 dropdown 으로 가는 focus 가 가로채이는 문제 방지)
                if (e.relatedTarget?.classList?.contains?.("speaker-select")) return;
                focusCard();
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (e.ctrlKey || e.metaKey) {
                  onPlaySegment?.(subtitle);
                }
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onFocus={() => {
                if (readOnly) {
                  textareaRef.current?.blur();
                  focusCard();
                  return;
                }
                if (!isSelected) {
                  onSelect(subtitle.id, subtitle.startTime, subtitle.endTime);
                }
              }}
              placeholder=""
              readOnly={readOnly}
            />
          </div>
          <div className="card-time-info">
            {/* 리뷰 태그 */}
            {(isReviewMode || appliedReviewTags.length > 0) && (
              <span
                className="card-review-tags"
                onClick={(e) => e.stopPropagation()}
              >
                {appliedReviewTags.map((rt) => {
                  const tagIdx = reviewTags.findIndex(
                    (tag) => tag.id === rt.reviewTagId,
                  );
                  const tagInfo = tagIdx >= 0 ? reviewTags[tagIdx] : null;
                  return tagInfo ? (
                    <span
                      key={rt.id}
                      className={`review-tag-badge tag-color-${tagIdx % 8}`}
                      title={tagInfo.description || tagInfo.tag}
                    >
                      {tagInfo.tag}
                      {isReviewMode && (
                        <button
                          className="review-tag-remove"
                          onClick={() =>
                            onReviewTagToggle(subtitle.id, tagInfo.id, rt)
                          }
                          title={t("subtitle.addReviewTag")}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ) : null;
                })}
                {isReviewMode && (
                  <>
                    <button
                      className="review-tag-add-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (showTagPopover) {
                          setShowTagPopover(false);
                        } else {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTagPopoverAnchor({
                            top: rect.top,
                            bottom: rect.bottom,
                            left: rect.left,
                            right: rect.right,
                          });
                          setShowTagPopover(true);
                        }
                      }}
                      title={t("subtitle.addReviewTag")}
                    >
                      {t("subtitle.addTag")}
                    </button>
                    {showTagPopover && (
                      <ReviewTagPopover
                        groups={reviewGroups}
                        tags={reviewTags}
                        appliedTags={appliedReviewTags}
                        onTagToggle={(reviewTagId, existing) =>
                          onReviewTagToggle(subtitle.id, reviewTagId, existing)
                        }
                        onClose={() => setShowTagPopover(false)}
                        anchor={tagPopoverAnchor}
                      />
                    )}
                  </>
                )}
              </span>
            )}
            {/* 피드백 뱃지 */}
            <span
              className={`card-comment-badge ${appliedComments.length > 0 ? "has-comments" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (showCommentPopover) {
                  setShowCommentPopover(false);
                } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setCommentPopoverAnchor({
                    top: rect.top,
                    bottom: rect.bottom,
                    left: rect.left,
                    right: rect.right,
                  });
                  setShowCommentPopover(true);
                }
              }}
              title={t("subtitle.feedback")}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {appliedComments.length > 0 && (
                <span className="comment-count">{appliedComments.length}</span>
              )}
            </span>
            {showCommentPopover && (
              <CommentPopover
                comments={appliedComments}
                onAdd={(text) => onCommentAdd(subtitle.id, text)}
                onUpdate={(commentId, text) =>
                  onCommentUpdate(subtitle.id, commentId, text)
                }
                onDelete={(commentId) =>
                  onCommentDelete(subtitle.id, commentId)
                }
                currentUserId={currentUserId}
                onClose={() => setShowCommentPopover(false)}
                anchor={commentPopoverAnchor}
              />
            )}
            <span className="card-time-right">
              {editingTime === "start" && !readOnly ? (
                <input
                  ref={startTimeRef}
                  type="text"
                  className="time-input"
                  value={localStartTime}
                  onChange={(e) => setLocalStartTime(e.target.value)}
                  onBlur={() => handleTimeSave("start")}
                  onKeyDown={(e) => handleTimeKeyDown("start", e)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className={`time-start ${readOnly ? "" : "editable"}`}
                  onClick={(e) => !readOnly && handleTimeClick("start", e)}
                  title={readOnly ? "" : t("subtitle.clickToEdit")}
                >
                  {secondsToTimeCode(subtitle.startTime)}
                </span>
              )}
              <span className="time-separator">→</span>
              {editingTime === "end" && !readOnly ? (
                <input
                  ref={endTimeRef}
                  type="text"
                  className="time-input"
                  value={localEndTime}
                  onChange={(e) => setLocalEndTime(e.target.value)}
                  onBlur={() => handleTimeSave("end")}
                  onKeyDown={(e) => handleTimeKeyDown("end", e)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className={`time-end ${readOnly ? "" : "editable"}`}
                  onClick={(e) => !readOnly && handleTimeClick("end", e)}
                  title={t("subtitle.clickToEdit")}
                >
                  {secondsToTimeCode(subtitle.endTime)}
                </span>
              )}
              <span className="time-duration">{durationSec}s</span>
              <span className="card-stats">
                <span
                  className={`cps-indicator ${cpsInfo.isCpsOver ? "cps-over" : ""} ${cpsInfo.hasLineOver ? "line-over" : ""}`}
                >
                  {cpsInfo.charCount % 1 === 0 ? cpsInfo.charCount : cpsInfo.charCount.toFixed(1)}
                  {cpsInfo.lineCountsStr} chars{" "}
                  <span style={cpsInfo.isBytesOver ? { color: "#d33" } : undefined}>
                    {cpsInfo.textBytes}byte
                  </span>
                  {" "}/ {cpsInfo.cps} CPS
                </span>
              </span>
            </span>
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.subtitleId === nextProps.subtitleId &&
      prevProps.index === nextProps.index &&
      prevProps.validationResult === nextProps.validationResult &&
      prevProps.speakers === nextProps.speakers &&
      prevProps.isTranslatorMode === nextProps.isTranslatorMode &&
      prevProps.showMiddleText === nextProps.showMiddleText &&
      prevProps.columnVisibility === nextProps.columnVisibility &&
      prevProps.searchMatch === nextProps.searchMatch &&
      prevProps.appliedReviewTags === nextProps.appliedReviewTags &&
      prevProps.isReviewMode === nextProps.isReviewMode &&
      prevProps.reviewGroups === nextProps.reviewGroups &&
      prevProps.reviewTags === nextProps.reviewTags &&
      prevProps.appliedComments === nextProps.appliedComments &&
      prevProps.syncStartNudgeStepSec === nextProps.syncStartNudgeStepSec
    );
  },
);

// .subtitle-card { height: 124px } + .list-content { gap: 3px }
// 가상화는 wrapper 의 paddingBottom 으로 gap 을 표현하므로 rowHeight = 124 + 3.
const SUBTITLE_ROW_HEIGHT = 127;
const SUBTITLE_ROW_GAP = 3;

// react-window v2 의 rowComponent 어댑터.
// rowProps 로 행 단위 매핑 데이터(*Map / contextTargetId / forceEditingId)를 받아
// 행마다의 prop 으로 변환한다. itemRef 콜백을 행마다 새로 만들면 SubtitleItem.memo 가
// 깨지므로 부모에서 만든 stable setItemRef(id, el) 헬퍼를 받아 사용한다.
function VirtualRowInner({
  index,
  style,
  ariaAttributes: _ariaAttributes,
  subtitleIds,
  lockedSubtitleIds,
  indexById,
  setItemRef,
  rowGap,
  forceEditingId,
  validationResults,
  searchMatchMap,
  subtitleReviewTagMap,
  subtitleCommentMap,
  contextTargetId,
  aiQcMap,
  ...rest
}) {
  const subtitleId = subtitleIds[index];
  const onItemRef = useCallback(
    (el) => setItemRef(subtitleId, el),
    [setItemRef, subtitleId],
  );
  const wrapperStyle = useMemo(
    () => ({ ...style, paddingBottom: rowGap }),
    [style, rowGap],
  );
  const isLocked = !!lockedSubtitleIds?.has(subtitleId);
  const forceEditing =
    forceEditingId && typeof forceEditingId === "object"
      ? forceEditingId.id === subtitleId
        ? forceEditingId
        : false
      : forceEditingId === subtitleId;
  return (
    <div style={wrapperStyle}>
      {isLocked ? (
        // VOD 분할 — 다른 작업자 구간의 자막은 표시 전용 컴포넌트로 격리 렌더 (상태 무관 최신).
        // 편집 경로 자체가 없으므로 가드 누락이 불가능하고 SubtitleItem 의 복잡도와 분리된다.
        <LockedSubtitleItem subtitleId={subtitleId} />
      ) : (
        /* SubtitleItem 인스턴스는 행 단위로 reuse 되며, popover state 격리는
           SubtitleItem 내부에서 subtitleId 변경 시 useEffect 로 reset 한다.
           (key={subtitleId} 부여 시 클릭 직후 부모 리렌더로 unmount/remount 가
            일어나 click 이벤트가 무효화되는 회귀가 있었음) */
        <SubtitleItem
          subtitleId={subtitleId}
          index={indexById.get(subtitleId)}
          itemRef={onItemRef}
          forceEditing={forceEditing}
          validationResult={validationResults[subtitleId]}
          aiQcKind={aiQcMap?.[indexById.get(subtitleId)]}
          searchMatch={searchMatchMap[subtitleId]}
          appliedReviewTags={subtitleReviewTagMap[subtitleId] || EMPTY_ARRAY}
          appliedComments={subtitleCommentMap[subtitleId] || EMPTY_ARRAY}
          isContextTarget={contextTargetId === subtitleId}
          {...rest}
        />
      )}
    </div>
  );
}
const VirtualRow = memo(VirtualRowInner);

function SubtitleList({ mediaRef, workCategory = null }) {
  const { t } = useTranslation("worktool");
  const subtitles = useSubtitleStore((state) => state.subtitles);
  const selectedSubtitleId = useSubtitleStore(
    (state) => state.selectedSubtitleId,
  );
  const mediaFileName = useSubtitleStore((state) => state.mediaFileName);
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const activeSubtitleIdRef = useRef(null);
  const selectSubtitle = useSubtitleStore((state) => state.selectSubtitle);
  const focusRequested = useSubtitleStore((state) => state.focusRequested);
  const updateSubtitle = useSubtitleStore((state) => state.updateSubtitle);
  const adjustSyncStart = useSubtitleStore((state) => state.adjustSyncStart);
  const adjustSyncEnd = useSubtitleStore((state) => state.adjustSyncEnd);
  const nudgeSync = useSubtitleStore((state) => state.nudgeSync);
  const bulkNudgeSync = useSubtitleStore((state) => state.bulkNudgeSync);
  const mergeWithPrevious = useSubtitleStore(
    (state) => state.mergeWithPrevious,
  );
  const mergeWithNext = useSubtitleStore((state) => state.mergeWithNext);
  const splitSubtitle = useSubtitleStore((state) => state.splitSubtitle);
  const splitSubtitleAtTime = useSubtitleStore(
    (state) => state.splitSubtitleAtTime,
  );
  const moveTextToPrevSubtitle = useSubtitleStore(
    (state) => state.moveTextToPrevSubtitle,
  );
  const moveTextToNextSubtitle = useSubtitleStore(
    (state) => state.moveTextToNextSubtitle,
  );
  const deleteSubtitle = useSubtitleStore((state) => state.deleteSubtitle);
  const bulkDeleteSubtitles = useSubtitleStore(
    (state) => state.bulkDeleteSubtitles,
  );
  const batchUpdateEndTimes = useSubtitleStore((state) => state.batchUpdateEndTimes);
  const applyMinGapToAll = useSubtitleStore((state) => state.applyMinGapToAll);
  const undo = useSubtitleStore((state) => state.undo);
  const redo = useSubtitleStore((state) => state.redo);
  const saveEditHistorySnapshot = useSubtitleStore(
    (state) => state.saveEditHistorySnapshot,
  );

  const setSelectedTimeRange = useSubtitleStore(
    (state) => state.setSelectedTimeRange,
  );
  const clearSubtitles = useSubtitleStore((state) => state.clearSubtitles);
  const addSubtitle = useSubtitleStore((state) => state.addSubtitle);
  const setSubtitles = useSubtitleStore((state) => state.setSubtitles);
  const mergeSubtitleField = useSubtitleStore((state) => state.mergeSubtitleField);
  const importFromJson = useSubtitleStore((state) => state.importFromJson);
  const exportToJson = useSubtitleStore((state) => state.exportToJson);
  const setSubtitleFileName = useSubtitleStore(
    (state) => state.setSubtitleFileName,
  );
  const isServerFile = useSubtitleStore((state) => state.isServerFile);
  const isServerMode = useSubtitleStore((state) => state.isServerMode);
  const fileId = useSubtitleStore((state) => state.fileId);
  const {
    projectFileId: urlProjectFileId,
    fileNo: urlFileNo,
    servCd: urlServCd,
  } = useParams();
  const [searchParams] = useSearchParams();
  const allowedStartSec =
    searchParams.get("start_sec") !== null
      ? Number(searchParams.get("start_sec"))
      : null;
  const allowedEndSec =
    searchParams.get("end_sec") !== null
      ? Number(searchParams.get("end_sec"))
      : null;
  const hasTimeRestriction = allowedStartSec !== null && allowedEndSec !== null;
  const urlPlayTm =
    searchParams.get("play_tm") !== null
      ? Number(searchParams.get("play_tm"))
      : null;
  const urlIsSplit = searchParams.get("isSplit") === "true";
  const urlReadOnly = searchParams.get("readonly") === "true";
  const urlMode = searchParams.get("mode");
  const urlTrainingRole = searchParams.get("role");
  const urlTrainingAssignmentId = searchParams.get("assignmentId");
  const urlTrainingFileId = searchParams.get("trainingFileId");
  const urlTrainingAsid = searchParams.get("assignmentStudentId");
  const isTrainingMode = urlMode === "training";
  // 연수 sub-role: START(시연/저장 비활성), ANSWER(정답지 작성, 저장=upsert), STUDENT(수강생 작업, 저장=WORK)
  const isTrainingStart =
    isTrainingMode && (!urlTrainingRole || String(urlTrainingRole).toUpperCase() === "START");
  const isTrainingAnswer =
    isTrainingMode && String(urlTrainingRole).toUpperCase() === "ANSWER";
  const isTrainingStudent =
    isTrainingMode && String(urlTrainingRole).toUpperCase() === "STUDENT";

  // 코멘트 기능 활성화 여부: 일반 모드는 projectFileId, 연수 모드는 assignmentStudentId 기준
  const commentsEnabled = !!urlProjectFileId || (isTrainingMode && !!urlTrainingAsid);

  // 연수 STUDENT 모드 — toolbar [제출] 버튼 ↔ TrainingWorktoolOverlay 연결.
  // 채점 결과는 수강생에게 보여주지 않으므로 결과 관련 셀렉터는 제거.
  const requestTrainingSubmit = useTrainingActionStore((s) => s.requestSubmit);
  const trainingStudentSubmitted = useTrainingActionStore((s) => s.studentSubmitted);

  const setFileId = useSubtitleStore((state) => state.setFileId);
  const translateModalTrigger = useSubtitleStore(
    (state) => state.translateModalTrigger,
  );
  const resetTranslateModalTrigger = useSubtitleStore(
    (state) => state.resetTranslateModalTrigger,
  );

  // 병합 모드
  const isMergeMode = useSubtitleStore((state) => state.isMergeMode);
  const mergeServCd = useSubtitleStore((state) => state.mergeServCd);
  const mergeFiles = useSubtitleStore((state) => state.mergeFiles);

  // 화자 정보
  const speakers = useSpeakerStore((state) => state.speakers);

  // 자막 편집 설정
  const subtitleEditor = useSettingsStore((state) => state.subtitleEditor);
  const updateSubtitleEditor = useSettingsStore(
    (state) => state.updateSubtitleEditor,
  );
  const general = useSettingsStore((state) => state.general);
  const updateGeneral = useSettingsStore((state) => state.updateGeneral);
  const updateWorktoolUi = useSettingsStore((state) => state.updateWorktoolUi);

  // AI 설정 (maxSegmentLength = 가이드라인 위치)
  const maxSegmentLength = useAIStore(
    (state) => state.stt?.segmentOptions?.maxSegmentLength ?? 80,
  );
  const setSTTSegmentOption = useAIStore((state) => state.setSTTSegmentOption);
  const syncStartNudgeStepSec = subtitleEditor?.syncStartNudgeStepSec ?? 0.1;

  // 자동 스크롤 활성화 상태 (persist via settingsStore)
  const autoScroll = useSettingsStore(
    (state) => state.worktoolUi?.autoScroll ?? true,
  );
  const toggleAutoScroll = useCallback(
    () => updateWorktoolUi({ autoScroll: !autoScroll }),
    [autoScroll, updateWorktoolUi],
  );
  const lastActiveIdRef = useRef(null);

  const listContentRef = useRef(null);
  const itemRefs = useRef({});
  // 자막 행별 화자 드롭다운 컴포넌트의 imperative ref (open / focus 호출용)
  const speakerDropdownRefs = useRef({});
  const setSpeakerDropdownRef = useCallback((subId, instance) => {
    if (instance) {
      speakerDropdownRefs.current[subId] = instance;
    } else {
      delete speakerDropdownRefs.current[subId];
    }
  }, []);
  // react-window 가상 List 의 imperative API ref.
  // useListCallbackRef 는 [state, setState] 형태로, ref 가 mount 된 시점에
  // 의존하는 useEffect(cardContextMenu 의 scroll 리스너 등)가 자동 재실행된다.
  const [listImperativeRef, setListImperativeRef] = useListCallbackRef();
  // filteredIndexInList 는 컴포넌트 후반부에서 선언되므로 useCallback 의
  // deps 배열에 직접 넣을 수 없어(TDZ) ref 로 미러링하여 콜백에서 .current 로 읽는다.
  // 마찬가지로 listImperativeRef 도 동일 ref 에 모아 둬서 콜백 deps 를 비울 수 있다.
  const navContextRef = useRef({ filteredIndexInList: null, listApi: null });
  navContextRef.current.listApi = listImperativeRef;
  // 행 컴포넌트가 mount/unmount 될 때 itemRefs 에 등록/정리하는 stable 헬퍼.
  const setItemRef = useCallback((id, el) => {
    if (el) {
      itemRefs.current[id] = el;
    } else {
      delete itemRefs.current[id];
    }
  }, []);
  const guidelineRef = useRef(null);
  const [guidelineLeft, setGuidelineLeft] = useState(null);

  // 자막 카드 우클릭 컨텍스트 메뉴 상태 { x, y, subtitleId }
  const [cardContextMenu, setCardContextMenu] = useState(null);

  const focusSubtitleTextarea = useCallback((subtitleId, cursorPos) => {
    const tryFocus = () => {
      // 모달 input 에 포커스가 있다면 textarea 로 옮기지 않는다.
      // (onClose 흐름의 명시적 호출은 모달이 unmount 된 뒤 setTimeout 안에서
      //  실행되므로 정상 통과한다.)
      if (isFindReplaceModalActive()) return;
      const itemElement = itemRefs.current[subtitleId];
      const textarea = itemElement?.querySelector?.("textarea");
      if (textarea) {
        textarea.focus();
        const pos = cursorPos !== undefined ? cursorPos : textarea.value.length;
        requestAnimationFrame(() => {
          textarea.setSelectionRange(pos, pos);
        });
      }
    };
    setTimeout(() => {
      // 가상화 환경에서 행이 viewport 밖이면 ref 가 비어 있으므로
      // 우선 해당 인덱스로 스크롤한 뒤 다음 frame 에 포커스를 시도한다.
      if (itemRefs.current[subtitleId]) {
        tryFocus();
        return;
      }
      const { filteredIndexInList, listApi } = navContextRef.current;
      const idx = filteredIndexInList?.get(subtitleId);
      if (idx !== undefined && listApi) {
        listApi.scrollToRow({ index: idx, align: "auto", behavior: "instant" });
        requestAnimationFrame(() => requestAnimationFrame(tryFocus));
      } else {
        tryFocus();
      }
    }, 0);
  }, []);

  // waveform 클릭 시 textarea 포커스 요청 처리
  useEffect(() => {
    if (!focusRequested) return;
    const subId = useSubtitleStore.getState().selectedSubtitleId;
    if (subId) focusSubtitleTextarea(subId);
  }, [focusRequested, focusSubtitleTextarea]);

  // 가져오기/내보내기 모달 상태
  const importInputRef = useRef(null);
  const [modalState, setModalState] = useState({ isOpen: false, mode: null });
  const [hwpExportOpen, setHwpExportOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [selectedTargetField, setSelectedTargetField] = useState("text");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAiQcPanel, setShowAiQcPanel] = useState(false);
  const [aiQcFilter, setAiQcFilter] = useState("전체");
  const [showSpeakerModal, setShowSpeakerModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showBoilerplateModal, setShowBoilerplateModal] = useState(false);
  const [showReviewSummary, setShowReviewSummary] = useState(false);
  const [showGapFillModal, setShowGapFillModal] = useState(false);
  const [showCommentListModal, setShowCommentListModal] = useState(false);
  const [showTimeJumpModal, setShowTimeJumpModal] = useState(false);
  const [showFindReplaceModal, setShowFindReplaceModal] = useState(false);
  const [showAccuracyModal, setShowAccuracyModal] = useState(false);
  const [pendingSave, setPendingSave] = useState(null);
  const skipSpeakerWarning = workCategory === "vod";
  const [searchMatches, setSearchMatches] = useState([]);

  // 필터 상태
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filters, setFilters] = useState({
    text: "",
    tagIds: [],
    hasComments: null,
    speakerIds: [],
    positions: [],
    validationRuleIds: [],
  });

  // 다중 선택 상태
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [bulkPosition, setBulkPosition] = useState("bottomCenter");
  const [bulkSpeakerId, setBulkSpeakerId] = useState("");
  const [bulkSyncShift, setBulkSyncShift] = useState({ hh: "00", mm: "00", ss: "00", ms: "000" });
  const [bulkSyncDirection, setBulkSyncDirection] = useState(1);

  // 화자 선택 모달 상태 (F1 단축키용)
  const [speakerSelectModal, setSpeakerSelectModal] = useState({
    isOpen: false,
    subtitleId: null,
    currentSpeaker: null,
  });

  const [loopInfo, setLoopInfo] = useState(null);

  // 컬럼 표시 설정 (persist via settingsStore)
  const columnVisibility = useSettingsStore(
    (state) => state.worktoolUi?.columnVisibility ?? { speakerPosition: true, sourceText: true, middleText: true },
  );
  const setColumnVisibility = useCallback((v) => updateWorktoolUi({ columnVisibility: v }), [updateWorktoolUi]);

  // 툴바 버튼 표시 설정 (persist via settingsStore)
  const toolbarVisibility = useSettingsStore(
    (state) => state.worktoolUi?.toolbarVisibility ?? {},
  );
  const setToolbarVisibility = useCallback((v) => updateWorktoolUi({ toolbarVisibility: v }), [updateWorktoolUi]);

  // 번역 컬럼 비율 드래그 리사이즈
  const subtitleListRef = useRef(null);
  const columnResizeRef = useRef({ active: false, varName: '', siblingVar: '', startX: 0, startFlex: 0, siblingFlex: 0, headerRight: null });
  const COLUMN_STORAGE_KEY = 'soribaro-translator-column-widths';

  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
      return saved ? JSON.parse(saved) : { source: 1, middle: 1, target: 1.2 };
    } catch {
      return { source: 1, middle: 1, target: 1.2 };
    }
  });

  useEffect(() => {
    const el = subtitleListRef.current;
    if (!el) return;
    el.style.setProperty('--translator-source-width', columnWidths.source);
    el.style.setProperty('--translator-middle-width', columnWidths.middle);
    el.style.setProperty('--translator-target-width', columnWidths.target);
  }, [columnWidths]);

  // card-left/header-left 너비 (px) — persist via settingsStore
  const cardLeftWidth = useSettingsStore(
    (state) => state.worktoolUi?.cardLeftWidth ?? 100,
  );
  useEffect(() => {
    const el = subtitleListRef.current;
    if (!el) return;
    el.style.setProperty('--card-left-width', `${cardLeftWidth}px`);
  }, [cardLeftWidth]);

  // card-left 드래그 리사이즈 (60~300px)
  const handleCardLeftResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const resizer = e.currentTarget;
    resizer.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startWidth = cardLeftWidth;
    const MIN_W = 60;
    const MAX_W = 300;

    const listEl = subtitleListRef.current;
    listEl?.classList.add('column-resizing');
    listEl?.setAttribute('data-active-resizer', 'card-left');

    let rafId = null;
    let lastClientX = startX;

    const handlePointerMove = (moveE) => {
      lastClientX = moveE.clientX;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const delta = lastClientX - startX;
        const newW = Math.max(MIN_W, Math.min(MAX_W, startWidth + delta));
        subtitleListRef.current?.style.setProperty('--card-left-width', `${newW}px`);
      });
    };

    const cleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      listEl?.classList.remove('column-resizing');
      listEl?.removeAttribute('data-active-resizer');
      resizer.removeEventListener('pointermove', handlePointerMove);
      resizer.removeEventListener('pointerup', handlePointerUp);
      resizer.removeEventListener('lostpointercapture', handlePointerUp);
    };

    const handlePointerUp = () => {
      try {
        const finalStr = subtitleListRef.current?.style.getPropertyValue('--card-left-width');
        const finalW = parseFloat(finalStr) || startWidth;
        const clamped = Math.max(MIN_W, Math.min(MAX_W, finalW));
        updateWorktoolUi({ cardLeftWidth: clamped });
      } finally {
        cleanup();
      }
    };

    resizer.addEventListener('pointermove', handlePointerMove);
    resizer.addEventListener('pointerup', handlePointerUp);
    resizer.addEventListener('lostpointercapture', handlePointerUp);
  }, [cardLeftWidth, updateWorktoolUi]);

  const handleColumnResizeStart = useCallback((e, leftVar, rightVar) => {
    e.preventDefault();
    const resizer = e.currentTarget;
    const headerRight = resizer.parentElement;
    if (!headerRight) return;

    // DOM 변경 전에 레이아웃 값을 읽어 forced reflow 방지
    const totalWidth = headerRight.offsetWidth;

    // 이전 드래그가 정리되지 않았을 경우 강제 정리
    if (columnResizeRef.current.cleanup) {
      columnResizeRef.current.cleanup();
    }

    const varMap = { source: '--translator-source-width', middle: '--translator-middle-width', target: '--translator-target-width' };
    const leftCssVar = varMap[leftVar];
    const rightCssVar = varMap[rightVar];

    // Pointer Capture: 포인터를 리사이저에 고정하여 pointerup 보장
    resizer.setPointerCapture(e.pointerId);

    columnResizeRef.current = {
      active: true,
      leftVar,
      rightVar,
      leftCssVar,
      rightCssVar,
      startX: e.clientX,
      startLeftFlex: columnWidths[leftVar],
      startRightFlex: columnWidths[rightVar],
      headerRight,
      totalWidth,
      cleanup: null,
    };
    subtitleListRef.current?.classList.add('column-resizing');
    subtitleListRef.current?.setAttribute('data-active-resizer', leftVar);

    let rafId = null;
    let lastClientX = null;

    const handlePointerMove = (moveE) => {
      lastClientX = moveE.clientX;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const ref = columnResizeRef.current;
        if (!ref.active || lastClientX === null) return;

        const delta = lastClientX - ref.startX;
        const totalFlex = ref.startLeftFlex + ref.startRightFlex;
        const deltaRatio = (delta / ref.totalWidth) * totalFlex;

        const minFlex = 0.3;
        const newLeft = Math.max(minFlex, ref.startLeftFlex + deltaRatio);
        const newRight = Math.max(minFlex, ref.startRightFlex - deltaRatio);

        const el = subtitleListRef.current;
        if (el) {
          el.style.setProperty(ref.leftCssVar, newLeft);
          el.style.setProperty(ref.rightCssVar, newRight);
        }
      });
    };

    const cleanup = () => {
      if (!columnResizeRef.current.cleanup) return;
      if (rafId) cancelAnimationFrame(rafId);
      columnResizeRef.current.active = false;
      columnResizeRef.current.cleanup = null;
      subtitleListRef.current?.removeAttribute('data-active-resizer');
      subtitleListRef.current?.classList.remove('column-resizing');
      resizer.removeEventListener('pointermove', handlePointerMove);
      resizer.removeEventListener('pointerup', handlePointerUp);
      resizer.removeEventListener('lostpointercapture', handlePointerUp);
    };

    columnResizeRef.current.cleanup = cleanup;

    const handlePointerUp = () => {
      try {
        const el = subtitleListRef.current;
        if (el) {
          const newWidths = {
            source: parseFloat(el.style.getPropertyValue('--translator-source-width')) || columnWidths.source,
            middle: parseFloat(el.style.getPropertyValue('--translator-middle-width')) || columnWidths.middle,
            target: parseFloat(el.style.getPropertyValue('--translator-target-width')) || columnWidths.target,
          };
          setColumnWidths(newWidths);
          try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(newWidths)); } catch {}
        }
      } finally {
        cleanup();
      }
    };

    resizer.addEventListener('pointermove', handlePointerMove);
    resizer.addEventListener('pointerup', handlePointerUp);
    resizer.addEventListener('lostpointercapture', handlePointerUp);
  }, [columnWidths]);
  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [translateModalData, setTranslateModalData] = useState({
    sourceLang: "",
    targetLang: "",
    subtitles: [],
  });
  const [showTranslateProcess, setShowTranslateProcess] = useState(false);
  const [translateOptions, setTranslateOptions] = useState({});

  // 리뷰 태그 관련 state
  const [reviewGroups, setReviewGroups] = useState([]);
  const [reviewTags, setReviewTags] = useState([]);
  const [subtitleReviewTagMap, setSubtitleReviewTagMap] = useState({});
  const [subtitleCommentMap, setSubtitleCommentMap] = useState({});

  const subtitleIndexMap = useMemo(
    () => new Map(subtitles.map((s, i) => [s.id, i])),
    [subtitles],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.text) count++;
    if (filters.tagIds.length) count++;
    if (filters.hasComments !== null) count++;
    if (filters.speakerIds.length) count++;
    if (filters.positions.length) count++;
    if (filters.validationRuleIds.length) count++;
    return count;
  }, [filters]);

  const segmentPlayHandlerRef = useRef(null);

  const playSegment = useCallback(
    (subtitle) => {
      if (!subtitle || !mediaRef.current) return;
      const media = mediaRef.current;

      if (segmentPlayHandlerRef.current) {
        media.removeEventListener("timeupdate", segmentPlayHandlerRef.current);
        segmentPlayHandlerRef.current = null;
      }

      const start = subtitle.startTime;
      const end = subtitle.endTime;
      if (end <= start) return;

      media.currentTime = start;
      if (media.paused) {
        media.play().catch(() => {});
      }
    },
    [mediaRef],
  );

  const togglePlayPause = useCallback(() => {
    if (!mediaRef.current) return;
    const media = mediaRef.current;
    if (media.paused) {
      media.play().catch(() => {});
    } else {
      media.pause();
    }
  }, [mediaRef]);

  const mediaSeekStepSec = subtitleEditor?.mediaSeekStepSec ?? 3;

  const seekMedia = useCallback(
    (direction) => {
      if (!mediaRef.current) return;
      const media = mediaRef.current;
      const delta =
        direction === "backward" ? -mediaSeekStepSec : mediaSeekStepSec;
      const duration = Number.isFinite(media.duration) ? media.duration : null;
      const nextTime = media.currentTime + delta;
      media.currentTime = duration
        ? Math.max(0, Math.min(nextTime, duration))
        : Math.max(0, nextTime);
    },
    [mediaRef, mediaSeekStepSec],
  );

  const toggleLoopForSubtitle = useCallback(
    (subtitle) => {
      if (!subtitle) return;
      setLoopInfo((prev) => {
        if (prev?.subtitleId === subtitle.id) return null;
        return {
          subtitleId: subtitle.id,
          start: subtitle.startTime,
          end: subtitle.endTime,
        };
      });
      if (mediaRef.current) {
        mediaRef.current.currentTime = subtitle.startTime;
        if (mediaRef.current.paused) {
          mediaRef.current.play().catch(() => {});
        }
      }
    },
    [mediaRef],
  );

  // 언어 선택 상태 (출발어, 중간어, 도착어) - subtitleStore에서 관리
  const sourceLanguage = useSubtitleStore((state) => state.sourceLanguage);
  const middleLanguage = useSubtitleStore((state) => state.middleLanguage);
  const targetLanguage = useSubtitleStore((state) => state.targetLanguage);
  const setSourceLanguage = useSubtitleStore(
    (state) => state.setSourceLanguage,
  );
  const setMiddleLanguage = useSubtitleStore(
    (state) => state.setMiddleLanguage,
  );
  const setTargetLanguage = useSubtitleStore(
    (state) => state.setTargetLanguage,
  );

  // 중간어 데이터 존재 여부 (하나라도 middleText가 있으면 true)
  const hasMiddleTextData = useMemo(() => {
    return subtitles.some((sub) => sub.middleText && sub.middleText.trim() !== "");
  }, [subtitles]);

  // API 로딩 상태
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(false);
  // 분할파일 병합검수 — 경계 자막 겹침 해결 모달 (SttMergeConflictModal 재사용)
  // null 이거나 { subtitles, overlaps } 형태. onResolve 후 남은 충돌이 있으면 같은 state 로 재할당.
  const [mergeConflict, setMergeConflict] = useState(null);

  // 모달에서 해결된 자막을 store 에 반영하고, 남은 충돌이 있으면 모달을 재오픈한다.
  // applyResolutions(SttMergeConflictModal 내부)가 한 라운드에 잡힌 충돌만 해결하므로,
  // 다중 자막이 한 구간에 몰린 경우 (A↔B 해결 후 A↔C 가 새로 드러남) 자동 재검출.
  const handleMergeConflictResolved = useCallback(
    (resolved) => {
      const frameRate = useSubtitleStore.getState().frameRate || 30;
      const nextSubs = resolved.map((sub) => ({
        ...sub,
        startFrame: Math.floor((sub.startTime || 0) * frameRate),
        endFrame: Math.floor((sub.endTime || 0) * frameRate),
      }));
      useSubtitleStore.setState({ subtitles: nextSubs });

      const sorted = [...nextSubs].sort(
        (a, b) => (a.startTime || 0) - (b.startTime || 0),
      );
      const remaining = detectOverlaps(sorted, 0.05);
      if (remaining.length > 0) {
        // detectOverlaps 는 정렬된 배열의 인덱스를 반환하므로 sorted 를 모달에 그대로 전달.
        setMergeConflict({ subtitles: sorted, overlaps: remaining });
        toast.info(
          t("enterprise.mergeConflictRemaining", {
            ns: "soribaro",
            count: remaining.length,
          }),
        );
      } else {
        setMergeConflict(null);
        toast.success(
          t("enterprise.mergeConflictResolved", { ns: "soribaro" }),
        );
      }
    },
    [t],
  );
  const [isWorkChecked, setIsWorkChecked] = useState(false); // 서버에서 받은 isChecked 원본값
  const [projectFileStatus, setProjectFileStatus] = useState(null); // 프로젝트 파일 상태
  const isLoadingRef = useRef(false); // 중복 호출 방지용
  const loadRequestIdRef = useRef(0); // 요청 카운터 (stale 응답 무시용)
  const loadedProjectFileIdsRef = useRef({}); // type별 projectFileId 저장 { START: 'uuid', MID: 'uuid', FINAL: 'uuid' }
  const currentWorkStatRef = useRef(null); // tb_serv.work_stat 캐시

  // Role store
  const role = useRoleStore((state) => state.role);

  // 검수 완료 + 비검수자 role인 경우 읽기 전용 (role 변경 시 즉시 반영)
  // 또는 URL에 readonly=true가 있는 경우 (검수중/검수완료 상태에서 작업자 진입)
  const isCheckedReadOnly = (isWorkChecked && !isReviewer(role)) || urlReadOnly;

  // 자막 초기화 핸들러
  const handleResetSubtitles = useCallback(async () => {
    const confirmed = await confirm(t("subtitle.resetSubtitlesConfirm"), {
      title: t("subtitle.resetSubtitles"),
      confirmText: t("common.confirm"),
      cancelText: t("common.cancel"),
    });
    if (confirmed) {
      const { fileId: currentFileId, duration } = useSubtitleStore.getState();
      const startSec = allowedStartSec ?? 0;
      const endSec = allowedEndSec ?? (duration || 0);
      clearSubtitles();
      if (currentFileId) {
        useSubtitleStore.getState().setFileId(currentFileId);
      }
      addSubtitle({ startTime: startSec, endTime: endSec, text: "" }, false);
    }
  }, [t, allowedStartSec, allowedEndSec, clearSubtitles, addSubtitle]);

  // SubtitleItem props용 사전 계산 (인라인 표현식 → 안정적 참조)
  const computedIsTranslatorMode = useMemo(
    () => getBaseRole(role) === Role.FINAL || getBaseRole(role) === Role.MID,
    [role],
  );
  const computedShowMiddleText = useMemo(
    () => getBaseRole(role) === Role.FINAL && hasMiddleTextData,
    [role, hasMiddleTextData],
  );
  const computedIsReviewMode = useMemo(() => isReviewer(role), [role]);

  // User store.
  // membId 에 trailing/leading space 가 끼어 있으면 코멘트 created_by 비교 등이
  // 깨지므로 userStore 에서 1차로 trim 하고 호출 시점에서도 2차로 방어.
  const user = useUserStore((state) => state.user);
  const currentUserId = (user?.membId || "").trim();

  // searchMatches → Map으로 변환 (O(1) 조회, 안정적 참조)
  const searchMatchMap = useMemo(() => {
    const map = {};
    searchMatches.forEach((m) => { map[m.subtitleId] = m; });
    return map;
  }, [searchMatches]);

  // 인라인 편집 중인 자막 ID (방향키 네비게이션용)
  const [inlineEditingId, setInlineEditingId] = useState(null);

  // 검수 모달 (전역 store 사용)
  const openValidation = useModalStore((state) => state.openValidation);
  const openNetflixQC = useModalStore((state) => state.openNetflixQC);

  // 검수 결과
  const validationResults = useValidationStore((state) => state.results);
  const startValidation = useValidationStore((state) => state.startValidation);
  const hasValidationResults = useValidationStore((state) => state.hasResults);

  const filteredSubtitles = useMemo(() => {
    // 분할 진입 시 시간 필터로 자기 영역 자막만 보여주던 기존 동작을 제거.
    // 자기 자막은 어느 시간대에 있든 무조건 표시 (사용자가 앞/뒤로 시간을 옮길 수 있고
    // 다른 분할 구간의 자막을 readonly 로 함께 노출하므로, 시간 가두기는 오히려 데이터를
    // 안 보이게 만드는 버그의 원인이 된다).
    return subtitles
      .filter((subtitle) => {
        if (filters.text) {
          const kw = filters.text.toLowerCase();
          if (
            !(subtitle.text || "").toLowerCase().includes(kw) &&
            !(subtitle.sourceText || "").toLowerCase().includes(kw) &&
            !(subtitle.middleText || "").toLowerCase().includes(kw)
          )
            return false;
        }
        if (filters.tagIds.length > 0) {
          const tags = subtitleReviewTagMap[subtitle.id] || [];
          if (
            !filters.tagIds.some((tid) =>
              tags.some((t) => t.reviewTagId === tid),
            )
          )
            return false;
        }
        if (
          filters.hasComments === true &&
          !subtitleCommentMap[subtitle.id]?.length
        )
          return false;
        if (
          filters.hasComments === false &&
          subtitleCommentMap[subtitle.id]?.length > 0
        )
          return false;
        if (filters.speakerIds.length > 0) {
          const isUnmapped = subtitle.speakerId > 0 && !speakers[subtitle.speakerId];
          const effectiveId = isUnmapped ? null : subtitle.speakerId;
          if (!filters.speakerIds.includes(effectiveId))
            return false;
        }
        if (
          filters.positions.length > 0 &&
          !filters.positions.includes(
            subtitle.position || "bottomCenter",
          )
        )
          return false;
        if (filters.validationRuleIds.length > 0) {
          const result = validationResults[subtitle.id];
          if (
            !result ||
            !result.issues?.some((issue) =>
              filters.validationRuleIds.includes(issue.rule.id),
            )
          )
            return false;
        }
        return true;
      });
  }, [subtitles, hasTimeRestriction, allowedStartSec, allowedEndSec,
    filters, subtitleReviewTagMap, subtitleCommentMap, speakers, validationResults]);

  // 가상 List 에 넘길 id 배열. 행 컴포넌트는 id 만 알면
  // useSubtitleStore 셀렉터로 자체 데이터를 구독하므로 ref 안정성을 위해 별도 메모.
  const filteredSubtitleIds = useMemo(
    () => filteredSubtitles.map((s) => s.id),
    [filteredSubtitles],
  );
  // VOD 분할 — locked 자막 id Set. VirtualRow 에서 분기 렌더 (LockedSubtitleItem) 에 사용.
  const lockedSubtitleIds = useMemo(() => {
    const set = new Set();
    filteredSubtitles.forEach((s) => {
      if (s.locked) set.add(s.id);
    });
    return set;
  }, [filteredSubtitles]);
  // VOD 분할 — 정확도/검수 비교는 본인 편집 영역만 대상으로 한다.
  // locked(타 작업자 readonly) 자막을 섞어 보내면 원본에는 없는 라인이라
  // 전부 insert 오류로 잡혀 정확도가 왜곡된다 (저장 envelope 필터링과 동일 정책).
  const editableSubtitles = useMemo(
    () => subtitles.filter((s) => !s.locked),
    [subtitles],
  );
  const filteredIndexInList = useMemo(() => {
    const map = new Map();
    filteredSubtitleIds.forEach((id, i) => map.set(id, i));
    return map;
  }, [filteredSubtitleIds]);
  // 콜백/effect 가 deps 없이도 최신값을 읽을 수 있도록 ref 미러링.
  navContextRef.current.filteredIndexInList = filteredIndexInList;


  // 오류 유형 필터 선택 시 자동 검증 실행
  useEffect(() => {
    if (filters.validationRuleIds.length > 0 && subtitles.length > 0) {
      const { general } = useSettingsStore.getState();
      startValidation(subtitles, general);
    }
  }, [filters.validationRuleIds, subtitles, startValidation]);

  const updateServWorkStatSilently = useCallback(
    async (nextWorkStat, reason = "save") => {
      if (!urlServCd || !nextWorkStat) return;

      const currentWorkStat = normalizeWorkStat(currentWorkStatRef.current);
      const normalizedNext = normalizeWorkStat(nextWorkStat);
      if (currentWorkStat === normalizedNext) return;

      if (
        currentWorkStat &&
        !isWorkStatTransitionAllowed(currentWorkStat, normalizedNext)
      ) {
        console.warn(
          `[SubtitleList] 비허용 workStat 전이 차단 (${reason}): ${currentWorkStat} -> ${normalizedNext}`,
        );
        return;
      }

      try {
        await updateServWorkStat(urlServCd, normalizedNext);
        currentWorkStatRef.current = normalizedNext;
      } catch (error) {
        // silent 정책: 자막 저장 흐름은 유지하고 로그만 남긴다.
        console.warn(
          `[SubtitleList] workStat 업데이트 실패 (${reason}):`,
          error,
        );
      }
    },
    [urlServCd],
  );

  // 현재 서비스 상태 조회(중복 전이/역전이 방지용)
  useEffect(() => {
    if (!urlServCd) return;
    getServByServCd(urlServCd)
      .then((result) => {
        if (result?.status === "SUCCESS") {
          currentWorkStatRef.current = normalizeWorkStat(
            result?.data?.workStat,
          );
        }
      })
      .catch((error) => {
        console.warn("[SubtitleList] 현재 workStat 조회 실패:", error);
      });
  }, [urlServCd]);

  /**
   * 서버에서 자막 데이터 로드
   * Role에 따라 getProjectFileInfo + getLatestSubtitleWork 조합으로 API 호출
   * 요청 카운터(requestId)로 stale 응답을 무시하여 race condition 방지
   */
  const loadSubtitlesFromServer = useCallback(async (options = {}) => {
    const { skipCache = false } = options;
    // 병합 모드: DB에서 기존 병합 자막 조회, 없으면 개별 파일에서 병합
    // - files >= 2: 다중 파일 병합검수 (기존 회의록/녹취록)
    // - files == 1: 단일 파일 N분할 병합검수 (VOD 분할파일 검수) — 세그먼트 자막은
    //   fetchReviewDoneSubtitlesByType 안에서 절대 타임라인 기준으로 이미 합쳐 반환된다.
    if (isMergeMode && mergeServCd && mergeFiles?.length >= 1) {
      setIsLoadingSubtitles(true);
      try {
        let subs = [];

        // 1. DB에서 기존 병합 자막 조회 (skipCache 시 생략)
        if (!skipCache) {
          try {
            const savedRes = await getLatestMergedSubtitleWork(mergeServCd);
            if (savedRes?.status === 'SUCCESS' && savedRes?.data?.subtitle) {
              subs = parseSubtitleJson(savedRes.data.subtitle)?.subtitles ?? [];
              toast.info(t("enterprise.mergeReviewLoaded", { ns: "soribaro" }));
            }
          } catch {}
        }

        // 2. 없으면 개별 파일에서 자막 fetch → 병합 (REVIEW_DONE 자막만)
        // 분할 세그먼트가 있는 파일은 fetchReviewDoneSubtitlesByType 안에서 이미
        // 절대 타임라인 기준으로 합쳐지고 분할 경계 겹침이 overlaps 로 함께 반환된다.
        // 다중 파일 케이스(회의록/녹취록)에서는 파일별 로컬 overlaps 를 누적 인덱스로
        // 글로벌화해 SttMergeConflictModal 에 한 번에 노출.
        let pendingOverlaps = [];
        if (subs.length === 0) {
          toast.info(t("enterprise.mergeReviewSubtitleLoading", { ns: "soribaro" }));
          const types = ['FINAL', 'MID', 'START'];
          const filesData = [];
          const fileLevelOverlaps = []; // [fileOverlaps[], ...]
          const allMissing = [];
          for (const file of mergeFiles) {
            let picked = { subtitles: [], missing: [], overlaps: [] };
            for (const type of types) {
              const r = await fetchReviewDoneSubtitlesByType(mergeServCd, file.fileNo, type);
              if (r.subtitles.length > 0 || r.missing.length > 0) {
                picked = r;
                break;
              }
            }
            filesData.push({ subtitles: picked.subtitles, playTm: file.playTm || 0 });
            fileLevelOverlaps.push(picked.overlaps || []);
            picked.missing.forEach((m) => allMissing.push(m));
          }

          // 누락 세그먼트 알림 (분할 파일 중 REVIEW_DONE 자막 없는 세그먼트)
          allMissing.forEach((m) => {
            const range = m.isSplit
              ? ` (${secondsToTimeCode(m.startSec || 0)} ~ ${secondsToTimeCode(m.endSec || 0)})`
              : '';
            const segLabel = m.total > 1 ? ` 세그먼트 ${m.index}/${m.total}` : '';
            toast.warning(
              `파일 #${m.fileNo}${segLabel}${range}의 검수완료(REVIEW_DONE) 자막이 없습니다.`,
            );
          });

          subs = mergeSubtitleFiles(filesData);

          // 파일별 로컬 overlaps 인덱스를 mergeSubtitleFiles 결과의 글로벌 인덱스로 재매핑.
          // mergeSubtitleFiles 는 입력 파일 순서를 그대로 보존(시간 오프셋만 적용)하므로
          // 누적 길이 오프셋으로 안전하게 변환 가능.
          let cumulative = 0;
          fileLevelOverlaps.forEach((fileOverlaps, idx) => {
            fileOverlaps.forEach((ov) => {
              pendingOverlaps.push({
                indexA: ov.indexA + cumulative,
                indexB: ov.indexB + cumulative,
                overlapSec: ov.overlapSec,
              });
            });
            cumulative += filesData[idx].subtitles.length;
          });
        }

        if (subs.length > 0) {
          const frameRate = useSubtitleStore.getState().frameRate || 30;

          // speaker + speakerName 이 모두 있는 경우에만 화자로 등록
          // speaker 만 있거나 speakerName 만 있는 경우는 '없는 화자'로 취급 (speakerId = null)
          const speakerNames = new Map();
          subs.forEach((sub) => {
            if (sub.speaker == null || sub.speaker === '') return;
            const num = parseInt(sub.speaker, 10);
            if (!Number.isFinite(num) || num < 1 || num > 100) return;
            const name = (sub.speakerName || '').trim();
            if (!name) return;
            if (!speakerNames.has(num)) {
              speakerNames.set(num, name);
            }
          });

          // _chunkIndex 는 충돌 재검출(Q4 루프)에 필요하므로 mapped 자막에도 보존.
          const mappedSubs = subs.map((sub) => {
            const st = sub.startTime ?? timeCodeToSeconds(sub.start) ?? 0;
            const et = sub.endTime ?? timeCodeToSeconds(sub.end) ?? 0;
            const parsed = sub.speaker != null && sub.speaker !== ''
              ? parseInt(sub.speaker, 10)
              : null;
            const speakerId = Number.isFinite(parsed) ? parsed : null;
            return {
              id: sub.id || crypto.randomUUID(),
              text: sub.text || '',
              sourceText: sub.sourceText || '',
              middleText: sub.middleText || '',
              startTime: st,
              endTime: et,
              startFrame: Math.floor(st * frameRate),
              endFrame: Math.floor(et * frameRate),
              position: sub.align || sub.position || 'bottomCenter',
              speakerId,
              _chunkIndex: sub._chunkIndex,
            };
          });
          useSubtitleStore.setState({ subtitles: mappedSubs });

          // 분할 경계 자막 겹침이 있으면 사용자에게 해결 모달 띄움 (SttMergeConflictModal 재사용).
          if (pendingOverlaps.length > 0) {
            setMergeConflict({ subtitles: mappedSubs, overlaps: pendingOverlaps });
            toast.warning(
              t("enterprise.mergeConflictDetected", {
                ns: "soribaro",
                count: pendingOverlaps.length,
              }),
            );
          }

          if (skipCache) {
            toast.success(
              t("enterprise.mergeReviewRefetchDone", {
                ns: "soribaro",
                defaultValue: `원본에서 재병합 완료 (자막 ${subs.length}건)`,
              }),
            );
          }

          const speakerState = useSpeakerStore.getState();
          speakerState.clearAllSpeakers();
          speakerNames.forEach((name, num) => {
            speakerState.addSpeakerWithNumber(num, name);
          });
        } else if (skipCache) {
          // 재조회 시 결과가 비어있으면 명확히 알려줌
          toast.warning(
            t("enterprise.mergeReviewRefetchEmpty", {
              ns: "soribaro",
              defaultValue:
                "병합 가능한 검수완료(REVIEW_DONE) 자막이 없습니다. 각 파일의 검수 상태를 확인해주세요.",
            }),
          );
        }
      } catch (err) {
        console.error('[SubtitleList] 병합 자막 로드 실패:', err);
      } finally {
        setIsLoadingSubtitles(false);
      }
      return;
    }

    if (!urlServCd || !urlFileNo || !isServerFile) return;

    // 새 요청 ID 발급 (이전 요청의 결과를 무효화)
    const requestId = ++loadRequestIdRef.current;

    // 이전 로딩이 진행 중이었다면 플래그만 해제 (새 요청이 대체)
    isLoadingRef.current = true;
    setIsLoadingSubtitles(true);
    setIsWorkChecked(false); // 로딩 시작 시 초기화

    // stale 체크 헬퍼: 현재 요청이 최신인지 확인
    const isStale = () => loadRequestIdRef.current !== requestId;

    // type별 자막 로드 헬퍼: getProjectFileInfo → 각 projectFileId별 getLatestSubtitleWork → 순서대로 합침
    // 반환: { subtitles: [...], lang: string|null, isChecked: boolean, projectFileId: string|null }
    const emptyResult = {
      subtitles: [],
      lang: null,
      isChecked: false,
      projectFileId: null,
      startSec: null,
      endSec: null,
    };
    const fetchProjectSubtitlesByType = async (type) => {
      try {
        const infoResponse = await getProjectFileInfo(
          urlServCd,
          type,
          urlFileNo,
        );
        if (isStale()) return emptyResult;
        if (infoResponse?.status !== "SUCCESS" || !infoResponse?.data?.length) {
          return emptyResult;
        }
        // isSplit에 따라 대상 데이터 필터링
        const filteredInfoData = urlIsSplit
          ? infoResponse.data.filter(
              (info) =>
                info.isSplit &&
                info.startSec === allowedStartSec &&
                info.endSec === allowedEndSec,
            )
          : infoResponse.data.filter((info) => !info.isSplit);
        // 필터 결과가 없으면 전체 데이터로 fallback
        const targetData =
          filteredInfoData.length > 0 ? filteredInfoData : infoResponse.data;
        const firstProjectFileId = targetData[0].projectFileId || null;
        let firstLang = targetData[0].lang || null;
        let firstIsChecked = false;
        // 각 projectFileId별 최신 자막 조회 후 순서대로 합침.
        // role=START(작업자) 진입 시 자신의 type(=START) 자막은 작업자 진입용 API 로 조회.
        //   - WORK_DONE / WORKING / REVIEW_DONE / REVIEW_REJECT 중 최신
        //   - REVIEWING 은 검수자 진행본이라 제외
        //   - 최신이 REVIEW_REJECT 면 백엔드가 이전 작업자 본(WORK_DONE/WORKING)으로 fallback
        // 검수자(MID/FINAL 등) 진입 시 자기 역할의 type 자막은 검수 본
        // (REVIEWING/REVIEW_DONE/REVIEW_REJECT) 중 최신을 우선 가져와,
        // 검수자가 마지막으로 만진 본에서 이어 작업하도록 한다.
        // 검수 본이 없으면 백엔드가 WORK_DONE 으로 fallback 한다.
        const useWorkerLatest = role === Role.START && type === "START";
        const useReviewerLatest = isReviewer(role) && type === getBaseRole(role);
        const subtitleArrays = await Promise.all(
          targetData.map(async (info) => {
            try {
              const workResponse = useWorkerLatest
                ? await getLatestSubtitleWorkForWorker(info.projectFileId)
                : useReviewerLatest
                  ? await getLatestSubtitleWorkForReview(info.projectFileId)
                  : await getLatestSubtitleWork(info.projectFileId);
              if (isStale()) return [];
              if (workResponse?.status === "SUCCESS" && workResponse?.data) {
                if (firstLang === null && workResponse.data.lang) {
                  firstLang = workResponse.data.lang;
                }
                if (!firstIsChecked && workResponse.data.isChecked) {
                  firstIsChecked = true;
                }
                if (workResponse.data.subtitle) {
                  return parseSubtitleJson(workResponse.data.subtitle)?.subtitles ?? [];
                }
              }
            } catch (e) {
              // 404는 데이터 없음 (정상) - 그 외 에러만 경고
              if (e?.status !== 404) {
                console.warn(
                  `[loadSubtitlesFromServer] getLatestSubtitleWork 실패 (projectFileId=${info.projectFileId}):`,
                  e,
                );
              }
            }
            return [];
          }),
        );
        if (isStale()) return emptyResult;
        return {
          subtitles: subtitleArrays.flat(),
          lang: firstLang,
          isChecked: firstIsChecked,
          projectFileId: firstProjectFileId,
          startSec: targetData[0].startSec ?? null,
          endSec: targetData[0].endSec ?? null,
        };
      } catch (error) {
        console.warn(
          `[loadSubtitlesFromServer] ${type} 자막 조회 실패:`,
          error,
        );
        return emptyResult;
      }
    };

    try {
      const baseRole = getBaseRole(role);

      // 모든 필요한 type의 데이터를 병렬로 한번에 가져옴
      const typesToFetch =
        baseRole === Role.START
          ? ["START"]
          : baseRole === Role.MID
            ? ["START", "MID"]
            : ["START", "MID", "FINAL"];

      const results = await Promise.all(
        typesToFetch.map((type) => fetchProjectSubtitlesByType(type)),
      );

      // stale 체크: 로딩 중 role/params가 바뀌었으면 결과를 버림
      if (isStale()) {
        return;
      }

      // 결과 매핑
      const startResult = results[0] || {
        subtitles: [],
        lang: null,
        isChecked: false,
      };
      const midResult = results[1] || {
        subtitles: [],
        lang: null,
        isChecked: false,
      };
      const finalResult = results[2] || {
        subtitles: [],
        lang: null,
        isChecked: false,
      };

      // role별 자막 영역 할당.
      // 각 역할의 자막 개수가 서로 다를 수 있으므로(예: 출발어 30 / 도착어 20),
      // 시간 합집합 기반 머지를 통해 빈 싱크를 자동 생성하는 방식으로 처리한다.
      let baseSubtitles = [];
      let sourceSubtitles = [];
      let middleSubtitles = [];

      if (baseRole === Role.START) {
        baseSubtitles = startResult.subtitles;
      } else if (baseRole === Role.MID) {
        sourceSubtitles = startResult.subtitles;
        baseSubtitles = midResult.subtitles;
      } else if (baseRole === Role.FINAL) {
        sourceSubtitles = startResult.subtitles;
        middleSubtitles = midResult.subtitles;
        baseSubtitles = finalResult.subtitles;
      }

      // 최종 stale 체크: 모든 데이터가 준비된 후, 상태 적용 직전에 한번 더 확인
      if (isStale()) {
        return;
      }

      // === 여기서부터 모든 상태를 한번에 적용 ===

      // 1. 언어 설정
      if (baseRole === Role.START) {
        if (startResult.lang) setTargetLanguage(startResult.lang);
      } else if (baseRole === Role.MID) {
        if (startResult.lang) setSourceLanguage(startResult.lang);
        if (midResult.lang) setMiddleLanguage(midResult.lang);
      } else if (baseRole === Role.FINAL) {
        if (startResult.lang) setSourceLanguage(startResult.lang);
        if (midResult.lang) setMiddleLanguage(midResult.lang);
        if (finalResult.lang) setTargetLanguage(finalResult.lang);
      }

      // 2. type별 projectFileId 저장 (저장 시 활용)
      loadedProjectFileIdsRef.current = {
        START: startResult.projectFileId,
        MID: midResult.projectFileId,
        FINAL: finalResult.projectFileId,
      };

      // 3. 검수 완료 여부 저장 (read-only 판별은 렌더 시 role과 함께 계산)
      let editingIsChecked = false;
      if (baseRole === Role.START) editingIsChecked = startResult.isChecked;
      else if (baseRole === Role.MID) editingIsChecked = midResult.isChecked;
      else if (baseRole === Role.FINAL)
        editingIsChecked = finalResult.isChecked;
      setIsWorkChecked(editingIsChecked);

      // 4. 프로젝트 파일 상태 조회 (초기화 버튼 표시 제어용)
      if (urlProjectFileId) {
        try {
          const pfRes = await getProjectFileById(urlProjectFileId);
          if (pfRes?.status === "SUCCESS" && pfRes.data?.status) {
            setProjectFileStatus(pfRes.data.status);
          }
        } catch {
          // silent
        }
      }

      // 3. 프로젝트 파일별 화자 데이터 로드 (localStorage → 서버 데이터 보완)
      const speakerState = useSpeakerStore.getState();
      speakerState.loadSpeakersForFile(urlProjectFileId);

      const allSubsForSpeakers = [...baseSubtitles, ...sourceSubtitles, ...middleSubtitles];
      allSubsForSpeakers.forEach((sub) => {
        if (sub.speaker && sub.speakerName) {
          const num = parseInt(sub.speaker, 10);
          if (num >= 1 && num <= 100) {
            const existing = useSpeakerStore.getState().speakers[num];
            if (!existing) {
              useSpeakerStore.getState().addSpeakerWithNumber(num, sub.speakerName);
            } else if (existing.name !== sub.speakerName) {
              useSpeakerStore.getState().updateSpeakerName(num, sub.speakerName);
            }
          }
        }
      });

      // 4. 기존 자막 초기화 후 새 데이터 적용
      // WorkToolPage의 setFileId(fileNo) effect가 이 시점에 아직 반영되지 않은 경우(특히
      // popup 진입)에는 store의 fileId가 비어있을 수 있어, URL 라우트 파라미터로 폴백한다.
      const savedFileId = fileId || urlFileNo;
      clearSubtitles();
      if (savedFileId) setFileId(savedFileId);

      // 서버 응답(start/end 타임코드)을 초 단위로 정규화한 뒤
      // base / source / middle 을 시간 합집합 기준으로 병합한다.
      // 자막 위치는 저장 시 envelope에 `position` 으로 직렬화되지만
      // STT/번역 자동 생성 자막은 `align` 키로 들어온다. 둘 다 수용해야
      // 저장→재진입 시 사용자가 설정한 위치가 유지된다.
      const normalizeServerSub = (sub) => ({
        id: sub.id,
        startTime: parseTimeCode(sub.start) || 0,
        endTime: parseTimeCode(sub.end) || 0,
        text: sub.text || "",
        speaker: sub.speaker,
        speakerName: sub.speakerName,
        align: sub.align || sub.position,
      });

      const mergedSubtitles = mergeTranslationSubtitles(
        baseSubtitles.map(normalizeServerSub),
        sourceSubtitles.map(normalizeServerSub),
        middleSubtitles.map(normalizeServerSub),
      );

      // VOD + 분할 진입일 때만 다른 분할 구간의 최신 자막(상태 무관)을 readonly 로 함께 노출한다.
      // 녹취록/회의록/번역은 기존 동작 유지, locked fetch 실패해도 자기 자막으로 계속 진행한다.
      // type 인자에는 projects.type 컬럼 값 (작업 단계 = baseRole, 'START'/'MID'/'FINAL') 을 넘긴다.
      // VOD 한정은 백엔드가 TB_SERV.VIDEO_YN='Y' + SERV_TP='3' 으로 보장한다.
      let lockedSubs = [];
      const shouldLoadLockedOthers =
        workCategory === "vod" &&
        urlIsSplit &&
        hasTimeRestriction &&
        !!urlProjectFileId &&
        !!urlServCd &&
        !!urlFileNo &&
        !!baseRole;
      if (shouldLoadLockedOthers) {
        try {
          const lockedResp = await getLockedOthers(
            urlServCd,
            baseRole,
            urlFileNo,
            urlProjectFileId,
          );
          if (
            lockedResp?.status === "SUCCESS" &&
            Array.isArray(lockedResp.data)
          ) {
            lockedSubs = lockedResp.data.flatMap((row) => {
              const parsed = parseSubtitleJson(row.subtitle)?.subtitles ?? [];
              return parsed.map((s) => ({
                ...s,
                startTime: parseTimeCode(s.start) || s.startTime || 0,
                endTime: parseTimeCode(s.end) || s.endTime || 0,
                locked: true,
                lockedSourceProjectFileId: row.projectFileId,
              }));
            });
          }
        } catch (e) {
          if (e?.status !== 404) {
            console.warn("[SubtitleList] VOD locked subtitles fetch 실패", e);
          }
        }
      }

      // bulk: forEach(addSubtitle) 는 N 개에 대해 O(N^2) + N 번 리렌더가 일어난다.
      // setSubtitles 는 1 회 정렬 + 1 회 set 으로 끝낸다.
      const bulk = mergedSubtitles.map((sub) => ({
        id: sub.id || undefined,
        text: sub.text,
        sourceText: sub.sourceText,
        middleText: sub.middleText,
        startTime: sub.startTime,
        endTime: sub.endTime,
        speakerId:
          sub.speaker != null && sub.speaker !== ""
            ? parseInt(sub.speaker, 10)
            : null,
        position: sub.align || "bottomCenter",
      }));

      // 자기 자막이 비어있으면 빈 싱크 1건을 자동 추가한다 (lockedSubs 유무와 무관).
      // - 분할 진입: 자기 영역(allowedStart~allowedEnd) 전체를 차지하는 빈 싱크
      // - 비분할/일반 진입: 0~duration 으로 빈 싱크
      // 이전 if/else 분기 분리 구조에서는 locked 가 비어있으면 fallback 으로 빠지고
      // locked 가 있으면 if 분기 안에서 별도 처리되었는데, 빈 envelope 가 저장된
      // 자기 자막을 다시 불러올 때 회귀가 생겨 한 흐름으로 통합한다.
      if (mergedSubtitles.length === 0) {
        const emptyStart = allowedStartSec ?? 0;
        const emptyEnd =
          allowedEndSec ??
          urlPlayTm ??
          startResult.endSec ??
          (useSubtitleStore.getState().duration || 0);
        if (Number.isFinite(emptyEnd) && emptyEnd > emptyStart) {
          bulk.push({
            text: "",
            startTime: emptyStart,
            endTime: emptyEnd,
          });
        }
      }

      // locked 자막은 mergeTranslationSubtitles 의 시간 합집합 머지 대상이 아니라
      // 별도 row 로 추가한다 (다른 작업자 구간 → 읽기 전용).
      // 화자 충돌 방지: locked 의 speakerId 는 자기 화자 store 와 매핑하지 않으며
      // 화자명도 표시하지 않으므로 별도 필드도 부여하지 않는다.
      lockedSubs.forEach((sub) => {
        bulk.push({
          id: sub.id || undefined,
          text: sub.text || "",
          sourceText: sub.sourceText || "",
          middleText: sub.middleText || "",
          startTime: sub.startTime,
          endTime: sub.endTime,
          speakerId: null,
          position: sub.align || sub.position || "bottomCenter",
          locked: true,
          lockedSourceProjectFileId: sub.lockedSourceProjectFileId,
        });
      });

      setSubtitles(bulk);

      // 분할 진입 시 자기 작업 구간(allowedStartSec) 의 첫 자막으로 자동 스크롤한다.
      // locked 자막이 함께 표시되는 VOD 분할에서, 사용자가 0초가 아니라 자기 영역부터 보도록.
      // setSubtitles 가 store 내부에서 startTime 안정 정렬하므로 그 결과를 그대로 사용.
      if (hasTimeRestriction && urlIsSplit) {
        const finalSubs = useSubtitleStore.getState().subtitles;
        let idx = finalSubs.findIndex(
          (s) => !s.locked && s.endTime > allowedStartSec,
        );
        if (idx === -1) {
          idx = finalSubs.findIndex((s) => s.endTime > allowedStartSec);
        }
        if (idx !== -1) {
          // React commit 후 VirtualList layout 안정 한 frame 뒤에 스크롤.
          requestAnimationFrame(() => {
            navContextRef.current.listApi?.scrollToRow({
              index: idx,
              align: "center",
            });
          });
        }
      }
    } catch (error) {
      // stale 요청의 에러는 무시
      if (isStale()) return;
      console.error("자막 로드 실패:", error);
      toast.error(t("subtitle.loadFailed"));
    } finally {
      // 현재 요청이 최신인 경우에만 로딩 플래그 해제
      if (!isStale()) {
        isLoadingRef.current = false;
        setIsLoadingSubtitles(false);
      }
    }
  }, [
    urlServCd,
    urlFileNo,
    urlProjectFileId,
    urlIsSplit,
    hasTimeRestriction,
    workCategory,
    isServerFile,
    role,
    fileId,
    clearSubtitles,
    setSubtitles,
    setFileId,
    setSourceLanguage,
    setMiddleLanguage,
    setTargetLanguage,
    isMergeMode,
    mergeServCd,
    mergeFiles,
  ]);

  // URL 파라미터 또는 role 변경 시 자막 로드
  useEffect(() => {
    if (isMergeMode && mergeServCd && mergeFiles?.length >= 1) {
      loadSubtitlesFromServer();
      return;
    }
    if (urlServCd && urlFileNo && isServerFile) {
      loadSubtitlesFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlServCd, urlFileNo, isServerFile, role, isMergeMode, mergeServCd, mergeFiles]);

  // 리뷰 태그 마스터 데이터 + 아이템별 태깅 데이터 로드
  useEffect(() => {
    if (!urlProjectFileId) return;

    let cancelled = false;
    const loadReviewData = async () => {
      try {
        const [groupsRes, tagsRes, appliedRes, commentsRes] = await Promise.all(
          [
            getAllReviewTagGroups(),
            getAllReviewTags(),
            getSubtitleReviewTags(urlProjectFileId),
            getSubtitleComments(urlProjectFileId),
          ],
        );
        if (cancelled) return;
        if (groupsRes?.status === "SUCCESS")
          setReviewGroups(groupsRes.data || []);
        if (tagsRes?.status === "SUCCESS") setReviewTags(tagsRes.data || []);
        if (appliedRes?.status === "SUCCESS") {
          const map = {};
          (appliedRes.data || []).forEach((t) => {
            if (!map[t.itemId]) map[t.itemId] = [];
            map[t.itemId].push(t);
          });
          setSubtitleReviewTagMap(map);
        }
        if (commentsRes?.status === "SUCCESS") {
          const map = {};
          (commentsRes.data || []).forEach((c) => {
            if (!map[c.itemId]) map[c.itemId] = [];
            map[c.itemId].push(c);
          });
          setSubtitleCommentMap(map);
        }
      } catch (err) {
        console.warn("[SubtitleList] 리뷰 데이터 로드 실패:", err);
      }
    };
    loadReviewData();
    return () => {
      cancelled = true;
    };
  }, [urlProjectFileId]);

  // 연수 모드: assignment_student_id 기준 코멘트 로드
  // (위 리뷰 데이터 로드는 urlProjectFileId 가 없으면 early-return 되어 연수 모드에선 동작하지 않음)
  useEffect(() => {
    if (!isTrainingMode || !urlTrainingAsid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getTrainingComments(urlTrainingAsid);
        if (cancelled) return;
        if (res?.status === "SUCCESS") {
          const map = {};
          (res.data || []).forEach((c) => {
            if (!map[c.itemId]) map[c.itemId] = [];
            map[c.itemId].push(c);
          });
          setSubtitleCommentMap(map);
        }
      } catch (err) {
        console.warn("[SubtitleList] 연수 코멘트 로드 실패:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTrainingMode, urlTrainingAsid]);

  // 리뷰 태그 토글 핸들러
  const handleReviewTagToggle = useCallback(
    async (subtitleId, reviewTagId, existingRecord) => {
      if (existingRecord) {
        setSubtitleReviewTagMap((prev) => {
          const next = { ...prev };
          next[subtitleId] = (next[subtitleId] || []).filter(
            (t) => t.id !== existingRecord.id,
          );
          return next;
        });
        try {
          await deleteSubtitleReviewTag(existingRecord.id);
        } catch (err) {
          console.error("리뷰 태그 삭제 실패:", err);
        }
      } else {
        const tempId = `temp-${Date.now()}`;
        const newRecord = {
          id: tempId,
          projectFileId: urlProjectFileId,
          itemId: subtitleId,
          reviewTagId,
          createdBy: currentUserId,
        };
        setSubtitleReviewTagMap((prev) => {
          const next = { ...prev };
          next[subtitleId] = [...(next[subtitleId] || []), newRecord];
          return next;
        });
        try {
          const res = await createSubtitleReviewTag({
            projectFileId: urlProjectFileId,
            itemId: subtitleId,
            reviewTagId,
            createdBy: currentUserId,
          });
          if (res?.status === "SUCCESS" && res.data?.id) {
            setSubtitleReviewTagMap((prev) => {
              const next = { ...prev };
              next[subtitleId] = (next[subtitleId] || []).map((t) =>
                t.id === tempId ? { ...t, id: res.data.id } : t,
              );
              return next;
            });
          }
        } catch (err) {
          console.error("리뷰 태그 생성 실패:", err);
          setSubtitleReviewTagMap((prev) => {
            const next = { ...prev };
            next[subtitleId] = (next[subtitleId] || []).filter(
              (t) => t.id !== tempId,
            );
            return next;
          });
        }
      }
    },
    [urlProjectFileId, user],
  );

  // 코멘트 CRUD 핸들러
  const handleCommentAdd = useCallback(
    async (subtitleId, text) => {
      const tempId = `temp-${Date.now()}`;
      // 연수 모드는 assignment_student_id 기준, 일반 모드는 projectFileId 기준으로 식별한다.
      const newComment = {
        id: tempId,
        ...(isTrainingMode
          ? { assignmentStudentId: urlTrainingAsid }
          : { projectFileId: urlProjectFileId }),
        itemId: subtitleId,
        comments: text,
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
      };
      setSubtitleCommentMap((prev) => ({
        ...prev,
        [subtitleId]: [...(prev[subtitleId] || []), newComment],
      }));
      try {
        const res = isTrainingMode
          ? await createTrainingComment({
              assignmentStudentId: urlTrainingAsid,
              itemId: subtitleId,
              comments: text,
              createdBy: currentUserId,
            })
          : await createSubtitleComment({
              projectFileId: urlProjectFileId,
              itemId: subtitleId,
              comments: text,
              createdBy: currentUserId,
            });
        if (res?.status === "SUCCESS" && res.data?.id) {
          setSubtitleCommentMap((prev) => ({
            ...prev,
            [subtitleId]: (prev[subtitleId] || []).map((c) =>
              c.id === tempId ? { ...c, ...res.data } : c,
            ),
          }));
        }
      } catch (err) {
        console.error("코멘트 작성 실패:", err);
        setSubtitleCommentMap((prev) => ({
          ...prev,
          [subtitleId]: (prev[subtitleId] || []).filter((c) => c.id !== tempId),
        }));
      }
    },
    [urlProjectFileId, user, isTrainingMode, urlTrainingAsid],
  );

  const handleCommentUpdate = useCallback(
    async (subtitleId, commentId, text) => {
      setSubtitleCommentMap((prev) => ({
        ...prev,
        [subtitleId]: (prev[subtitleId] || []).map((c) =>
          c.id === commentId ? { ...c, comments: text } : c,
        ),
      }));
      try {
        if (isTrainingMode) {
          await updateTrainingComment(commentId, { comments: text });
        } else {
          await updateSubtitleComment(commentId, { comments: text });
        }
      } catch (err) {
        console.error("코멘트 수정 실패:", err);
      }
    },
    [isTrainingMode],
  );

  const handleCommentDelete = useCallback(async (subtitleId, commentId) => {
    setSubtitleCommentMap((prev) => ({
      ...prev,
      [subtitleId]: (prev[subtitleId] || []).filter((c) => c.id !== commentId),
    }));
    try {
      if (isTrainingMode) {
        await deleteTrainingComment(commentId);
      } else {
        await deleteSubtitleComment(commentId);
      }
    } catch (err) {
      console.error("코멘트 삭제 실패:", err);
    }
  }, [isTrainingMode]);

  // 가이드라인 위치 계산 (textarea 실제 위치 기반)
  useEffect(() => {
    if (!listContentRef.current || maxSegmentLength <= 0) {
      setGuidelineLeft(null);
      return;
    }

    const measurePosition = () => {
      const textarea =
        listContentRef.current?.querySelector(".card-text-editor");
      if (!textarea) return;

      const listRect =
        listContentRef.current.parentElement.getBoundingClientRect();
      const textareaRect = textarea.getBoundingClientRect();
      const textareaLeft = textareaRect.left - listRect.left;
      const paddingLeft =
        parseFloat(getComputedStyle(textarea).paddingLeft) || 8;

      // guidelineBase 설정에 따라 기준 문자 측정
      const guidelineBase = subtitleEditor?.guidelineBase || "cjk";
      const measureSpan = document.createElement("span");
      measureSpan.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: pre;
        font-family: ${getComputedStyle(textarea).fontFamily};
        font-size: ${getComputedStyle(textarea).fontSize};
        font-weight: ${getComputedStyle(textarea).fontWeight};
        letter-spacing: ${getComputedStyle(textarea).letterSpacing};
      `;
      measureSpan.textContent = guidelineBase === "cjk" ? "가" : "0";
      document.body.appendChild(measureSpan);
      const charWidth = measureSpan.getBoundingClientRect().width;
      document.body.removeChild(measureSpan);

      // cjk: 한글 폭 × (guideline / 2), ascii: 영문 폭 × guideline
      const left =
        textareaLeft +
        paddingLeft +
        (guidelineBase === "cjk"
          ? charWidth * (maxSegmentLength / 2)
          : charWidth * maxSegmentLength);

      setGuidelineLeft(left);
    };

    // 초기 측정 (DOM이 렌더링된 후 실행)
    const timeoutId = setTimeout(measurePosition, 100);

    // window resize 이벤트 리스너
    window.addEventListener("resize", measurePosition);

    // ResizeObserver로 패널 리사이징 감지
    let resizeObserver = null;
    const wrapper = listContentRef.current?.parentElement;
    if (wrapper && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        measurePosition();
      });
      resizeObserver.observe(wrapper);
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", measurePosition);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [
    maxSegmentLength,
    subtitleEditor?.fontSize,
    subtitleEditor?.guidelineBase,
    subtitles.length,
    role,
    columnVisibility,
    columnWidths,
  ]);

  // 실제 저장 실행 (isReject, accuracyInfo는 옵셔널, saveStatus: WORKING | WORK_DONE | REVIEWING | REVIEW_DONE)
  const executeSave = useCallback(
    async (isReject = false, accuracyInfo = null, saveStatus = "WORKING") => {
      // 저장 직전 활성 textarea 를 blur 시켜 300ms 디바운스 중인 텍스트를 즉시 스토어로 flush.
      // (Ctrl+S 단축키나 빠른 마우스 클릭으로 blur 없이 저장이 호출되면 마지막 타이핑이
      //  스토어에 도달하지 못해 서버로 옛 값이 저장되는 race 가 발생했음.)
      // 저장 완료 후 finally 에서 같은 textarea 의 커서 위치까지 복귀시키기 위해 캡처.
      const active = typeof document !== "undefined" ? document.activeElement : null;
      let savedFocus = null;
      if (active && active.tagName === "TEXTAREA" && typeof active.blur === "function") {
        savedFocus = {
          el: active,
          selectionStart: active.selectionStart ?? null,
          selectionEnd: active.selectionEnd ?? null,
        };
        active.blur();
      }
      // closure 의 subtitles 는 위 blur → updateSubtitle 의 store 변경을 같은 이벤트 사이클
      // 안에서 따라가지 못한다. 저장 본문은 항상 최신 store 스냅샷을 사용.
      const subtitles = useSubtitleStore.getState().subtitles;

      // 연수(Training) 모드 분기:
      //   START   : 시연 모드 — 저장 비활성
      //   ANSWER  : 정답지 작성 — PUT /training-files/{trainingFileId}/answer (파일 단위)
      //   STUDENT : 수강생 작업 — POST /me/assignments/{asid}/works (WORK 저장)
      if (isTrainingStart) {
        toast.info(t("training.saveDisabled", { ns: "common" }));
        return;
      }
      if (isTrainingAnswer || isTrainingStudent) {
        // 자막 envelope 직렬화 (기존 작성과 동일 1.4 포맷)
        const buildEnv = () => {
          const allSpeakers = useSpeakerStore.getState().speakers;
          const frameRate = useSubtitleStore.getState().frameRate || 30;
          return serializeSubtitleJson({
            permission: "FINAL",
            frameRate,
            languages: {
              source: sourceLanguage,
              middle: middleLanguage,
              target: targetLanguage,
            },
            speakers: Object.values(allSpeakers).sort((a, b) => a.number - b.number),
            subtitles: subtitles.map((sub) => ({
              id: sub.id,
              startTime: sub.startTime,
              endTime: sub.endTime,
              start: secondsToTimeCode(sub.startTime),
              end: secondsToTimeCode(sub.endTime),
              text: sub.text || "",
              speaker: sub.speakerId != null ? String(sub.speakerId) : "",
              speakerId: sub.speakerId ?? null,
              position: sub.position || "bottomCenter",
            })),
          });
        };

        setIsSaving(true);
        try {
          if (isTrainingAnswer) {
            const { upsertAnswer } = await import(
              "../../../api/v9/training/assignments"
            );
            await upsertAnswer(urlTrainingFileId, {
              subtitle: buildEnv(),
              format: "json",
            });
            toast.success(t("training.answer.saved", { ns: "common" }));
          } else if (isTrainingStudent) {
            const { saveMyWork } = await import("../../../api/v9/training/trainee");
            await saveMyWork(urlTrainingAsid, { subtitle: buildEnv() });
            toast.success(t("training.studentMode.workSaved", { ns: "common" }));
          }
        } catch (err) {
          console.error("[SubtitleList] training save failed:", err);
          toast.error(
            isTrainingAnswer
              ? t("training.answer.saveFailed", { ns: "common" })
              : t("training.studentMode.workSaveFailed", { ns: "common" }),
          );
        } finally {
          setIsSaving(false);
        }
        return;
      }
      setIsSaving(true);
      try {
        // subtitle_works.subtitle 컬럼에 저장할 envelope 직렬화.
        // 파일 export 와 동일한 worktool envelope(1.4) 포맷을 사용하되,
        // 권한 매핑(text↔sourceText/middleText)은 적용하지 않는다 — DB 행은
        // (projectFileId, workType) 키이므로 envelope.subtitles[].text 가 항상 1차 콘텐츠.
        const buildSubtitleEnvelope = (items, permission) => {
          const allSpeakers = useSpeakerStore.getState().speakers;
          const frameRate = useSubtitleStore.getState().frameRate || 30;
          return serializeSubtitleJson({
            permission,
            frameRate,
            languages: {
              source: sourceLanguage,
              middle: middleLanguage,
              target: targetLanguage,
            },
            speakers: Object.values(allSpeakers).sort(
              (a, b) => a.number - b.number,
            ),
            subtitles: items.map((sub) => ({
              id: sub.id,
              startTime: sub.startTime,
              endTime: sub.endTime,
              start: secondsToTimeCode(sub.startTime),
              end: secondsToTimeCode(sub.endTime),
              text: sub.text || "",
              speaker: sub.speakerId != null ? String(sub.speakerId) : "",
              speakerId: sub.speakerId ?? null,
              speakerName:
                sub.speakerId != null &&
                sub.speakerId !== 0 &&
                allSpeakers[sub.speakerId]
                  ? allSpeakers[sub.speakerId].name
                  : "",
              position: sub.position || "bottomCenter",
            })),
          });
        };

        // 병합 모드: servCd + workType=MERGED로 저장
        // 단일 파일 분할 병합검수(mergeFiles.length === 1)인 경우에 한해
        // 원본 fileNo를 함께 저장 — 다중 파일 병합검수는 대표 fileNo가 없으므로 미저장
        if (isMergeMode && mergeFiles?.length > 0) {
          const subtitleEnvelope = buildSubtitleEnvelope(subtitles, "FINAL");
          const splitMergeFileNo =
            mergeFiles.length === 1 && mergeFiles[0]?.fileNo != null
              ? Number(mergeFiles[0].fileNo)
              : null;

          await createSubtitleWork({
            servCd: mergeServCd || "",
            fileNo: splitMergeFileNo,
            workType: "MERGED",
            status: "REVIEW_DONE",
            workerId: currentUserId,
            subtitle: subtitleEnvelope,
            isChecked: false,
          });

          toast.success(t("enterprise.mergeReviewSaved", { ns: "soribaro" }));
          setIsSaving(false);
          return;
        }

        const baseRole = getBaseRole(role);
        const pids = loadedProjectFileIdsRef.current;
        const resolvedStatus = isReject ? "REVIEW_REJECT" : saveStatus;
        const commonFields = {
          servCd: urlServCd || "",
          fileNo: urlFileNo ? Number(urlFileNo) : null,
          status: resolvedStatus,
          workerId: currentUserId,
        };
        const isCheckedForEditing = !isReject && isReviewer(role) && saveStatus === "REVIEW_DONE";

        const buildEnvelopeFor = (textField, workType) => {
          // locked 자막은 다른 작업자의 자산 — 저장 페이로드에 포함하면 안 된다.
          // 그 외 시간 필터(allowed 영역) 같은 추가 가두기는 두지 않는다. 자기 자막은
          // 어느 시간대에 있든 그대로 저장한다. (시간으로 가두면 분할 경계 자막이
          // 빠지거나 envelope 가 빈 배열로 저장되는 회귀가 생긴다.)
          const filtered = subtitles
            .filter((sub) => !sub.locked)
            .map((sub) => ({ ...sub, text: sub[textField] || "" }));
          return buildSubtitleEnvelope(filtered, workType);
        };

        const savePromises = [];

        if (baseRole === Role.START) {
          savePromises.push(
            createSubtitleWork({
              ...commonFields,
              projectFileId: urlProjectFileId || pids.START || fileId,
              workType: "START",
              lang: targetLanguage,
              subtitle: buildEnvelopeFor("text", "START"),
              isChecked: isCheckedForEditing,
            }),
          );
        } else if (baseRole === Role.MID) {
          if (pids.START) {
            savePromises.push(
              createSubtitleWork({
                ...commonFields,
                status: "READONLY",
                projectFileId: pids.START,
                workType: "START",
                lang: sourceLanguage,
                subtitle: buildEnvelopeFor("sourceText", "START"),
                isChecked: false,
              }),
            );
          }
          savePromises.push(
            createSubtitleWork({
              ...commonFields,
              projectFileId: urlProjectFileId || pids.MID || fileId,
              workType: "MID",
              lang: middleLanguage,
              subtitle: buildEnvelopeFor("text", "MID"),
              isChecked: isCheckedForEditing,
            }),
          );
        } else if (baseRole === Role.FINAL) {
          if (pids.START) {
            savePromises.push(
              createSubtitleWork({
                ...commonFields,
                status: "READONLY",
                projectFileId: pids.START,
                workType: "START",
                lang: sourceLanguage,
                subtitle: buildEnvelopeFor("sourceText", "START"),
                isChecked: false,
              }),
            );
          }
          if (pids.MID && hasMiddleTextData) {
            savePromises.push(
              createSubtitleWork({
                ...commonFields,
                status: "READONLY",
                projectFileId: pids.MID,
                workType: "MID",
                lang: middleLanguage,
                subtitle: buildEnvelopeFor("middleText", "MID"),
                isChecked: false,
              }),
            );
          }
          savePromises.push(
            createSubtitleWork({
              ...commonFields,
              projectFileId: urlProjectFileId || pids.FINAL || fileId,
              workType: "FINAL",
              lang: targetLanguage,
              subtitle: buildEnvelopeFor("text", "FINAL"),
              isChecked: isCheckedForEditing,
            }),
          );
        }

        const results = await Promise.all(savePromises);

        const allSuccess = results.every((r) => r?.status === "SUCCESS");
        if (allSuccess) {
          const nextWorkStat = getWorkStatOnSave({
            role,
            isReviewerRole: isReviewer(role),
            isReject,
            currentWorkStat: currentWorkStatRef.current,
          });
          await updateServWorkStatSilently(
            nextWorkStat,
            isReject ? "reject" : "save",
          );

          // WORKING 도 포함 — WORK_DONE 제출 후 작업자가 다시 일반 저장하면
          // project_files.status 가 WORKING 으로 회귀해야 work_stat 회귀와 정합.
          const statusTransitions = ["WORKING", "WORK_DONE", "REVIEW_REJECT", "REVIEW_DONE"];
          if (urlProjectFileId && statusTransitions.includes(resolvedStatus)) {
            try {
              await updateProjectFile(urlProjectFileId, { status: resolvedStatus });
            } catch (e) {
              console.warn("[SubtitleList] project_files.status 업데이트 실패:", e);
            }
          }

          setIsWorkChecked(isCheckedForEditing);
          if (accuracyInfo) {
            const savedResult = results.find(
              (r) => r?.status === "SUCCESS" && r?.data?.revision != null,
            );
            const savedRevision = savedResult?.data?.revision ?? null;

            try {
              await upsertProjectFileEvaluation({
                projectFileId: urlProjectFileId,
                workRevision: accuracyInfo.loadedRevision,
                checkRevision: savedRevision,
                accuracy: Math.round(accuracyInfo.accuracy * 100) / 100,
                errorCount: accuracyInfo.errorCount ?? 0,
                formErrorCount: accuracyInfo.formErrorCount ?? 0,
                createdBy: currentUserId,
                reason: accuracyInfo.reason || undefined,
              });
            } catch (e) {
              console.error("평가 데이터 저장 실패:", e);
            }
          }
          toast.success(
            isReject ? t("subtitle.rejected") : t("subtitle.saved"),
          );
        } else {
          // 일부 호출이 status !== "SUCCESS" 로 응답. 어떤 호출이 어떤 이유로
          // 실패했는지 진단할 수 있도록 호출별 결과 요약을 함께 남긴다.
          const failedResults = results.filter((r) => r?.status !== "SUCCESS");
          console.error("[SubtitleList] partialSaveFailed", {
            isReject,
            totalCalls: results.length,
            failedCount: failedResults.length,
            failedResults: failedResults.map((r) => ({
              status: r?.status,
              code: r?.code,
              message: r?.message,
            })),
          });
          toast.error(
            t("subtitle.partialSaveFailed", { failedCount: failedResults.length }),
          );
        }
      } catch (error) {
        // outer catch: createSubtitleWork 가 throw (HTTP 4xx/5xx, 네트워크 끊김,
        // fetch abort, JSON 파싱 실패 등) 했거나 serializeSubtitleJson 이 throw.
        // error 객체의 핵심 필드를 모두 풀어서 찍어둬야 추후 사후 분석이 가능하다.
        console.error(isReject ? "반려 실패:" : "저장 실패:", {
          name: error?.name,
          message: error?.message,
          status: error?.status,
          data: error?.data,
          stack: error?.stack,
          error,
        });
        toast.error(
          isReject ? t("subtitle.rejectFailed") : t("subtitle.saveFailed"),
        );
      } finally {
        setIsSaving(false);
        // 저장 직전에 blur 시켰던 textarea 가 여전히 편집 가능하면 포커스/커서 위치 복귀.
        // 도중에 unmount 되거나 readOnly/검수완료로 전환된 경우엔 복귀하지 않는다.
        const restore = savedFocus;
        if (
          restore?.el &&
          document.body.contains(restore.el) &&
          !restore.el.disabled &&
          !restore.el.readOnly
        ) {
          restore.el.focus();
          if (restore.selectionStart != null) {
            try {
              restore.el.setSelectionRange(
                restore.selectionStart,
                restore.selectionEnd ?? restore.selectionStart,
              );
            } catch {
              // setSelectionRange 미지원/예외 무시
            }
          }
        }
      }
    },
    [
      fileId,
      urlProjectFileId,
      urlFileNo,
      urlServCd,
      // subtitles 는 의도적으로 deps 에서 제외 — 저장 본문은 항상 store 의 최신 스냅샷
      // (useSubtitleStore.getState().subtitles) 을 사용한다.
      role,
      user?.membId,
      sourceLanguage,
      middleLanguage,
      targetLanguage,
      updateServWorkStatSilently,
      isMergeMode,
      mergeServCd,
      mergeFiles,
      isTrainingMode,
      isTrainingStart,
      isTrainingAnswer,
      isTrainingStudent,
      urlTrainingAssignmentId,
      urlTrainingFileId,
      urlTrainingAsid,
      t,
    ],
  );

  // 저장 버튼 클릭 (isReject=true: 반려 처리, isChecked를 false로 저장)
  const handleSaveClick = useCallback(
    async (isReject = false) => {
      if (!fileId && !isMergeMode) {
        toast.error(t("subtitle.saveFailed"));
        return;
      }

      if (isMergeMode) {
        await executeSave();
        return;
      }

      if (isReviewer(role)) {
        if (isReject) {
          const confirmed = await confirm(t("subtitle.rejectConfirmMessage"), {
            title: t("subtitle.rejectConfirmTitle"),
            confirmText: t("subtitle.rejectButton"),
            cancelText: t("common.cancel"),
          });
          if (!confirmed) return;
          await executeSave(true);
        } else {
          await executeSave(false, null, "REVIEWING");
        }
      } else {
        // 비검수자: 저장만 수행 (WORKING)
        if (isReject) {
          await executeSave(true);
        } else {
          await executeSave(false, null, "WORKING");
        }
      }
    },
    [fileId, role, executeSave],
  );

  // 비검수자(작업자)용: 제출하기 클릭 시 confirm 후 WORK_DONE으로 저장
  const handleWorkerSubmitClick = useCallback(async () => {
    if (!fileId) {
      toast.error(t("subtitle.saveFailed"));
      return;
    }
    // store 의 최신 스냅샷으로 화자 미설정 검사. closure 의 subtitles 는 입력 디바운스 race
    // 와 별개로 같은 이벤트 사이클 내 zustand 갱신을 따라가지 못할 수 있다.
    const currentSubtitles = useSubtitleStore.getState().subtitles;
    if (
      !skipSpeakerWarning &&
      currentSubtitles.some(
        (s) => s.speakerId == null || (s.speakerId > 0 && !speakers[s.speakerId]),
      )
    ) {
      const proceed = await confirm(t("subtitle.speakerNotSetWarning"), {
        title: t("subtitle.submitButton"),
        confirmText: t("subtitle.submitButton"),
        cancelText: t("common.cancel"),
      });
      if (!proceed) return;
    }
    const willSubmit = await confirm(t("subtitle.submitConfirmMessage"), {
      title: t("subtitle.submitButton"),
      confirmText: t("subtitle.submitButton"),
      cancelText: t("common.cancel"),
    });
    if (!willSubmit) return;
    await executeSave(false, null, "WORK_DONE");
  }, [fileId, executeSave, skipSpeakerWarning, speakers, t]);

  // 검수자 전용: 제출하기 클릭 시 정확도 모달 후 REVIEW_DONE으로 저장
  const handleSubmitClick = useCallback(async () => {
    if (!fileId) {
      toast.error(t("subtitle.saveFailed"));
      return;
    }
    if (!isReviewer(role)) return;
    const currentSubtitles = useSubtitleStore.getState().subtitles;
    if (
      !skipSpeakerWarning &&
      currentSubtitles.some(
        (s) => s.speakerId == null || (s.speakerId > 0 && !speakers[s.speakerId]),
      )
    ) {
      const proceed = await confirm(t("subtitle.speakerNotSetWarning"), {
        title: t("subtitle.submitButton"),
        confirmText: t("subtitle.submitButton"),
        cancelText: t("common.cancel"),
      });
      if (!proceed) return;
    }
    setPendingSave({ isReject: false, isSubmit: true });
    setShowAccuracyModal(true);
  }, [fileId, role, skipSpeakerWarning, speakers, t]);

  // 정확도 모달에서 [확인] 클릭 시 저장 실행
  const handleAccuracyConfirm = useCallback(
    async (accuracyInfo) => {
      setShowAccuracyModal(false);
      const saveInfo = pendingSave;
      setPendingSave(null);
      if (saveInfo) {
        const saveStatus = saveInfo.isSubmit
          ? isReviewer(role)
            ? "REVIEW_DONE"
            : "WORK_DONE"
          : isReviewer(role)
            ? "REVIEWING"
            : "WORKING";
        await executeSave(saveInfo.isReject, accuracyInfo, saveStatus);
      }
    },
    [pendingSave, role, executeSave],
  );

  useEffect(() => {
    const handleGlobalSave = (e) => {
      if (isCheckedReadOnly) return;
      const shortcutId = useShortcutsStore.getState().getShortcutId(e);
      if (shortcutId === "save") {
        e.preventDefault();
        // 연수 ANSWER/STUDENT 모드에서는 executeSave 가 자체 분기 처리. 시연(START)은 export 폴백.
        if (isTrainingAnswer || isTrainingStudent) {
          handleSaveClick();
        } else if (isServerMode && !isTrainingMode) {
          handleSaveClick();
        } else {
          handleExportClick();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalSave);
    return () => window.removeEventListener("keydown", handleGlobalSave);
  }, [handleSaveClick, isServerMode, isCheckedReadOnly, isTrainingMode, isTrainingAnswer, isTrainingStudent]);

  // Ctrl+Z / Ctrl+Shift+Z: 전역 undo/redo
  useEffect(() => {
    const handleGlobalUndoRedo = (e) => {
      if (isCheckedReadOnly) return;
      // textarea 내부에서는 기존 핸들러가 처리하므로 스킵
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      const shortcutId = useShortcutsStore.getState().getShortcutId(e);
      if (shortcutId === "undo") {
        e.preventDefault();
        undo();
      } else if (shortcutId === "redo") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleGlobalUndoRedo);
    return () => window.removeEventListener("keydown", handleGlobalUndoRedo);
  }, [undo, redo, isCheckedReadOnly]);

  // F12: 화자 관리 모달 / Ctrl+숫자: 화자 즉시 설정 (다자릿수 지원)
  const speakerAccRef = useRef({ digits: "", timer: null });
  useEffect(() => {
    const applySpeaker = () => {
      const acc = speakerAccRef.current;
      const num = parseInt(acc.digits, 10);
      acc.digits = "";
      acc.timer = null;
      if (isNaN(num)) return;
      const subId = useSubtitleStore.getState().selectedSubtitleId;
      if (!subId) return;
      if (num === 0) {
        updateSubtitle(subId, { speakerId: 0 });
      } else {
        const speakers = useSpeakerStore.getState().speakers;
        if (speakers[num]) {
          updateSubtitle(subId, { speakerId: num });
        }
      }
    };

    const handleGlobalSpeaker = (e) => {
      if (isCheckedReadOnly) return;
      const shortcutId = useShortcutsStore.getState().getShortcutId(e);
      if (shortcutId === "openSpeakerManager") {
        e.preventDefault();
        setShowSpeakerModal(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        const digit = parseInt(e.key, 10);
        if (digit >= 0 && digit <= 9) {
          e.preventDefault();
          const acc = speakerAccRef.current;
          acc.digits += String(digit);
          if (acc.timer) clearTimeout(acc.timer);
          acc.timer = setTimeout(applySpeaker, 500);
        }
      }
    };

    const handleGlobalSpeakerUp = (e) => {
      if (e.key === "Control" || e.key === "Meta") {
        const acc = speakerAccRef.current;
        if (acc.digits) {
          if (acc.timer) clearTimeout(acc.timer);
          applySpeaker();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalSpeaker);
    window.addEventListener("keyup", handleGlobalSpeakerUp);
    return () => {
      window.removeEventListener("keydown", handleGlobalSpeaker);
      window.removeEventListener("keyup", handleGlobalSpeakerUp);
      if (speakerAccRef.current.timer) clearTimeout(speakerAccRef.current.timer);
    };
  }, [updateSubtitle, isCheckedReadOnly]);

  // Ctrl+F / Cmd+F: 찾기/바꾸기 모달 열기
  useEffect(() => {
    const handleGlobalFind = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowFindReplaceModal(true);
      }
    };
    window.addEventListener("keydown", handleGlobalFind);
    return () => window.removeEventListener("keydown", handleGlobalFind);
  }, []);

  // 중간어 선택 완료
  const handleLanguageSelect = (language) => {
    // TODO: 선택된 언어로 저장 처리
  };

  // 번역 버튼 클릭 핸들러 - 모달 열기
  const handleTranslateClick = useCallback(() => {
    let sourceLang, targetLang, translateSubtitles;
    const baseRole = getBaseRole(role);

    if (baseRole === Role.MID) {
      // 출발어 번역자: [출발어] → [중간어]
      sourceLang = sourceLanguage;
      targetLang = middleLanguage;
      translateSubtitles = subtitles.map((sub) => ({
        id: sub.id,
        sourceText: sub.sourceText, // 번역할 원본 텍스트
        text: sub.text, // 현재 번역된 텍스트 (편집 중)
        startTime: sub.startTime,
        endTime: sub.endTime,
      }));
    } else if (baseRole === Role.FINAL) {
      // 번역자: [중간어] → [도착어] (중간어 없으면 [출발어] → [도착어])
      const useMiddle = hasMiddleTextData;
      sourceLang = useMiddle ? middleLanguage : sourceLanguage;
      targetLang = targetLanguage;
      translateSubtitles = subtitles.map((sub) => ({
        id: sub.id,
        sourceText: useMiddle ? sub.middleText : sub.sourceText,
        text: sub.text,
        startTime: sub.startTime,
        endTime: sub.endTime,
      }));
    } else {
      console.warn("번역 권한이 없습니다.");
      return;
    }

    // 모달 데이터 설정 및 모달 열기
    setTranslateModalData({
      sourceLang,
      targetLang,
      subtitles: translateSubtitles,
    });
    setShowTranslateModal(true);
  }, [role, sourceLanguage, middleLanguage, targetLanguage, subtitles]);

  // Toolbar에서 번역 버튼 클릭 시 트리거 감지
  useEffect(() => {
    if (translateModalTrigger) {
      handleTranslateClick();
      resetTranslateModalTrigger();
    }
  }, [translateModalTrigger, handleTranslateClick, resetTranslateModalTrigger]);

  // 번역 실행 핸들러 (모달에서 호출)
  const handleTranslateStart = useCallback(
    (options) => {
      // 모달에서 변경된 언어 사용 (options에서 전달받음)
      const { sourceLang, targetLang, pipelineMode, workInfo, useContextSplit, splitModel, splitReasoningEffort } = options;
      const { subtitles: translateSubtitles } = translateModalData;

      // 파이프라인 모드에 따라 인라인 데이터 포맷 결정
      const isV2 = pipelineMode === 'v2';
      const inlineSubtitleData = isV2
        ? translateSubtitles
            .map(
              (sub, idx) =>
                `{${idx + 1}}\n${sub.sourceText || sub.text}`,
            )
            .join("\n\n")
        : translateSubtitles
            .map(
              (sub, idx) =>
                `|S|${idx + 1}\n|N|null\n|T|${secondsToTimeCode(sub.startTime)} --> ${secondsToTimeCode(sub.endTime)}\n|M|${sub.sourceText || sub.text}\n|E|`,
            )
            .join("\n\n");

      // translateOptions 설정 (STT와 동일 패턴)
      setTranslateOptions({
        lang: targetLang,
        sourceLang,
        model: options.model,
        chunkSize: options.chunkSize,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        topK: options.topK,
        frequencyPenalty: options.frequencyPenalty,
        presencePenalty: options.presencePenalty,
        concurrency: options.concurrency,
        promptId: options.promptId,
        customPrompt: options.customPrompt,
        testMode: true,
        isPromptTest: false,
        pipelineMode: pipelineMode || 'legacy',
        workInfo,
        useContextSplit,
        splitModel,
        splitReasoningEffort,
        inlineSubtitleData,
      });

      // ConfigModal 닫기 + ProcessModal 열기
      setShowTranslateModal(false);
      setShowTranslateProcess(true);
    },
    [translateModalData],
  );

  // 번역 처리 완료 핸들러
  const handleTranslateComplete = useCallback(
    async (result) => {
      setShowTranslateProcess(false);

      // 번역 결과를 편집 가능한 필드에 적용
      if (result?.translatedSegments && result.translatedSegments.length > 0) {
        const { subtitles: originalSubtitles } = translateModalData;
        const { fileId } = useSubtitleStore.getState();
        const currentRole = useRoleStore.getState().role;

        // 1. 번역 전 현재 자막 상태를 편집 이력에 저장
        const currentSubtitles = useSubtitleStore.getState().subtitles;
        await saveEditHistory(
          currentSubtitles,
          t("subtitle.preBackupAction"),
          { count: originalSubtitles.length },
          fileId,
          currentRole,
        );

        // 2. 대상 자막들의 text를 공백으로 초기화
        originalSubtitles.forEach((sub) => {
          if (sub?.id) {
            updateSubtitle(sub.id, { text: "" });
          }
        });

        // 3. 번역 결과로 덮어쓰기
        let appliedCount = 0;
        result.translatedSegments.forEach((translated, index) => {
          // originalSubtitles와 순서대로 매칭 (번역 요청 시 순서 유지됨)
          const original = originalSubtitles[index];
          if (original?.id && translated?.text) {
            updateSubtitle(original.id, { text: translated.text });
            appliedCount++;
          }
        });

        // 번역 결과 이력 저장
        saveEditHistorySnapshot(t("subtitle.translateApplied"), {
          count: appliedCount,
        });

        // 성공 알림
        toast.success(t("subtitle.translateComplete", { count: appliedCount }));
      }
    },
    [translateModalData, updateSubtitle, saveEditHistorySnapshot],
  );

  // 번역 처리 에러 핸들러
  const handleTranslateError = useCallback(async (error) => {
    console.error("번역 처리 에러:", error);
    setShowTranslateProcess(false);
    toast.error(
      t("subtitle.translateError", { error: error.message || error }),
    );
  }, []);

  // 다중 선택: 마지막으로 단독 토글된 행. Shift+클릭 범위 선택의 기준점.
  const lastCheckAnchorRef = useRef(null);

  // 다중 선택: 체크 토글
  // shiftKey 가 true 이고 직전 단독 토글 행(앵커)이 존재하면 앵커~현재 사이를 일괄 적용.
  // 적용 상태(checked)는 호출자가 결정한 새 상태(= !isChecked) — Gmail/Outlook 와 동일 패턴.
  const handleToggleCheck = useCallback((id, checked, shiftKey = false) => {
    if (
      shiftKey &&
      lastCheckAnchorRef.current &&
      lastCheckAnchorRef.current !== id
    ) {
      const subs = useSubtitleStore.getState().subtitles;
      const aIdx = subs.findIndex((s) => s.id === lastCheckAnchorRef.current);
      const bIdx = subs.findIndex((s) => s.id === id);
      if (aIdx >= 0 && bIdx >= 0) {
        const [start, end] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
        setCheckedIds((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            if (checked) next.add(subs[i].id);
            else next.delete(subs[i].id);
          }
          return next;
        });
        return;
      }
    }
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
    lastCheckAnchorRef.current = id;
  }, []);

  const checkedContextValue = useMemo(
    () => ({
      checkedIds,
      onToggleCheck: handleToggleCheck,
    }),
    [checkedIds, handleToggleCheck],
  );

  // 다중 선택: 전체 선택
  const handleSelectAll = useCallback(() => {
    setCheckedIds(new Set(subtitles.map((s) => s.id)));
  }, [subtitles]);

  // 다중 선택: 일괄 위치 변경
  const handleBulkPositionChange = useCallback(() => {
    checkedIds.forEach((id) => {
      updateSubtitle(id, { position: bulkPosition });
    });
    setCheckedIds(new Set());
  }, [checkedIds, bulkPosition, updateSubtitle]);

  // 다중 선택: 일괄 화자 변경
  const handleBulkSpeakerChange = useCallback(() => {
    const speakerId = bulkSpeakerId === "" ? null : parseInt(bulkSpeakerId, 10);
    checkedIds.forEach((id) => {
      updateSubtitle(id, { speakerId });
    });
    setCheckedIds(new Set());
  }, [checkedIds, bulkSpeakerId, updateSubtitle]);

  const handleSyncShiftKeyDown = useCallback((e) => {
    if (e.key === "Tab") {
      const group = e.target.closest(".bulk-sync-shift-time-group");
      if (!group) return;
      const inputs = [...group.querySelectorAll("input")];
      const idx = inputs.indexOf(e.target);
      if (e.shiftKey) {
        if (idx > 0) {
          e.preventDefault();
          inputs[idx - 1].focus();
          inputs[idx - 1].select();
        }
      } else {
        if (idx < inputs.length - 1) {
          e.preventDefault();
          inputs[idx + 1].focus();
          inputs[idx + 1].select();
        }
      }
    }
  }, []);

  // 다중 선택: 일괄 삭제 (확인 모달 → store bulkDeleteSubtitles)
  const handleBulkDelete = useCallback(async () => {
    if (checkedIds.size === 0) return;
    const count = checkedIds.size;
    const confirmed = await confirm(
      t("subtitle.bulkDeleteConfirmMessage", { count }),
      {
        title: t("subtitle.bulkDeleteConfirmTitle"),
        confirmText: t("common.delete"),
        cancelText: t("common.cancel"),
      },
    );
    if (!confirmed) return;
    const removed = bulkDeleteSubtitles(checkedIds);
    setCheckedIds(new Set());
    lastCheckAnchorRef.current = null;
    if (removed > 0) {
      toast.success(t("subtitle.bulkDeleteSuccess", { count: removed }));
    }
  }, [checkedIds, bulkDeleteSubtitles, t]);

  // 다중 선택: 일괄 싱크 이동
  const handleBulkSyncShift = useCallback(() => {
    const { hh, mm, ss, ms } = bulkSyncShift;
    const totalSec =
      (parseInt(hh, 10) || 0) * 3600 +
      (parseInt(mm, 10) || 0) * 60 +
      (parseInt(ss, 10) || 0) +
      (parseInt(ms, 10) || 0) / 1000;
    const shiftSec = totalSec * bulkSyncDirection;
    if (shiftSec === 0) return;
    bulkNudgeSync(checkedIds, shiftSec);
    setCheckedIds(new Set());
  }, [checkedIds, bulkSyncShift, bulkSyncDirection, bulkNudgeSync]);

  // 시간 이동
  const handleTimeJump = useCallback(
    (targetSeconds) => {
      if (subtitles.length === 0) return;

      // startTime <= target <= endTime 인 자막 찾기
      let target = subtitles.find(
        (s) => s.startTime <= targetSeconds && targetSeconds <= s.endTime,
      );

      // 정확히 포함하는 자막이 없으면 가장 가까운 자막 찾기
      if (!target) {
        target = subtitles.reduce((closest, s) => {
          const dist = Math.min(
            Math.abs(s.startTime - targetSeconds),
            Math.abs(s.endTime - targetSeconds),
          );
          const closestDist = Math.min(
            Math.abs(closest.startTime - targetSeconds),
            Math.abs(closest.endTime - targetSeconds),
          );
          return dist < closestDist ? s : closest;
        });
      }

      if (target) {
        selectSubtitle(target.id, target.startTime, target.endTime);
        // 가상 List 의 imperative API 로 행을 viewport 안으로 가져온 뒤 textarea 포커스.
        const focusTextarea = () => {
          const el = itemRefs.current[target.id];
          const textarea = el?.querySelector?.("textarea");
          if (textarea) textarea.focus();
        };
        const { filteredIndexInList, listApi } = navContextRef.current;
        const idx = filteredIndexInList?.get(target.id);
        if (idx !== undefined && listApi) {
          listApi.scrollToRow({ index: idx, align: "center", behavior: "smooth" });
          requestAnimationFrame(() => requestAnimationFrame(focusTextarea));
        } else {
          setTimeout(focusTextarea, 50);
        }
      }
    },
    [subtitles, selectSubtitle],
  );

  // 새 행 추가 (현재 재생 위치에 자막 생성)
  const handleAddRow = useCallback(() => {
    const currentTime = usePlaybackStore.getState().currentTime;
    const duration = useSubtitleStore.getState().duration;
    const currentSubtitles = useSubtitleStore.getState().subtitles;
    const { general } = useSettingsStore.getState();
    const gap = (general?.minGapMs > 0 ? general.minGapMs : 1) / 1000;
    const defaultDuration = 2;
    const validDuration = duration && duration > 0 ? duration : Infinity;

    let startTime = currentTime;
    if (hasTimeRestriction) {
      startTime = Math.max(startTime, allowedStartSec);
    }

    const sorted = [...currentSubtitles].sort((a, b) => a.startTime - b.startTime);

    // 현재 재생 위치가 기존 자막 안에 있는지 확인
    const overlapping = sorted.find(
      (sub) => startTime >= sub.startTime && startTime < sub.endTime,
    );
    if (overlapping) {
      startTime = overlapping.endTime + gap;
    }

    // startTime 이후 가장 가까운 자막까지의 빈 공간 계산
    let maxEnd = validDuration;
    if (hasTimeRestriction) {
      maxEnd = Math.min(maxEnd, allowedEndSec);
    }
    for (const sub of sorted) {
      if (sub.startTime > startTime + gap) {
        maxEnd = Math.min(maxEnd, sub.startTime - gap);
        break;
      }
    }

    let endTime = Math.min(startTime + defaultDuration, maxEnd);

    const availableSpace = endTime - startTime;
    if (availableSpace < gap * 2) {
      toast.warning(t("subtitle.noSpaceForNewSubtitle"));
      return;
    }

    const newId = addSubtitle({ text: "", startTime, endTime });
    if (newId) {
      selectSubtitle(newId);
    }
  }, [addSubtitle, selectSubtitle, hasTimeRestriction, allowedStartSec, allowedEndSec, t]);

  // Ctrl+Shift+Enter: 자막 행 추가
  useEffect(() => {
    const handleGlobalAddRow = (e) => {
      if (isCheckedReadOnly) return;
      const shortcutId = useShortcutsStore.getState().getShortcutId(e);
      if (shortcutId === "addRow") {
        e.preventDefault();
        handleAddRow();
      }
    };
    window.addEventListener("keydown", handleGlobalAddRow);
    return () => window.removeEventListener("keydown", handleGlobalAddRow);
  }, [handleAddRow, isCheckedReadOnly]);

  // Ctrl+Shift+A: 체크박스 토글
  useEffect(() => {
    const handleGlobalToggleCheck = (e) => {
      if (isCheckedReadOnly) return;
      const shortcutId = useShortcutsStore.getState().getShortcutId(e);
      if (shortcutId === "toggleCheck") {
        e.preventDefault();
        const subId = useSubtitleStore.getState().selectedSubtitleId;
        if (subId) {
          setCheckedIds((prev) => {
            const next = new Set(prev);
            if (next.has(subId)) {
              next.delete(subId);
            } else {
              next.add(subId);
            }
            return next;
          });
        }
      }
    };
    window.addEventListener("keydown", handleGlobalToggleCheck);
    return () => window.removeEventListener("keydown", handleGlobalToggleCheck);
  }, [isCheckedReadOnly]);

  // 화자 선택 상태에서 이전/다음 자막의 speaker-select로 이동
  // 첫/마지막 싱크 경계에서는 반대편으로 순환 이동 (modulo).
  // 가상 리스트(react-window) 가 도착 row 를 unmount 시킨 상태일 수 있어
  // 단순 itemRefs 만 보면 selectEl 이 null 이라 focus 가 실패한다. listApi.scrollToRow
  // 로 먼저 mount 시킨 뒤 다음 프레임에서 focus. (textarea 네비게이션 패턴과 동일)
  const handleSpeakerNav = useCallback((currentId, direction) => {
    const subs = useSubtitleStore.getState().subtitles;
    if (subs.length === 0) return;
    const idx = subs.findIndex((s) => s.id === currentId);
    if (idx < 0) return;
    const len = subs.length;
    const targetIdx = ((idx + direction) % len + len) % len;
    const target = subs[targetIdx];
    selectSubtitle(target.id);
    setSelectedTimeRange({ startTime: target.startTime, endTime: target.endTime, shouldSeek: false });

    const focusSpeakerSelect = () => {
      const itemEl = itemRefs.current[target.id];
      const selectEl = itemEl?.querySelector(".speaker-select");
      if (selectEl) {
        selectEl.focus();
      }
    };
    const { filteredIndexInList, listApi } = navContextRef.current;
    const rowIdx = filteredIndexInList?.get(target.id);
    if (rowIdx !== undefined && listApi) {
      listApi.scrollToRow({ index: rowIdx, align: "auto", behavior: "auto" });
      requestAnimationFrame(() => requestAnimationFrame(focusSpeakerSelect));
    } else {
      setTimeout(focusSpeakerSelect, 50);
    }
  }, [selectSubtitle, setSelectedTimeRange]);

  // Ctrl+F1: 화자 드롭다운 열기
  useEffect(() => {
    const handleGlobalSelectSpeaker = (e) => {
      if (isCheckedReadOnly) return;
      const shortcutId = useShortcutsStore.getState().getShortcutId(e);
      if (shortcutId !== "selectSpeaker") return;
      e.preventDefault();
      const subId = useSubtitleStore.getState().selectedSubtitleId;
      if (!subId) return;

      const tryOpen = () => {
        const dropdown = speakerDropdownRefs.current[subId];
        if (dropdown) {
          dropdown.open();
          return true;
        }
        return false;
      };

      // 이미 mount 된 경우 즉시 열기
      if (tryOpen()) return;

      // 가상 리스트 viewport 밖 → 행을 우선 스크롤한 뒤 다음 프레임에서 재시도
      const { filteredIndexInList, listApi } = navContextRef.current;
      const rowIdx = filteredIndexInList?.get(subId);
      if (rowIdx !== undefined && listApi) {
        listApi.scrollToRow({ index: rowIdx, align: "auto", behavior: "auto" });
        requestAnimationFrame(() => requestAnimationFrame(tryOpen));
      }
    };
    window.addEventListener("keydown", handleGlobalSelectSpeaker);
    return () => window.removeEventListener("keydown", handleGlobalSelectSpeaker);
  }, [isCheckedReadOnly]);

  // 가져오기 버튼 클릭
  const handleImportClick = () => {
    setModalState({ isOpen: true, mode: "import" });
  };

  // 내보내기 버튼 클릭
  const handleExportClick = () => {
    setModalState({ isOpen: true, mode: "export" });
  };

  // 모달 닫기
  const handleModalClose = () => {
    setModalState({ isOpen: false, mode: null });
    setSelectedFormat(null);
    setSelectedTargetField("text");
  };

  // 포맷 선택 처리 (format: 포맷 객체, targetField: 'text' | 'sourceText' | 'middleText')
  const handleFormatSelect = (format, targetField = "text", encoding = "utf-8", options = {}) => {
    if (modalState.mode === "import") {
      setSelectedFormat(format);
      setSelectedTargetField(targetField);
      setModalState({ isOpen: false, mode: null });

      if (importInputRef.current) {
        importInputRef.current.accept = format.extension;
        importInputRef.current.click();
      }
    } else {
      handleExport(format, targetField, encoding, options);
      handleModalClose();
    }
  };

  // 파일 가져오기 처리
  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 기존 자막이 있으면 사용자에게 확인
    if (subtitles.length > 0) {
      const baseRole = getBaseRole(role);
      const isMergeCandidate =
        baseRole === Role.MID || baseRole === Role.FINAL;

      const FIELD_LABEL_KEY = {
        text: baseRole === Role.MID ? "common.middleLanguage" : "common.targetLanguage",
        sourceText: "common.sourceLanguage",
        middleText: "common.middleLanguage",
      };
      const fieldLabel = t(FIELD_LABEL_KEY[selectedTargetField] || "common.targetLanguage");

      const confirmMessage = isMergeCandidate
        ? t("subtitle.importMergeConfirm", { fieldName: fieldLabel, count: subtitles.length })
        : t("subtitle.importConfirm", { count: subtitles.length });

      const confirmed = await confirm(confirmMessage, {
        title: t("subtitle.importConfirmTitle"),
        confirmText: t("subtitle.importConfirmButton"),
        cancelText: t("common.cancel"),
      });
      if (!confirmed) {
        e.target.value = "";
        return;
      }
    }

    const fileName = file.name.toLowerCase();

    // SMI 파일은 EUC-KR 인코딩일 가능성이 높음
    const isSmiFile = fileName.endsWith(".smi") || fileName.endsWith(".sami");

    const readFileWithFallback = (f, primary, fallback) => {
      return new Promise((resolve) => {
        const r = new FileReader();
        r.onload = (evt) => {
          const text = evt.target.result;
          if (text.includes("\uFFFD") && fallback) {
            const r2 = new FileReader();
            r2.onload = (evt2) => resolve(evt2.target.result);
            r2.readAsText(f, fallback);
          } else {
            resolve(text);
          }
        };
        r.readAsText(f, primary);
      });
    };

    const content = isSmiFile
      ? await readFileWithFallback(file, "euc-kr", "utf-8")
      : await readFileWithFallback(file, "utf-8", "euc-kr");

    let success = false;
    let parsedSubtitles = null;
    let isJson = false;

    if (
      fileName.endsWith(".dfxp") ||
      fileName.endsWith(".ttml") ||
      fileName.endsWith(".xml")
    ) {
      parsedSubtitles = parseDFXP(content);
    } else if (fileName.endsWith(".smi") || fileName.endsWith(".sami")) {
      parsedSubtitles = parseSMI(content);
    } else if (fileName.endsWith(".srt")) {
      parsedSubtitles = parseSRT(content);
    } else if (fileName.endsWith(".vtt")) {
      parsedSubtitles = parseVTT(content);
    } else if (fileName.endsWith(".json")) {
      isJson = true;
    } else {
      if (selectedFormat?.id === "dfxp") {
        parsedSubtitles = parseDFXP(content);
      } else if (selectedFormat?.id === "smi") {
        parsedSubtitles = parseSMI(content);
      } else if (selectedFormat?.id === "srt") {
        parsedSubtitles = parseSRT(content);
      } else {
        isJson = true;
      }
    }

    if (isJson) {
      const result = importFromJson(content, role, selectedTargetField);
      if (!result.success && result.reason === "permission_denied") {
        const filePermName =
          t(ROLE_INFO[result.filePermission]?.nameKey) || result.filePermission;
        toast.warning(t("subtitle.permissionDenied", { filePermName }));
        e.target.value = "";
        return;
      }
      success = result.success;
    }

    if (parsedSubtitles && parsedSubtitles.length > 0) {
      const currentSubtitles = useSubtitleStore.getState().subtitles;
      const baseRole = getBaseRole(role);
      const isMergeMode = currentSubtitles.length > 0 &&
        (baseRole === Role.MID || baseRole === Role.FINAL);

      if (isMergeMode) {
        mergeSubtitleField(parsedSubtitles, selectedTargetField);
        if (parsedSubtitles.length !== currentSubtitles.length) {
          toast.warning(
            t("subtitle.importCountMismatch", {
              imported: parsedSubtitles.length,
              existing: currentSubtitles.length,
            }),
          );
        }
      } else {
        if (selectedTargetField !== "text") {
          parsedSubtitles = parsedSubtitles.map((sub) => ({
            ...sub,
            [selectedTargetField]: sub.text,
            text: "",
          }));
        }
        const currentFileId = useSubtitleStore.getState().fileId;
        clearSubtitles();
        if (currentFileId) {
          setFileId(currentFileId);
        }
        parsedSubtitles.forEach((sub) => addSubtitle(sub, false));
      }
      success = true;
    }

    if (success) {
      setSubtitleFileName(file.name);
      toast.success(t("subtitle.importSuccess"));
    } else {
      toast.error(t("subtitle.parseFailed"));
    }

    e.target.value = "";
    setSelectedFormat(null);
    setSelectedTargetField("text");
  };

  // 내보내기 처리 (targetField: 비-JSON 포맷에서 내보낼 자막 영역 필드)
  const handleExport = async (format, targetField = "text", encoding = "utf-8", options = {}) => {
    if (subtitles.length === 0) {
      toast.warning(t("subtitle.noSubtitlesToExport"));
      return;
    }

    let content = "";
    let mimeType = format.mimeType;
    let extension = format.extension;

    const title = mediaFileName
      ? mediaFileName.replace(/\.[^/.]+$/, "")
      : "SoriBaro_Subtitles";

    // 비-JSON 포맷: 선택된 영역 필드를 text로 매핑
    let mappedSubtitles =
      targetField !== "text"
        ? subtitles.map((sub) => ({ ...sub, text: sub[targetField] || "" }))
        : subtitles;

    // 내보내기 텍스트 검증: 연속 띄어쓰기를 하나로 축소
    mappedSubtitles = mappedSubtitles.map((sub) => ({
      ...sub,
      text: (sub.text || "").replace(/ {2,}/g, " "),
    }));

    // position OFF: 자막 위치 정보 제거
    if (options.includePosition === false) {
      mappedSubtitles = mappedSubtitles.map((sub) => ({ ...sub, position: 'bottomCenter' }));
    }

    const FIELD_TO_LANG = {
      text: targetLanguage,
      sourceText: sourceLanguage,
      middleText: middleLanguage,
    };
    const exportLangCode = FIELD_TO_LANG[targetField] || "ko";

    switch (format.id) {
      case "json":
        content = exportToJson(role);
        break;
      case "dfxp":
        content = exportToDFXP(mappedSubtitles, title, exportLangCode);
        break;
      case "smi":
        content = exportToSMI(mappedSubtitles, title, exportLangCode, { includeTags: true, includeNbsp: options.includeNbsp !== false });
        break;
      case "smi-notag":
        content = exportToSMI(mappedSubtitles, title, exportLangCode, { includeTags: false, includeNbsp: options.includeNbsp !== false });
        extension = ".smi";
        break;
      case "srt":
        content = exportToSRT(mappedSubtitles);
        break;
      case "srt-noblank":
        content = exportToSRT(mappedSubtitles, { skipEmpty: true });
        extension = ".srt";
        break;
      case "vtt":
        content = exportToVTT(mappedSubtitles);
        break;
      case "txt":
        content = mappedSubtitles.map((sub) => sub.text || "").join("\n\n");
        break;
      case "txt-noblank":
        content = mappedSubtitles
          .map((sub) => (sub.text || "").replace(/\n/g, " "))
          .join(" ")
          .replace(/ {2,}/g, " ")
          .trim();
        extension = ".txt";
        break;
      default:
        toast.error(t("subtitle.unsupportedFormat"));
        return;
    }

    // 권한별 내보내기 파일명 라벨
    const ROLE_EXPORT_LABEL = {
      [Role.START]: t("subtitle.roleEditing"),
      [Role.MID]: t("subtitle.roleMiddleTranslation"),
      [Role.FINAL]: t("subtitle.roleTargetTranslation"),
    };
    const FIELD_LABEL = {
      text: "",
      sourceText: `_${t("common.sourceLanguage")}`,
      middleText: `_${t("common.middleLanguage")}`,
    };
    const baseRole = getBaseRole(role);
    const roleLabel = ROLE_EXPORT_LABEL[baseRole] || t("subtitle.subtitle");
    const fieldLabel = FIELD_LABEL[targetField] || "";
    const exportFileName = `${title}${extension}`;

    const blob = createEncodedBlob(content, mimeType, encoding, ({ uniqueChars, count }) => {
      const preview = uniqueChars.slice(0, 20).join(' ');
      const suffix = uniqueChars.length > 20 ? ' …' : '';
      toast.warning(t("subtitle.ansiLossyExport", { count, chars: preview + suffix }));
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 선택된 자막이 변경되면 스크롤 및 포커스.
  // 가상 List 환경에서는 viewport 밖 자막의 itemRef 가 비어 있을 수 있으므로,
  // 우선 List 의 scrollToRow 로 행을 viewport 안으로 가져온 뒤 포커스를 시도한다.
  // 찾기/바꾸기·코멘트 모아보기·시간 점프 등에서 viewport 밖 자막을 선택할 때 회귀 방지.
  useEffect(() => {
    if (!selectedSubtitleId) return;
    const focusTextareaIfNeeded = () => {
      // 찾기/바꾸기 모달 input 에서 타이핑 중이면 textarea 포커스 탈취 금지.
      // (검색 결과 클릭으로 selectedSubtitleId 가 바뀌면 자막은 선택/스크롤만 하고
      //  포커스는 모달 input 에 유지)
      if (isFindReplaceModalActive()) return;
      const itemElement = itemRefs.current[selectedSubtitleId];
      if (!itemElement) return;
      const focused = document.activeElement;
      if (focused?.classList?.contains("speaker-select")) return;
      const textarea = itemElement.querySelector("textarea");
      if (textarea) textarea.focus();
    };

    if (itemRefs.current[selectedSubtitleId]) {
      // 이미 viewport 안 → 가벼운 scrollIntoView (block: nearest 라 보일 때 jitter 없음)
      itemRefs.current[selectedSubtitleId].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      setTimeout(focusTextareaIfNeeded, 50);
      return;
    }
    // viewport 밖 → List 의 imperative API 로 행을 가져와 mount 시킨 다음 포커스 시도
    const { filteredIndexInList, listApi } = navContextRef.current;
    const idx = filteredIndexInList?.get(selectedSubtitleId);
    if (idx !== undefined && listApi) {
      listApi.scrollToRow({ index: idx, align: "auto", behavior: "smooth" });
      requestAnimationFrame(() =>
        requestAnimationFrame(focusTextareaIfNeeded),
      );
    }
  }, [selectedSubtitleId]);

  // 재생 중일 때 활성 자막으로 자동 스크롤 (imperative 구독 - SubtitleList 리렌더 방지)
  // 가상화 환경에서는 viewport 밖 행이 mount 되어 있지 않으므로 List 의 scrollToRow 를 사용한다.
  useEffect(() => {
    const unsubscribe = usePlaybackStore.subscribe((state) => {
      const { currentTime, isPlaying } = state;
      const subs = useSubtitleStore.getState().subtitles;
      const active = subs.find(
        (sub) => currentTime >= sub.startTime && currentTime <= sub.endTime,
      );
      const newActiveId = active?.id || null;

      if (newActiveId === activeSubtitleIdRef.current) return;
      activeSubtitleIdRef.current = newActiveId;

      if (!autoScroll || !isPlaying) return;
      const isTextEditing =
        document.activeElement?.tagName === "TEXTAREA";
      if (isTextEditing) return;
      // 화자 선택 드롭다운이 열려 있는 동안에는 자동 스크롤로 행이 이동해
      // 사용자가 보던 행이 viewport 밖으로 밀려나는 문제 방지.
      if (document.querySelector(".speaker-dropdown-list")) return;

      if (!newActiveId) return;
      const { filteredIndexInList, listApi } = navContextRef.current;
      if (!listApi || !filteredIndexInList) return;
      const indexInVirtualList = filteredIndexInList.get(newActiveId);
      if (indexInVirtualList === undefined) return;
      // align: "auto" 는 행이 이미 보이면 스크롤하지 않으므로 viewport 안일 때 jitter 없음.
      listApi.scrollToRow({
        index: indexInVirtualList,
        align: "auto",
        behavior: "smooth",
      });
    });
    return unsubscribe;
  }, [autoScroll]);

  // 핸들러 함수들
  const handleSelect = useCallback(
    (id, startTime, endTime, shouldSeek = true) => {
      selectSubtitle(id);
      setSelectedTimeRange({
        startTime,
        endTime,
        shouldSeek,
      });

      if (shouldSeek && mediaRef.current) {
        mediaRef.current.currentTime = startTime;
      }

      // 인라인 편집 모드 종료 (다른 자막 선택 시)
      setInlineEditingId(null);
    },
    [selectSubtitle, setSelectedTimeRange, mediaRef],
  );

  // 아웃 싱크 입력 (현재 자막 뒤에 빈 자막 추가)
  const handleOutSync = useCallback(
    (currentSubtitleId) => {
      const currentSubtitles = useSubtitleStore.getState().subtitles;
      const duration = useSubtitleStore.getState().duration;
      const gap = 0.001;
      const defaultDuration = 2;
      const validDuration = duration && duration > 0 ? duration : Infinity;

      const current = currentSubtitles.find((s) => s.id === currentSubtitleId);
      if (!current) return;

      const sorted = [...currentSubtitles].sort((a, b) => a.startTime - b.startTime);

      let startTime = current.endTime + gap;

      let maxEnd = validDuration;
      if (hasTimeRestriction) {
        maxEnd = Math.min(maxEnd, allowedEndSec);
      }
      for (const sub of sorted) {
        if (sub.startTime > current.endTime + gap) {
          maxEnd = Math.min(maxEnd, sub.startTime - gap);
          break;
        }
      }

      let endTime = Math.min(startTime + defaultDuration, maxEnd);
      const availableSpace = endTime - startTime;
      if (availableSpace < gap * 2) {
        toast.warning(t("subtitle.noSpaceForNewSubtitle"));
        return;
      }

      const newId = addSubtitle({ text: "", startTime, endTime });
      if (newId) {
        setInlineEditingId({ id: newId, cursor: 0 });
        setTimeout(() => {
          const updatedSubtitles = useSubtitleStore.getState().subtitles;
          const newSubtitle = updatedSubtitles.find((s) => s.id === newId);
          if (newSubtitle) {
            handleSelect(newId, newSubtitle.startTime, newSubtitle.endTime);
          }
        }, 10);
      }
    },
    [addSubtitle, handleSelect, hasTimeRestriction, allowedEndSec, t],
  );

  const handleSelectNoSeek = useCallback(
    (id, startTime, endTime) => {
      handleSelect(id, startTime, endTime, false);
    },
    [handleSelect],
  );

  useEffect(() => {
    if (!loopInfo) return;
    const current = subtitles.find((s) => s.id === loopInfo.subtitleId);
    if (!current) {
      setLoopInfo(null);
      return;
    }
    if (
      current.startTime !== loopInfo.start ||
      current.endTime !== loopInfo.end
    ) {
      setLoopInfo({
        ...loopInfo,
        start: current.startTime,
        end: current.endTime,
      });
    }
  }, [loopInfo, subtitles]);

  useEffect(() => {
    if (!loopInfo || !mediaRef.current) return;
    if (loopInfo.end <= loopInfo.start) return;
    const media = mediaRef.current;
    const handleTimeUpdate = () => {
      if (media.currentTime >= loopInfo.end - 0.02) {
        media.currentTime = loopInfo.start;
      }
    };
    media.addEventListener("timeupdate", handleTimeUpdate);
    return () => media.removeEventListener("timeupdate", handleTimeUpdate);
  }, [loopInfo, mediaRef]);

  // 네비게이션 쓰로틀 (key repeat에 의한 무한 순회 방지)
  const navThrottleRef = useRef(0);
  const NAV_THROTTLE_MS = 120;

  // 인라인 편집 네비게이션: 이전 자막으로 이동
  const handleNavigatePrev = useCallback(
    (currentId, cursorPos) => {
      const now = Date.now();
      if (now - navThrottleRef.current < NAV_THROTTLE_MS) return;
      navThrottleRef.current = now;
      const currentSubtitles = useSubtitleStore.getState().subtitles;
      const currentIndex = currentSubtitles.findIndex((s) => s.id === currentId);
      if (currentIndex > 0) {
        const prevSubtitle = currentSubtitles[currentIndex - 1];
        handleSelectNoSeek(
          prevSubtitle.id,
          prevSubtitle.startTime,
          prevSubtitle.endTime,
        );
        setInlineEditingId(prevSubtitle.id);
        focusSubtitleTextarea(prevSubtitle.id, cursorPos);
      }
    },
    [handleSelectNoSeek, focusSubtitleTextarea],
  );

  // 인라인 편집 네비게이션: 다음 자막으로 이동
  const handleNavigateNext = useCallback(
    (currentId, cursorPos) => {
      const now = Date.now();
      if (now - navThrottleRef.current < NAV_THROTTLE_MS) return;
      navThrottleRef.current = now;
      const currentSubtitles = useSubtitleStore.getState().subtitles;
      const currentIndex = currentSubtitles.findIndex((s) => s.id === currentId);
      if (currentIndex < currentSubtitles.length - 1) {
        const nextSubtitle = currentSubtitles[currentIndex + 1];
        handleSelectNoSeek(
          nextSubtitle.id,
          nextSubtitle.startTime,
          nextSubtitle.endTime,
        );
        setInlineEditingId(nextSubtitle.id);
        focusSubtitleTextarea(nextSubtitle.id, cursorPos);
      }
    },
    [handleSelectNoSeek, focusSubtitleTextarea],
  );

  // 가상화 환경에서 행 mount 를 보장하고 포커스를 시도하는 헬퍼.
  const focusRowAfterRender = useCallback(
    (subtitleId) => {
      const tryFocus = () => {
        itemRefs.current[subtitleId]?.focus?.();
      };
      if (itemRefs.current[subtitleId]) {
        setTimeout(tryFocus, 0);
        return;
      }
      const { filteredIndexInList, listApi } = navContextRef.current;
      const idx = filteredIndexInList?.get(subtitleId);
      if (idx !== undefined && listApi) {
        listApi.scrollToRow({ index: idx, align: "auto", behavior: "instant" });
        requestAnimationFrame(() => requestAnimationFrame(tryFocus));
      } else {
        setTimeout(tryFocus, 0);
      }
    },
    [],
  );

  // 싱크 라인 이동 (편집 모드 없이): 이전 자막
  const handleMoveToPrevSync = useCallback(
    (currentId) => {
      const now = Date.now();
      if (now - navThrottleRef.current < NAV_THROTTLE_MS) return;
      navThrottleRef.current = now;
      const currentSubtitles = useSubtitleStore.getState().subtitles;
      const currentIndex = currentSubtitles.findIndex((s) => s.id === currentId);
      if (currentIndex > 0) {
        const prevSubtitle = currentSubtitles[currentIndex - 1];
        handleSelect(
          prevSubtitle.id,
          prevSubtitle.startTime,
          prevSubtitle.endTime,
        );
        focusRowAfterRender(prevSubtitle.id);
      }
    },
    [handleSelect, focusRowAfterRender],
  );

  // 싱크 라인 이동 (편집 모드 없이): 다음 자막
  const handleMoveToNextSync = useCallback(
    (currentId) => {
      const now = Date.now();
      if (now - navThrottleRef.current < NAV_THROTTLE_MS) return;
      navThrottleRef.current = now;
      const currentSubtitles = useSubtitleStore.getState().subtitles;
      const currentIndex = currentSubtitles.findIndex((s) => s.id === currentId);
      if (currentIndex < currentSubtitles.length - 1) {
        const nextSubtitle = currentSubtitles[currentIndex + 1];
        handleSelect(
          nextSubtitle.id,
          nextSubtitle.startTime,
          nextSubtitle.endTime,
        );
        focusRowAfterRender(nextSubtitle.id);
      }
    },
    [handleSelect, focusRowAfterRender],
  );

  // 화자 선택 모달 열기 (F1)
  const handleOpenSpeakerSelect = useCallback(
    (subtitleId, currentSpeakerId) => {
      setSpeakerSelectModal({
        isOpen: true,
        subtitleId,
        currentSpeaker: currentSpeakerId ?? null,
      });
    },
    [],
  );

  // 화자 선택 완료 핸들러
  const handleSpeakerSelect = useCallback(
    (speakerNumber) => {
      const { subtitleId } = speakerSelectModal;
      if (subtitleId) {
        updateSubtitle(subtitleId, { speakerId: speakerNumber });
      }
    },
    [speakerSelectModal, updateSubtitle],
  );

  // 화자 선택 모달 닫기
  const handleCloseSpeakerSelect = useCallback(() => {
    setSpeakerSelectModal({
      isOpen: false,
      subtitleId: null,
      currentSpeaker: null,
    });
  }, []);

  // 이전 자막과 합치기 (Ctrl + ↑)
  const handleMergeWithPrevious = useCallback(
    (currentId) => {
      const mergedId = mergeWithPrevious(currentId);
      if (mergedId) {
        // 합쳐진 자막으로 이동 및 인라인 편집 활성화
        const mergedSubtitle = subtitles.find((s) => s.id === mergedId);
        if (mergedSubtitle) {
          handleSelect(
            mergedId,
            mergedSubtitle.startTime,
            mergedSubtitle.endTime,
          );
        }
        setInlineEditingId(mergedId);
        focusSubtitleTextarea(mergedId);
      }
    },
    [mergeWithPrevious, subtitles, handleSelect, focusSubtitleTextarea],
  );

  // 다음 자막과 합치기 (Ctrl + ↓)
  const handleMergeWithNext = useCallback(
    (currentId) => {
      const mergedId = mergeWithNext(currentId);
      if (mergedId) {
        const mergedSubtitle = subtitles.find((s) => s.id === mergedId);
        if (mergedSubtitle) {
          handleSelect(
            mergedId,
            mergedSubtitle.startTime,
            mergedSubtitle.endTime,
          );
        }
        setInlineEditingId(mergedId);
        focusSubtitleTextarea(mergedId);
      }
    },
    [mergeWithNext, subtitles, handleSelect, focusSubtitleTextarea],
  );

  // 자막 나누기 (Shift + Enter)
  const handleSplitSubtitle = useCallback(
    (currentId, cursorPos, currentText) => {
      const newId = splitSubtitle(currentId, cursorPos, currentText);
      if (newId) {
        setInlineEditingId({ id: newId, cursor: 0 });

        setTimeout(() => {
          const updatedSubtitles = useSubtitleStore.getState().subtitles;
          const newSubtitle = updatedSubtitles.find((s) => s.id === newId);
          if (newSubtitle) {
            handleSelectNoSeek(
              newId,
              newSubtitle.startTime,
              newSubtitle.endTime,
            );
          }
        }, 10);
      }
    },
    [splitSubtitle, handleSelectNoSeek],
  );

  // 싱크 삭제 후 다음 싱크로 포커스 이동 (Shift + Backspace)
  const handleDeleteSubtitle = useCallback(
    (currentId) => {
      const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
      const currentIndex = sorted.findIndex((s) => s.id === currentId);

      const nextSubtitle = sorted[currentIndex + 1] || sorted[currentIndex - 1];

      deleteSubtitle(currentId);

      if (nextSubtitle) {
        setInlineEditingId(nextSubtitle.id);
        handleSelect(
          nextSubtitle.id,
          nextSubtitle.startTime,
          nextSubtitle.endTime,
        );
        focusSubtitleTextarea(nextSubtitle.id, 0);
      }
    },
    [subtitles, deleteSubtitle, handleSelect, focusSubtitleTextarea],
  );

  // === 자막 카드 우클릭 컨텍스트 메뉴 ===
  // 우클릭 시 메뉴 위치와 대상 자막 ID 저장. 뷰포트 경계에서 메뉴가 잘리지
  // 않도록 간단한 clamping 적용.
  const handleCardContextMenu = useCallback((e, subtitleId) => {
    if (isCheckedReadOnly) return;
    const MENU_WIDTH = 200;
    const MENU_HEIGHT = 220;
    const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8);
    const y = Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - 8);
    setCardContextMenu({ x, y, subtitleId });
  }, [isCheckedReadOnly]);

  const closeCardContextMenu = useCallback(() => {
    setCardContextMenu(null);
  }, []);

  // 메뉴 열려 있는 동안 ESC로 닫기, 리스트 스크롤 시 닫기
  useEffect(() => {
    if (!cardContextMenu) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setCardContextMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    // 가상 List 의 outer element 가 실제 scroll 컨테이너.
    const container = listImperativeRef?.element || listContentRef.current;
    const onScroll = () => setCardContextMenu(null);
    if (container) {
      container.addEventListener("scroll", onScroll, { passive: true });
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      if (container) container.removeEventListener("scroll", onScroll);
    };
  }, [cardContextMenu, listImperativeRef]);

  // 컨텍스트 메뉴 액션들.
  // 싱크 삽입은 기존 Ctrl+Shift+Enter 로직(handleAddRow) 그대로 사용 →
  // 재생 헤드 기준으로 빈 싱크 생성.
  const handleCtxInsert = useCallback(() => {
    handleAddRow();
    setCardContextMenu(null);
  }, [handleAddRow]);

  // 싱크 분할: 대상 자막 범위 내에 playhead가 있으면 그 시점, 아니면 중간점.
  const handleCtxSplit = useCallback(() => {
    if (!cardContextMenu) return;
    const { subtitleId } = cardContextMenu;
    const allSubs = useSubtitleStore.getState().subtitles;
    const sub = allSubs.find((s) => s.id === subtitleId);
    if (!sub) { setCardContextMenu(null); return; }
    const currentTime = usePlaybackStore.getState().currentTime;
    const { general } = useSettingsStore.getState();
    const minGap = (general?.minGapMs > 0 ? general.minGapMs : 0) / 1000;
    let splitTime;
    if (
      currentTime > sub.startTime + minGap &&
      currentTime < sub.endTime - minGap
    ) {
      splitTime = currentTime;
    } else {
      splitTime = (sub.startTime + sub.endTime) / 2;
    }
    splitSubtitleAtTime(subtitleId, splitTime);
    setCardContextMenu(null);
  }, [cardContextMenu, splitSubtitleAtTime]);

  const handleCtxMergePrev = useCallback(() => {
    if (!cardContextMenu) return;
    mergeWithPrevious(cardContextMenu.subtitleId);
    setCardContextMenu(null);
  }, [cardContextMenu, mergeWithPrevious]);

  const handleCtxMergeNext = useCallback(() => {
    if (!cardContextMenu) return;
    mergeWithNext(cardContextMenu.subtitleId);
    setCardContextMenu(null);
  }, [cardContextMenu, mergeWithNext]);

  const handleCtxDelete = useCallback(() => {
    if (!cardContextMenu) return;
    handleDeleteSubtitle(cardContextMenu.subtitleId);
    setCardContextMenu(null);
  }, [cardContextMenu, handleDeleteSubtitle]);

  // 컨텍스트 메뉴 대상 자막의 이전/다음 존재 여부 (병합 버튼 활성화 판단용)
  const ctxMergeAvailability = useMemo(() => {
    if (!cardContextMenu) return { hasPrev: false, hasNext: false };
    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((s) => s.id === cardContextMenu.subtitleId);
    return { hasPrev: idx > 0, hasNext: idx >= 0 && idx < sorted.length - 1 };
  }, [cardContextMenu, subtitles]);

  // 자막 간격 메우기 적용
  const handleGapFill = useCallback((adjustments) => {
    batchUpdateEndTimes(adjustments);
  }, [batchUpdateEndTimes]);

  // 커서 앞 텍스트를 이전 자막으로 이동 (Shift + ↑)
  const handleMoveTextToPrev = useCallback(
    (currentId, cursorPos) => {
      const result = moveTextToPrevSubtitle(currentId, cursorPos);
      if (result) {
        setInlineEditingId(result.currentId);
        focusSubtitleTextarea(result.currentId, 0);
      }
    },
    [moveTextToPrevSubtitle, focusSubtitleTextarea],
  );

  // 커서 뒤 텍스트를 다음 자막으로 이동 (Shift + ↓)
  const handleMoveTextToNext = useCallback(
    (currentId, cursorPos) => {
      const result = moveTextToNextSubtitle(currentId, cursorPos);
      if (result) {
        setInlineEditingId(result.currentId);
        focusSubtitleTextarea(result.currentId);
      }
    },
    [moveTextToNextSubtitle, focusSubtitleTextarea],
  );

  // 자막 편집 설정 CSS 변수
  const editorStyle = useMemo(
    () => ({
      "--subtitle-font-family": "'Noto Sans Mono', 'JetBrains Mono', monospace",
      "--subtitle-font-size": `${subtitleEditor?.fontSize || 13}px`,
      "--guideline-position": `${maxSegmentLength}ch`,
      "--guideline-color":
        subtitleEditor?.guidelineColor || "rgba(255, 100, 100, 0.4)",
      "--guideline-display": maxSegmentLength > 0 ? "block" : "none",
    }),
    [subtitleEditor, maxSegmentLength],
  );

  return (
    <div className="subtitle-list" style={editorStyle} ref={subtitleListRef}>
      {/* 가져오기/내보내기/이력 버튼 */}
      <div className="subtitle-list-toolbar">
        <input
          ref={importInputRef}
          type="file"
          accept=".json,.dfxp,.ttml,.xml,.smi,.sami,.srt,.vtt"
          onChange={handleImportFile}
          style={{ display: "none" }}
        />
        {isServerMode && isWorkChecked && (
          <span className="subtitle-checked-label">
            {t("subtitle.checkedLabel")}
          </span>
        )}
        {(isServerMode || isTrainingAnswer || isTrainingStudent) && !isCheckedReadOnly && (
          <button
            onClick={() => handleSaveClick(false)}
            className="subtitle-btn save"
            disabled={
              isSaving
              || (isTrainingStudent && trainingStudentSubmitted)
              || (!isTrainingAnswer && !isTrainingStudent && !fileId && !isMergeMode)
            }
          >
            {isSaving ? (
              <>
                <span className="btn-spinner"></span>
                {t("subtitle.savingButton")}
              </>
            ) : (
              t("subtitle.saveButton")
            )}
          </button>
        )}

        {/* 연수 STUDENT — 제출 버튼만 노출. 채점 결과는 수강생에게 보여주지 않는다. */}
        {isTrainingStudent && !trainingStudentSubmitted && (
          <button
            onClick={requestTrainingSubmit}
            className="subtitle-btn submit"
            disabled={isSaving}
          >
            {t("training.submit.button", { ns: "common" })}
          </button>
        )}
        {isServerMode && isMergeMode && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  t(
                    "enterprise.mergeReviewRefetchConfirm",
                    {
                      ns: "soribaro",
                      defaultValue:
                        "저장된 병합 자막을 무시하고 각 파일의 최신 검수완료(REVIEW_DONE) 자막으로 다시 불러옵니다. 현재 편집 내용은 사라집니다. 계속하시겠습니까?",
                    },
                  ),
                )
              ) {
                loadSubtitlesFromServer({ skipCache: true });
              }
            }}
            className="subtitle-btn import"
            disabled={isSaving || isLoadingSubtitles}
            title={t("enterprise.mergeReviewRefetchTooltip", {
              ns: "soribaro",
              defaultValue: "원본 파일에서 다시 병합",
            })}
          >
            {t("enterprise.mergeReviewRefetch", {
              ns: "soribaro",
              defaultValue: "재조회",
            })}
          </button>
        )}
        {isServerMode && !isCheckedReadOnly && !isMergeMode && !isReviewer(role) && (
          <button
            onClick={handleWorkerSubmitClick}
            className="subtitle-btn submit"
            disabled={isSaving || !fileId}
          >
            {t("subtitle.submitButton")}
          </button>
        )}
        {isServerMode && !isCheckedReadOnly && !isMergeMode && isReviewer(role) && (
          <button
            onClick={handleSubmitClick}
            className="subtitle-btn submit"
            disabled={isSaving || !fileId}
          >
            {t("subtitle.reviewCompleteButton")}
          </button>
        )}
        {isServerMode && !isCheckedReadOnly && !isMergeMode && isReviewer(role) && (
          <button
            onClick={() => handleSaveClick(true)}
            className="subtitle-btn reject"
            disabled={isSaving || !fileId}
          >
            {t("subtitle.rejectButton")}
          </button>
        )}
        {!isCheckedReadOnly && (
          <>
            {projectFileStatus === "WORKING" && (
              <button onClick={handleResetSubtitles} className="subtitle-btn reset">
                {t("subtitle.resetSubtitles")}
              </button>
            )}
            <button onClick={handleImportClick} className="subtitle-btn import">
              {t("subtitle.importButton")}
            </button>
          </>
        )}
        <button onClick={handleExportClick} className="subtitle-btn export">
          {t("subtitle.exportButton")}
        </button>
        {!isCheckedReadOnly && (
          <>
            {toolbarVisibility.history && (
              <button
                onClick={() => setShowHistoryModal(true)}
                className="subtitle-btn history"
              >
                {t("subtitle.editHistory")}
              </button>
            )}
            {toolbarVisibility.accuracy && isServerMode && isReviewer(role) && (
              <button
                onClick={() => setShowAccuracyModal(true)}
                className="subtitle-btn accuracy"
                disabled={!urlProjectFileId}
              >
                {t("subtitle.accuracy")}
              </button>
            )}
            {toolbarVisibility.aiQc && (
              <button
                onClick={() => setShowAiQcPanel((v) => !v)}
                className={`subtitle-btn ai-qc${showAiQcPanel ? " active" : ""}`}
              >
                AI QC
              </button>
            )}
            {toolbarVisibility.netflixQc && (
              <button onClick={openNetflixQC} className="subtitle-btn netflix-qc">
                Netflix QC
              </button>
            )}
            {toolbarVisibility.speaker && (
              <button
                onClick={() => setShowSpeakerModal(true)}
                className="subtitle-btn speaker"
              >
                {t("subtitle.speakerManage")}
              </button>
            )}
            {toolbarVisibility.boilerplate && (
              <button
                onClick={() => setShowBoilerplateModal(true)}
                className="subtitle-btn boilerplate"
              >
                {t("subtitle.boilerplate")}
              </button>
            )}
            {toolbarVisibility.gapFill && (
              <button
                onClick={() => setShowGapFillModal(true)}
                className="subtitle-btn gap-fill"
              >
                {t("subtitle.gapFill")}
              </button>
            )}
            {toolbarVisibility.minGap && (
              <span className="min-gap-group">
                <button
                  onClick={() => updateGeneral({ minGapEnabled: !general.minGapEnabled })}
                  className={`subtitle-btn min-gap ${general.minGapEnabled ? "active" : ""}`}
                  title={t("subtitle.minGapTitle", { ms: general.minGapMs })}
                >
                  {t("subtitle.minGap")} {general.minGapEnabled ? "ON" : "OFF"}
                </button>
                <input
                  type="number"
                  className="min-gap-input"
                  min="0"
                  max="1000"
                  step="1"
                  value={general.minGapMs}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    updateGeneral({ minGapMs: isNaN(v) ? 0 : v });
                  }}
                  title={t("subtitle.minGapTitle", { ms: general.minGapMs })}
                />
                <span className="min-gap-unit">ms</span>
                <button
                  onClick={() => {
                    if (general.minGapMs > 0) applyMinGapToAll(general.minGapMs);
                  }}
                  className="subtitle-btn min-gap-apply"
                  disabled={!general.minGapMs || general.minGapMs <= 0}
                  title={t("subtitle.minGapApply")}
                >
                  {t("common.apply")}
                </button>
              </span>
            )}
            {toolbarVisibility.findReplace && (
              <button
                onClick={() => setShowFindReplaceModal(true)}
                className="subtitle-btn find"
              >
                {t("subtitle.findReplace")}
              </button>
            )}
            {toolbarVisibility.timeJump && (
              <button
                onClick={() => setShowTimeJumpModal(true)}
                className="subtitle-btn timejump"
              >
                {t("subtitle.timeJump")}
              </button>
            )}
            {toolbarVisibility.filter && (
              <button
                onClick={() => setShowFilterPanel((v) => !v)}
                className={`subtitle-btn filter ${activeFilterCount > 0 ? "active" : ""}`}
              >
                {t("subtitle.filter")}
                {activeFilterCount > 0 && (
                  <span className="filter-badge-count">{activeFilterCount}</span>
                )}
              </button>
            )}
          </>
        )}
        {isServerMode && (
          <button
            onClick={() => setShowReviewSummary(true)}
            className="subtitle-btn review-summary"
            disabled={!urlProjectFileId}
          >
            {t("subtitle.reviewSummary")}
          </button>
        )}
        <button
          onClick={() => setShowCommentListModal(true)}
          className="subtitle-btn comments"
          disabled={!commentsEnabled}
        >
          {t("subtitle.commentList")}
        </button>
        {toolbarVisibility.guideline && (
          <div
            className="guideline-control"
            title={t("subtitle.guidelinePositionTitle")}
          >
          <input
            type="number"
            min="0"
            max="200"
            value={maxSegmentLength}
            onChange={(e) => {
              const val = e.target.value;
              setSTTSegmentOption(
                "maxSegmentLength",
                val === "" ? "" : parseInt(val),
              );
            }}
            onBlur={(e) => {
              const val = parseInt(e.target.value);
              if (!val || isNaN(val))
                setSTTSegmentOption("maxSegmentLength", 0);
            }}
            placeholder="0"
            className="guideline-input"
          />
        </div>
        )}
        <span className="subtitle-count">
          {t("subtitle.subtitleCount", { count: subtitles.length })}
        </span>
        <button
          onClick={toggleAutoScroll}
          className={`subtitle-btn auto-scroll ${autoScroll ? "active" : ""}`}
          title={t(autoScroll ? "subtitle.autoScrollOnTitle" : "subtitle.autoScrollOffTitle")}
          aria-pressed={autoScroll}
        >
          {t("subtitle.autoScroll")} {autoScroll ? "ON" : "OFF"}
        </button>
        <button
          onClick={() => setShowColumnSettings(true)}
          className="subtitle-btn settings"
        >
          {t("subtitle.columnSettings")}
        </button>
      </div>

      {/* 필터 패널 */}
      {showFilterPanel && (
        <div className="subtitle-filter-panel">
          <div className="filter-section">
            <span className="filter-section-label">
              {t("subtitle.filterText")}
            </span>
            <input
              type="text"
              className="filter-text-input"
              value={filters.text}
              onChange={(e) =>
                setFilters((f) => ({ ...f, text: e.target.value }))
              }
              placeholder={t("subtitle.filterKeywordPlaceholder")}
            />
          </div>
          <div className="filter-section">
            <span className="filter-section-label">
              {t("subtitle.filterTag")}
            </span>
            <div className="filter-options filter-options--scrollable">
              {reviewTags.map((tag, idx) => (
                <label
                  key={tag.id}
                  className={`filter-chip tag-color-${idx % 8} ${filters.tagIds.includes(tag.id) ? "selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={filters.tagIds.includes(tag.id)}
                    onChange={() =>
                      setFilters((f) => ({
                        ...f,
                        tagIds: f.tagIds.includes(tag.id)
                          ? f.tagIds.filter((id) => id !== tag.id)
                          : [...f.tagIds, tag.id],
                      }))
                    }
                  />
                  {tag.tag}
                </label>
              ))}
              {reviewTags.length === 0 && (
                <span className="filter-hint">
                  {t("subtitle.filterNoTags")}
                </span>
              )}
            </div>
          </div>
          <div className="filter-section">
            <span className="filter-section-label">
              {t("subtitle.filterFeedback")}
            </span>
            <div className="filter-options">
              {[
                { value: null, label: t("common.all") },
                { value: true, label: t("common.exists") },
                { value: false, label: t("common.none") },
              ].map((opt) => (
                <label
                  key={String(opt.value)}
                  className={`filter-chip ${filters.hasComments === opt.value ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="comment-filter"
                    checked={filters.hasComments === opt.value}
                    onChange={() =>
                      setFilters((f) => ({ ...f, hasComments: opt.value }))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <div className="filter-section">
            <span className="filter-section-label">
              {t("subtitle.filterSpeaker")}
            </span>
            <div className="filter-options">
              <label
                className={`filter-chip ${filters.speakerIds.includes(null) ? "selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={filters.speakerIds.includes(null)}
                  onChange={() =>
                    setFilters((f) => ({
                      ...f,
                      speakerIds: f.speakerIds.includes(null)
                        ? f.speakerIds.filter((id) => id !== null)
                        : [...f.speakerIds, null],
                    }))
                  }
                />
                {t("subtitle.unassignedSpeaker")}
              </label>
              <label
                className={`filter-chip ${filters.speakerIds.includes(0) ? "selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={filters.speakerIds.includes(0)}
                  onChange={() =>
                    setFilters((f) => ({
                      ...f,
                      speakerIds: f.speakerIds.includes(0)
                        ? f.speakerIds.filter((id) => id !== 0)
                        : [...f.speakerIds, 0],
                    }))
                  }
                />
                {t("subtitle.blankSpeaker")}
              </label>
              {Object.values(speakers)
                .sort((a, b) => a.number - b.number)
                .map((s) => (
                  <label
                    key={s.number}
                    className={`filter-chip ${filters.speakerIds.includes(s.number) ? "selected" : ""}`}
                    style={
                      s.color
                        ? {
                            color: filters.speakerIds.includes(s.number)
                              ? s.color
                              : undefined,
                            borderColor: filters.speakerIds.includes(s.number)
                              ? s.color
                              : undefined,
                            background: filters.speakerIds.includes(s.number)
                              ? `${s.color}1a`
                              : undefined,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="filter-chip-dot"
                      style={{ background: s.color || "var(--text-muted)" }}
                    />
                    <input
                      type="checkbox"
                      checked={filters.speakerIds.includes(s.number)}
                      onChange={() =>
                        setFilters((f) => ({
                          ...f,
                          speakerIds: f.speakerIds.includes(s.number)
                            ? f.speakerIds.filter((id) => id !== s.number)
                            : [...f.speakerIds, s.number],
                        }))
                      }
                    />
                    {s.number}: {s.name}
                  </label>
                ))}
              {Object.keys(speakers).length === 0 && (
                <span className="filter-hint">
                  {t("subtitle.filterNoSpeakers")}
                </span>
              )}
            </div>
          </div>
          <div className="filter-section">
            <span className="filter-section-label">
              {t("subtitle.filterPosition")}
            </span>
            <div className="filter-position-grid">
              {POSITION_GRID.map((row, ri) => (
                <div key={ri} className="filter-position-row">
                  {row.map((pos) => (
                    <button
                      key={pos}
                      className={`filter-position-cell ${filters.positions.includes(pos) ? "active" : ""}`}
                      onClick={() =>
                        setFilters((f) => ({
                          ...f,
                          positions: f.positions.includes(pos)
                            ? f.positions.filter((p) => p !== pos)
                            : [...f.positions, pos],
                        }))
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="filter-section">
            <span className="filter-section-label">
              {t("subtitle.filterValidation")}
            </span>
            <div className="filter-options">
              {Object.values(VALIDATION_RULES)
                .filter((rule) => !rule.isMinuteBased)
                .map((rule) => (
                  <label
                    key={rule.id}
                    className={`filter-chip ${filters.validationRuleIds.includes(rule.id) ? "selected" : ""}`}
                    style={
                      filters.validationRuleIds.includes(rule.id)
                        ? {
                            color: rule.severity === "error" ? "#ff6b6b" : "#ffc107",
                            borderColor: rule.severity === "error" ? "#ff6b6b" : "#ffc107",
                            background: rule.severity === "error" ? "rgba(255,107,107,0.15)" : "rgba(255,193,7,0.15)",
                          }
                        : {}
                    }
                  >
                    <span>{rule.icon} {rule.label}</span>
                    <input
                      type="checkbox"
                      style={{ display: "none" }}
                      checked={filters.validationRuleIds.includes(rule.id)}
                      onChange={() =>
                        setFilters((f) => ({
                          ...f,
                          validationRuleIds: f.validationRuleIds.includes(rule.id)
                            ? f.validationRuleIds.filter((id) => id !== rule.id)
                            : [...f.validationRuleIds, rule.id],
                        }))
                      }
                    />
                  </label>
                ))}
            </div>
          </div>
          <button
            className="filter-reset-btn"
            onClick={() =>
              setFilters({
                text: "",
                tagIds: [],
                hasComments: null,
                speakerIds: [],
                positions: [],
                validationRuleIds: [],
              })
            }
          >
            {t("subtitle.filterReset")}
          </button>
        </div>
      )}

      {/* 다중 선택 시 플로팅 액션바 */}
      {checkedIds.size > 0 && (
        <div className="bulk-action-bar">
          <span className="bulk-count">
            {t("subtitle.selectedCount", { count: checkedIds.size })}
          </span>
          <button className="bulk-btn" onClick={handleSelectAll}>
            {t("subtitle.selectAll")}
          </button>
          <button className="bulk-btn" onClick={() => setCheckedIds(new Set())}>
            {t("subtitle.deselect")}
          </button>
          <button
            className="bulk-btn danger"
            onClick={handleBulkDelete}
            disabled={isCheckedReadOnly}
          >
            {t("subtitle.bulkDelete")}
          </button>
          <div className="bulk-position-wrapper">
            <span className="bulk-position-label">
              {t("subtitle.positionLabel")}
            </span>
            <PositionSelector
              position={bulkPosition}
              onChange={setBulkPosition}
            />
          </div>
          <button className="bulk-btn apply" onClick={handleBulkPositionChange}>
            {t("common.apply")}
          </button>
          <div className="bulk-divider" />
          <div className="bulk-speaker-wrapper">
            <span className="bulk-speaker-label">
              {t("subtitle.speakerLabel")}
            </span>
            <select
              className="bulk-speaker-select"
              value={bulkSpeakerId}
              onChange={(e) => setBulkSpeakerId(e.target.value)}
            >
              <option value="">{t("subtitle.unassignedSpeaker")}</option>
              <option value="0">{t("subtitle.blankSpeaker")}</option>
              {Object.values(speakers)
                .sort((a, b) => a.number - b.number)
                .map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.number}: {s.name}
                  </option>
                ))}
            </select>
          </div>
          <button className="bulk-btn apply" onClick={handleBulkSpeakerChange}>
            {t("common.apply")}
          </button>
          <div className="bulk-divider" />
          <div className="bulk-sync-shift-wrapper">
            <span className="bulk-sync-shift-label">
              {t("subtitle.syncShiftLabel")}
            </span>
            <select
              className="bulk-sync-shift-direction"
              value={bulkSyncDirection}
              onChange={(e) => setBulkSyncDirection(Number(e.target.value))}
            >
              <option value={1}>+</option>
              <option value={-1}>-</option>
            </select>
            <div className="bulk-sync-shift-time-group">
              <input
                type="text"
                className="bulk-sync-shift-input bulk-sync-shift-hh"
                value={bulkSyncShift.hh}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setBulkSyncShift((prev) => ({ ...prev, hh: v }));
                }}
                onBlur={() => {
                  setBulkSyncShift((prev) => ({
                    ...prev,
                    hh: prev.hh.padStart(2, "0"),
                  }));
                }}
                onKeyDown={handleSyncShiftKeyDown}
                placeholder="HH"
              />
              <span className="bulk-sync-shift-sep">:</span>
              <input
                type="text"
                className="bulk-sync-shift-input bulk-sync-shift-mm"
                value={bulkSyncShift.mm}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setBulkSyncShift((prev) => ({ ...prev, mm: v }));
                }}
                onBlur={() => {
                  setBulkSyncShift((prev) => ({
                    ...prev,
                    mm: prev.mm.padStart(2, "0"),
                  }));
                }}
                onKeyDown={handleSyncShiftKeyDown}
                placeholder="MM"
              />
              <span className="bulk-sync-shift-sep">:</span>
              <input
                type="text"
                className="bulk-sync-shift-input bulk-sync-shift-ss"
                value={bulkSyncShift.ss}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setBulkSyncShift((prev) => ({ ...prev, ss: v }));
                }}
                onBlur={() => {
                  setBulkSyncShift((prev) => ({
                    ...prev,
                    ss: prev.ss.padStart(2, "0"),
                  }));
                }}
                onKeyDown={handleSyncShiftKeyDown}
                placeholder="SS"
              />
              <span className="bulk-sync-shift-sep">.</span>
              <input
                type="text"
                className="bulk-sync-shift-input bulk-sync-shift-ms"
                value={bulkSyncShift.ms}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                  setBulkSyncShift((prev) => ({ ...prev, ms: v }));
                }}
                onBlur={() => {
                  setBulkSyncShift((prev) => ({
                    ...prev,
                    ms: prev.ms.padStart(3, "0"),
                  }));
                }}
                onKeyDown={handleSyncShiftKeyDown}
                placeholder="ms"
              />
            </div>
          </div>
          <button className="bulk-btn apply" onClick={handleBulkSyncShift}>
            {t("common.apply")}
          </button>
        </div>
      )}

      {isLoadingSubtitles ? (
        <div className="empty-state loading">
          <div className="loading-spinner"></div>
          <p>{t("subtitle.loadingSubtitles")}</p>
        </div>
      ) : subtitles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">—</div>
          <p>{t("subtitle.noSubtitles")}</p>
          <div className="add-subtitle-row" onClick={handleAddRow}>
            <span className="add-icon">+</span>
            <span className="add-text">{t("subtitle.addNewSubtitle")}</span>
          </div>
        </div>
      ) : (
        <CheckedContext.Provider value={checkedContextValue}>
          <div className="list-content-wrapper">
            {/* 가이드라인 - wrapper에 배치하여 스크롤과 무관하게 고정 */}
            {guidelineLeft !== null && maxSegmentLength > 0 && (
              <div
                className="subtitle-guideline"
                ref={guidelineRef}
                style={{
                  left: `${guidelineLeft}px`,
                  background:
                    subtitleEditor?.guidelineColor ||
                    "rgba(255, 100, 100, 0.4)",
                }}
              />
            )}
            {/* 헤더 - 항상 표시 */}
            <div
              className={`translator-list-header ${!columnVisibility.speakerPosition ? "no-left" : ""}`}
            >
              {/* 화자/위치 헤더 */}
              {columnVisibility.speakerPosition && (
                <div className="header-left">
                  <span className="header-cell header-index">#</span>
                  <span className="header-cell header-speaker">
                    {t("subtitle.headerSpeaker")}
                  </span>
                  <div
                    className="card-left-resizer"
                    data-resizer="card-left"
                    onPointerDown={handleCardLeftResizeStart}
                  />
                </div>
              )}
              <div
                className={`header-right ${!columnVisibility.speakerPosition ? "full-width" : ""}`}
              >
                {/* 출발어: 번역자 모드에서만 표시 (항상 readonly) */}
                {(getBaseRole(role) === Role.FINAL ||
                  getBaseRole(role) === Role.MID) &&
                  columnVisibility.sourceText && (
                    <>
                      <LanguageDropdown
                        value={sourceLanguage}
                        onChange={setSourceLanguage}
                        accentColor="#60a5fa"
                        disabled={true}
                        style={{ flex: 'var(--translator-source-width)' }}
                      />
                      <div
                        className="column-resizer"
                        data-resizer="source"
                        onPointerDown={(e) => handleColumnResizeStart(e,
                          'source',
                          getBaseRole(role) === Role.FINAL && hasMiddleTextData && columnVisibility.middleText ? 'middle' : 'target'
                        )}
                      />
                    </>
                  )}
                {/* 중간어: FINAL_TRANSLATOR에서만 표시 (readonly), 데이터가 있을 때만 */}
                {getBaseRole(role) === Role.FINAL &&
                  hasMiddleTextData &&
                  columnVisibility.middleText && (
                    <>
                      <LanguageDropdown
                        value={middleLanguage}
                        onChange={setMiddleLanguage}
                        accentColor="#a78bfa"
                        disabled={true}
                        style={{ flex: 'var(--translator-middle-width)' }}
                      />
                      <div
                        className="column-resizer"
                        data-resizer="middle"
                        onPointerDown={(e) => handleColumnResizeStart(e, 'middle', 'target')}
                      />
                    </>
                  )}
                {/* 도착어/중간어: 편집 가능 (REVIEWER는 readonly), 항상 표시 */}
                <LanguageDropdown
                  value={
                    getBaseRole(role) === Role.MID
                      ? middleLanguage
                      : targetLanguage
                  }
                  onChange={(code) => {
                    if (getBaseRole(role) === Role.MID) {
                      setMiddleLanguage(code);
                    } else {
                      setTargetLanguage(code);
                    }
                  }}
                  accentColor="#4ecdc4"
                  disabled={isReviewer(role)}
                  style={{ flex: 'var(--translator-target-width)' }}
                />
              </div>
            </div>
            <div className="list-content" ref={listContentRef}>
              {/*
                react-window v2 기반 가상화. 자막 카드는 .subtitle-card { height: 124px }
                고정이므로 fixed rowHeight 사용. gap 3px 은 행 wrapper 의 paddingBottom 으로 처리.
                inlineEditingId 는 객체 형태일 수 있어 forceEditingId 로 정규화하여 행 수 만큼
                반복되는 typeof 분기를 제거.
              */}
              <VirtualList
                listRef={setListImperativeRef}
                className="virtual-subtitle-list"
                rowComponent={VirtualRow}
                rowCount={filteredSubtitleIds.length}
                rowHeight={SUBTITLE_ROW_HEIGHT}
                overscanCount={6}
                rowProps={{
                  subtitleIds: filteredSubtitleIds,
                  lockedSubtitleIds,
                  indexById: subtitleIndexMap,
                  setItemRef,
                  rowGap: SUBTITLE_ROW_GAP,
                  onSelect: handleSelectNoSeek,
                  updateSubtitle,
                  onAdjustSyncStart: adjustSyncStart,
                  onAdjustSyncEnd: adjustSyncEnd,
                  onNudgeSync: nudgeSync,
                  onNavigatePrev: handleNavigatePrev,
                  onNavigateNext: handleNavigateNext,
                  onMoveToPrev: handleMoveToPrevSync,
                  onMoveToNext: handleMoveToNextSync,
                  onMergeWithPrevious: handleMergeWithPrevious,
                  onMergeWithNext: handleMergeWithNext,
                  onSplitSubtitle: handleSplitSubtitle,
                  onMoveTextToPrev: handleMoveTextToPrev,
                  onMoveTextToNext: handleMoveTextToNext,
                  onDeleteSubtitle: handleDeleteSubtitle,
                  onOutSync: handleOutSync,
                  onUndo: undo,
                  onRedo: redo,
                  syncStartNudgeStepSec,
                  onToggleLoop: toggleLoopForSubtitle,
                  onPlaySegment: playSegment,
                  onTogglePlayPause: togglePlayPause,
                  onMediaSeek: seekMedia,
                  forceEditingId: inlineEditingId,
                  validationResults,
                  aiQcMap: showAiQcPanel ? AI_QC_INDEX_MAP : undefined,
                  speakers,
                  isTranslatorMode: computedIsTranslatorMode,
                  showMiddleText: computedShowMiddleText,
                  columnVisibility,
                  onOpenSpeakerSelect: handleOpenSpeakerSelect,
                  searchMatchMap,
                  readOnly: isCheckedReadOnly,
                  saveEditHistorySnapshot,
                  reviewGroups,
                  reviewTags,
                  subtitleReviewTagMap,
                  onReviewTagToggle: handleReviewTagToggle,
                  isReviewMode: computedIsReviewMode,
                  subtitleCommentMap,
                  onCommentAdd: handleCommentAdd,
                  onCommentUpdate: handleCommentUpdate,
                  onCommentDelete: handleCommentDelete,
                  currentUserId,
                  projectFileId: urlProjectFileId,
                  onSpeakerNav: handleSpeakerNav,
                  onSpeakerDropdownRef: setSpeakerDropdownRef,
                  onContextMenu: handleCardContextMenu,
                  contextTargetId: cardContextMenu?.subtitleId || null,
                }}
              />

              {/* 새 자막 추가 행 (검수 완료 시 숨김) */}
              {!isCheckedReadOnly && (
                <div className="add-subtitle-row" onClick={handleAddRow}>
                  <span className="add-icon">+</span>
                  <span className="add-text">
                    {t("subtitle.addNewSubtitle")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CheckedContext.Provider>
      )}

      {/* 자막 카드 우클릭 컨텍스트 메뉴 */}
      {cardContextMenu && (
        <>
          <div
            className="subtitle-card-ctx-backdrop"
            onClick={closeCardContextMenu}
            onContextMenu={(e) => { e.preventDefault(); closeCardContextMenu(); }}
          />
          <div
            className="subtitle-card-context-menu"
            style={{ left: cardContextMenu.x, top: cardContextMenu.y }}
          >
            <button onClick={handleCtxInsert}>{t("subtitle.ctxInsert")}</button>
            <button onClick={handleCtxSplit}>{t("subtitle.ctxSplit")}</button>
            <div className="subtitle-card-ctx-divider" />
            <button
              onClick={handleCtxMergePrev}
              disabled={!ctxMergeAvailability.hasPrev}
            >
              {t("subtitle.ctxMergePrev")}
            </button>
            <button
              onClick={handleCtxMergeNext}
              disabled={!ctxMergeAvailability.hasNext}
            >
              {t("subtitle.ctxMergeNext")}
            </button>
            <div className="subtitle-card-ctx-divider" />
            <button onClick={handleCtxDelete}>{t("subtitle.ctxDelete")}</button>
          </div>
        </>
      )}

      {/* 포맷 선택 모달 */}
      <FormatModal
        isOpen={modalState.isOpen}
        mode={modalState.mode}
        role={role}
        onClose={handleModalClose}
        onSelect={handleFormatSelect}
        onHwpExport={
          isServerMode || isTrainingMode
            ? () => setHwpExportOpen(true)
            : undefined
        }
      />

      {/* HWP 내보내기 모달 */}
      <HwpExportModal
        open={hwpExportOpen}
        onClose={() => setHwpExportOpen(false)}
        servCd={urlServCd}
        fileNo={urlFileNo ? Number(urlFileNo) : null}
        fileNm={mediaFileName}
        subtitles={subtitles.map((sub) => ({
          id: sub.id,
          speaker: sub.speakerId != null ? String(sub.speakerId) : "",
          speakerName: sub.speakerId != null && sub.speakerId !== 0 && speakers[sub.speakerId]
            ? speakers[sub.speakerId].name
            : "",
          start: secondsToTimeCode(sub.startTime),
          end: secondsToTimeCode(sub.endTime),
          text: sub.text || "",
        }))}
      />

      {/* 정확도 비교 모달 */}
      <AccuracyModal
        isOpen={showAccuracyModal}
        onClose={() => {
          setShowAccuracyModal(false);
          setPendingSave(null);
        }}
        onConfirm={pendingSave ? handleAccuracyConfirm : undefined}
        projectFileId={urlProjectFileId}
        currentSubtitles={editableSubtitles}
        speakers={speakers}
        reviewTags={reviewTags}
        subtitleReviewTagMap={subtitleReviewTagMap}
        preferSavedMetrics={!pendingSave} /* 정확도 버튼(조회 전용) 진입 시 저장된 평가값 표시 */
      />

      {/* 태그/피드백 모아보기 모달 */}
      <ReviewSummaryModal
        isOpen={showReviewSummary}
        onClose={() => setShowReviewSummary(false)}
        subtitles={subtitles}
        subtitleReviewTagMap={subtitleReviewTagMap}
        subtitleCommentMap={subtitleCommentMap}
        reviewTags={reviewTags}
        reviewGroups={reviewGroups}
        onNavigate={(subtitleId) => {
          setShowReviewSummary(false);
          selectSubtitle(subtitleId);
          setTimeout(() => {
            const el = itemRefs.current[subtitleId];
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 100);
        }}
      />

      {/* 편집 이력 모달 */}
      <EditHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        fileId={fileId}
        servCd={urlServCd}
        fileNo={urlFileNo}
        role={role}
        isServerFile={isServerFile}
      />

      {/* 화자 관리 모달 */}
      <SpeakerSelectModal
        isOpen={showSpeakerModal}
        onClose={() => {
          setShowSpeakerModal(false);
          const subId = useSubtitleStore.getState().selectedSubtitleId;
          if (subId) {
            setTimeout(() => {
              const el = itemRefs.current[subId];
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                const textarea = el.querySelector("textarea");
                if (textarea) textarea.focus();
              }
            }, 50);
          }
        }}
        initialManageMode={true}
      />

      {/* 상용구 관리 모달 */}
      <BoilerplateModal
        isOpen={showBoilerplateModal}
        onClose={() => setShowBoilerplateModal(false)}
      />

      {/* 간격 메우기 모달 */}
      <GapFillModal
        isOpen={showGapFillModal}
        onClose={() => setShowGapFillModal(false)}
        subtitles={subtitles}
        onApply={handleGapFill}
      />

      {/* 코멘트 모아보기 모달 */}
      <CommentListModal
        isOpen={showCommentListModal}
        onClose={() => setShowCommentListModal(false)}
        subtitles={subtitles}
        subtitleCommentMap={subtitleCommentMap}
        subtitleReviewTagMap={subtitleReviewTagMap}
        reviewTags={reviewTags}
        onCommentAdd={handleCommentAdd}
        onCommentUpdate={handleCommentUpdate}
        onCommentDelete={handleCommentDelete}
        currentUserId={currentUserId}
        onNavigate={(subtitleId) => {
          setShowCommentListModal(false);
          selectSubtitle(subtitleId);
          // selectedSubtitleId 변경 effect 가 가상화 안전 스크롤·포커스를 처리하므로
          // 추가 처리는 불필요. (이전엔 itemRefs.current[id]?.scrollIntoView 였으나
          // 가상화 환경에서 viewport 밖이면 ref 가 비어 있어 동작 안 함)
        }}
      />

      {/* 찾기/바꾸기 모달 */}
      <FindReplaceModal
        isOpen={showFindReplaceModal}
        onClose={(selectedResult) => {
          setShowFindReplaceModal(false);
          setSearchMatches([]);
          if (selectedResult?.subtitleId) {
            const subtitle = subtitles.find((s) => s.id === selectedResult.subtitleId);
            if (subtitle) {
              handleSelect(selectedResult.subtitleId, subtitle.startTime, subtitle.endTime);
              const cursorPos = selectedResult.indices?.[0]?.[0] ?? 0;
              setInlineEditingId(selectedResult.subtitleId);
              focusSubtitleTextarea(selectedResult.subtitleId, cursorPos);
            }
          }
        }}
        subtitles={subtitles}
        speakers={speakers}
        updateSubtitle={updateSubtitle}
        onSelectSubtitle={(subtitleId) => {
          const subtitle = subtitles.find((s) => s.id === subtitleId);
          if (subtitle) {
            handleSelect(subtitleId, subtitle.startTime, subtitle.endTime);
          }
        }}
        onSearchMatchesChange={setSearchMatches}
        role={role}
        readOnly={isCheckedReadOnly}
      />

      {/* 중간어 선택 모달 */}
      <LanguageSelectModal
        isOpen={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
        onSelect={handleLanguageSelect}
        title={t("subtitle.middleLanguageSelect")}
      />

      {/* 컬럼 설정 모달 */}
      <ColumnSettingsModal
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        toolbarVisibility={toolbarVisibility}
        onToolbarVisibilityChange={setToolbarVisibility}
      />

      {/* 시간 이동 모달 */}
      <TimeJumpModal
        isOpen={showTimeJumpModal}
        onClose={() => setShowTimeJumpModal(false)}
        onJump={handleTimeJump}
      />

      {/* 화자 선택 모달 (F1 단축키) */}
      <SpeakerSelectModal
        isOpen={speakerSelectModal.isOpen}
        onClose={handleCloseSpeakerSelect}
        onSelect={handleSpeakerSelect}
        currentSpeaker={speakerSelectModal.currentSpeaker}
      />

      {/* 번역 설정 모달 */}
      <TranslateConfigModal
        isOpen={showTranslateModal}
        onClose={() => setShowTranslateModal(false)}
        onStart={handleTranslateStart}
        sourceLang={translateModalData.sourceLang}
        targetLang={translateModalData.targetLang}
      />

      {/* 번역 처리 모달 */}
      <ProcessModal
        isOpen={showTranslateProcess}
        onClose={() => setShowTranslateProcess(false)}
        type="translate"
        translateOptions={translateOptions}
        onComplete={handleTranslateComplete}
        onError={handleTranslateError}
        skipRedirect={true}
      />

      {/* 분할파일 병합검수 — 분할 경계 자막 겹침 해결 (STT 모달 UI 재사용) */}
      {/* AI QC 패널 */}
      {showAiQcPanel && (
        <AiQcPanel
          filter={aiQcFilter}
          onFilterChange={setAiQcFilter}
          onClose={() => setShowAiQcPanel(false)}
        />
      )}

      {mergeConflict && (
        <SttMergeConflictModal
          isOpen
          subtitles={mergeConflict.subtitles}
          overlaps={mergeConflict.overlaps}
          onResolve={handleMergeConflictResolved}
          onClose={() => setMergeConflict(null)}
        />
      )}
    </div>
  );
}

export default memo(SubtitleList);
