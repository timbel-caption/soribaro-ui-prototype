import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSubtitleStore } from "../../../stores/subtitleStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import MediaPlayer from "../video/MediaPlayer";
import MiniControlBar from "../video/MiniControlBar";
import WaveformViewer from "../waveform/WaveformViewer";
import SubtitleList from "../subtitle/SubtitleList";
import "./WidgetLayout.css";

// 레이아웃 설정
const GAP = 1; // 위젯 간 간격

// 레이아웃 설정
// 상단 행: 파형
// 하단 행: 영상 + 자막목록 (또는 자막목록만)
// h 값은 행 높이 비율로 사용 (예: h=2 vs h=4 → 상단 33.3%, 하단 66.7%)
const VIDEO_LAYOUT = [
  { i: "waveform", x: 0, y: 0, w: 12, h: 2 },
  { i: "video", x: 0, y: 1, w: 5, h: 4 },
  { i: "subtitles", x: 5, y: 1, w: 7, h: 4 },
];

const AUDIO_LAYOUT = [
  { i: "waveform", x: 0, y: 0, w: 12, h: 2 },
  { i: "subtitles", x: 0, y: 1, w: 12, h: 4 },
];

// URL query에서 mode 파라미터 읽기
const getLayoutMode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") || "video"; // 기본값은 video
};

// mode에 따른 레이아웃 반환
const getLayoutByMode = (mode) => {
  switch (mode) {
    case "audio":
      return AUDIO_LAYOUT;
    case "video":
    default:
      return VIDEO_LAYOUT;
  }
};

const getDefaultRowHeights = (rows) => {
  const heights = {};
  rows.forEach((row, idx) => {
    heights[idx] = row.h;
  });
  return heights;
};

const getDefaultColumnWidths = (rows) => {
  const widths = {};
  rows.forEach((row, rowIdx) => {
    widths[rowIdx] = {};
    row.items.forEach((item, colIdx) => {
      widths[rowIdx][colIdx] = item.w;
    });
  });
  return widths;
};

const normalizeRowHeights = (savedHeights, defaultHeights) => {
  const next = { ...defaultHeights };
  if (!savedHeights) return next;

  Object.entries(defaultHeights).forEach(([rowKey, defaultValue]) => {
    const savedValue = savedHeights[rowKey];
    next[rowKey] = Number.isFinite(savedValue) ? savedValue : defaultValue;
  });

  return next;
};

const normalizeColumnWidths = (savedWidths, defaultWidths) => {
  const next = {};
  Object.entries(defaultWidths).forEach(([rowKey, cols]) => {
    next[rowKey] = {};
    Object.entries(cols).forEach(([colKey, defaultValue]) => {
      const savedValue = savedWidths?.[rowKey]?.[colKey];
      next[rowKey][colKey] = Number.isFinite(savedValue)
        ? savedValue
        : defaultValue;
    });
  });
  return next;
};

const areNumberMapEqual = (a = {}, b = {}) => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Number.isFinite(a[key]) || !Number.isFinite(b[key])) return false;
    if (a[key] !== b[key]) return false;
  }
  return true;
};

const areNestedNumberMapEqual = (a = {}, b = {}) => {
  const rowKeysA = Object.keys(a);
  const rowKeysB = Object.keys(b);
  if (rowKeysA.length !== rowKeysB.length) return false;
  for (const rowKey of rowKeysA) {
    if (!areNumberMapEqual(a[rowKey], b[rowKey])) return false;
  }
  return true;
};

// 레이아웃 데이터를 행(row) 기반으로 그룹화
const groupLayoutByRows = (layout) => {
  // 보이는 위젯만 필터링 (w, h가 0이 아닌 것)
  const visibleWidgets = layout.filter((item) => item.w > 0 && item.h > 0);

  // y값으로 그룹화
  const rowMap = new Map();
  visibleWidgets.forEach((item) => {
    if (!rowMap.has(item.y)) {
      rowMap.set(item.y, { items: [], h: item.h });
    }
    rowMap.get(item.y).items.push(item);
  });

  // y값 순서대로 정렬하여 배열로 변환
  const rows = Array.from(rowMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => ({
      items: row.items.sort((a, b) => a.x - b.x), // x값으로 정렬
      h: row.h,
    }));

  return rows;
};

export default function WidgetLayout({ workCategory = null }) {
  const { t } = useTranslation("worktool");
  const { id: fileId } = useParams();
  const navigate = useNavigate();
  const mediaRef = useRef(null);
  const containerRef = useRef(null);
  const isVideoMinimized = useSubtitleStore((state) => state.isVideoMinimized);
  const setVideoMinimized = useSubtitleStore(
    (state) => state.setVideoMinimized,
  );
  const isServerMode = useSubtitleStore((state) => state.isServerMode);
  const serverFileError = useSubtitleStore((state) => state.serverFileError);
  const updateWorktoolUi = useSettingsStore((state) => state.updateWorktoolUi);
  const hasRestoredVideoMinimizedRef = useRef(false);

  // URL query에서 mode 읽기
  const mode = useMemo(() => getLayoutMode(), []);

  // mode에 따른 초기 레이아웃 설정
  const [layout, setLayout] = useState(() => getLayoutByMode(getLayoutMode()));

  // 레이아웃을 행 기반으로 그룹화
  const rows = useMemo(() => groupLayoutByRows(layout), [layout]);

  // 리사이징 상태
  const [rowHeights, setRowHeights] = useState(() => {
    const defaults = getDefaultRowHeights(rows);
    const saved =
      useSettingsStore.getState().worktoolUi?.layoutByMode?.[mode]?.rowHeights;
    return normalizeRowHeights(saved, defaults);
  });

  const [columnWidths, setColumnWidths] = useState(() => {
    const defaults = getDefaultColumnWidths(rows);
    const saved =
      useSettingsStore.getState().worktoolUi?.layoutByMode?.[mode]
        ?.columnWidths;
    return normalizeColumnWidths(saved, defaults);
  });

  // mode/레이아웃 변경 시 저장된 높이/너비 복원
  useEffect(() => {
    const defaults = {
      rowHeights: getDefaultRowHeights(rows),
      columnWidths: getDefaultColumnWidths(rows),
    };
    const saved = useSettingsStore.getState().worktoolUi?.layoutByMode?.[mode];
    setRowHeights(normalizeRowHeights(saved?.rowHeights, defaults.rowHeights));
    setColumnWidths(
      normalizeColumnWidths(saved?.columnWidths, defaults.columnWidths),
    );
  }, [mode, rows]);

  // 드래그 상태
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef({
    type: null, // 'row' | 'col'
    index: 0,
    rowIndex: 0,
    startPos: 0,
    startValues: {},
  });

  // 행 리사이저 마우스다운
  const handleRowResizeStart = useCallback(
    (e, rowIndex) => {
      e.preventDefault();
      setIsResizing(true);
      resizeRef.current = {
        type: "row",
        index: rowIndex,
        startPos: e.clientY,
        startValues: { ...rowHeights },
      };
    },
    [rowHeights],
  );

  // 열 리사이저 마우스다운
  const handleColResizeStart = useCallback(
    (e, rowIndex, colIndex) => {
      e.preventDefault();
      setIsResizing(true);
      resizeRef.current = {
        type: "col",
        index: colIndex,
        rowIndex: rowIndex,
        startPos: e.clientX,
        startValues: { ...columnWidths[rowIndex] },
      };
    },
    [columnWidths],
  );

  // 마우스 이동
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const ref = resizeRef.current;

      if (ref.type === "row") {
        const delta = e.clientY - ref.startPos;
        const containerHeight = containerRef.current?.offsetHeight || 600;
        const deltaRatio = (delta / containerHeight) * 10; // 비율로 변환

        const prevHeight = ref.startValues[ref.index] || 2;
        const nextHeight = ref.startValues[ref.index + 1] || 4;

        const newPrevHeight = Math.max(1, prevHeight + deltaRatio);
        const newNextHeight = Math.max(1, nextHeight - deltaRatio);

        setRowHeights((prev) => ({
          ...prev,
          [ref.index]: newPrevHeight,
          [ref.index + 1]: newNextHeight,
        }));
      } else if (ref.type === "col") {
        const delta = e.clientX - ref.startPos;
        const containerWidth = containerRef.current?.offsetWidth || 1000;
        const deltaRatio = (delta / containerWidth) * 12; // 12칸 기준

        const prevWidth = ref.startValues[ref.index] || 5;
        const nextWidth = ref.startValues[ref.index + 1] || 7;

        const minColRatio = (460 / containerWidth) * 12;
        const minCol = Math.max(2, minColRatio);
        const newPrevWidth = Math.max(minCol, prevWidth + deltaRatio);
        const newNextWidth = Math.max(minCol, nextWidth - deltaRatio);

        setColumnWidths((prev) => ({
          ...prev,
          [ref.rowIndex]: {
            ...prev[ref.rowIndex],
            [ref.index]: newPrevWidth,
            [ref.index + 1]: newNextWidth,
          },
        }));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // 영상 최소화 핸들러 (layout 변경 없이 CSS로 숨김)
  const handleVideoMinimize = useCallback(() => {
    setVideoMinimized(true);
  }, [setVideoMinimized]);

  // 영상 복원 핸들러 (MiniControlBar에서 사용)
  const handleVideoRestore = useCallback(() => {
    setVideoMinimized(false);
  }, [setVideoMinimized]);

  // 저장된 영상 최소화 상태를 최초 1회만 복원
  useEffect(() => {
    if (hasRestoredVideoMinimizedRef.current) return;
    hasRestoredVideoMinimizedRef.current = true;
    const savedVideoMinimized =
      useSettingsStore.getState().worktoolUi?.videoMinimized ?? false;
    if (savedVideoMinimized !== isVideoMinimized) {
      setVideoMinimized(savedVideoMinimized);
    }
  }, [isVideoMinimized, setVideoMinimized]);

  // 영상 최소화 상태 저장
  useEffect(() => {
    const savedVideoMinimized =
      useSettingsStore.getState().worktoolUi?.videoMinimized ?? false;
    if (savedVideoMinimized === isVideoMinimized) return;
    updateWorktoolUi({ videoMinimized: isVideoMinimized });
  }, [isVideoMinimized, updateWorktoolUi]);

  // 리사이즈 완료 시 현재 레이아웃 크기 저장
  useEffect(() => {
    if (isResizing) return;
    const savedLayout =
      useSettingsStore.getState().worktoolUi?.layoutByMode?.[mode];
    const isSameRowHeights = areNumberMapEqual(
      savedLayout?.rowHeights || {},
      rowHeights,
    );
    const isSameColumnWidths = areNestedNumberMapEqual(
      savedLayout?.columnWidths || {},
      columnWidths,
    );
    if (isSameRowHeights && isSameColumnWidths) return;

    updateWorktoolUi({
      layoutByMode: {
        [mode]: {
          rowHeights,
          columnWidths,
        },
      },
    });
  }, [isResizing, mode, rowHeights, columnWidths, updateWorktoolUi]);

  // 레이아웃 초기화 (현재 mode에 맞게)
  const resetLayout = useCallback(() => {
    setLayout(getLayoutByMode(mode));
    setVideoMinimized(false);
  }, [mode, setVideoMinimized]);

  // 레이아웃 초기화 이벤트 리스너
  useEffect(() => {
    window.addEventListener("resetLayout", resetLayout);
    return () => window.removeEventListener("resetLayout", resetLayout);
  }, [resetLayout]);

  // 위젯 컴포넌트 렌더링
  const renderWidgetContent = (widgetId) => {
    switch (widgetId) {
      case "video":
        return (
          <MediaPlayer mediaRef={mediaRef} onMinimize={handleVideoMinimize} />
        );
      case "waveform":
        return <WaveformViewer mediaRef={mediaRef} />;
      case "subtitles":
        return <SubtitleList mediaRef={mediaRef} workCategory={workCategory} />;
      default:
        return null;
    }
  };

  // 서버 모드에서 파일 에러 시 에러 화면만 표시
  if (isServerMode && serverFileError) {
    return (
      <div className="widget-layout-error">
        <div className="error-card">
          <div className="error-icon-wrapper">
            <svg
              className="error-icon-svg"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z"
                fill="currentColor"
              />
            </svg>
          </div>
          <h1 className="error-title">{t("widgetLayout.fileNotFound")}</h1>
          <p className="error-description">
            {t("widgetLayout.fileNotFoundDesc")}
          </p>
          {fileId && (
            <div className="error-file-info">
              <span className="error-label">{t("widgetLayout.fileId")}</span>
              <code className="error-file-id">{fileId}</code>
            </div>
          )}
          <div className="error-actions">
            <button
              className="error-btn error-btn-primary"
              onClick={() => navigate("/worktool")}
            >
              {t("widgetLayout.newProject")}
            </button>
            <button
              className="error-btn error-btn-secondary"
              onClick={() => window.history.back()}
            >
              {t("widgetLayout.previousPage")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`widget-layout-container ${isResizing ? "resizing" : ""}`}
      ref={containerRef}
    >
      {/* 오디오 모드이거나 영상 최소화 시 미니 컨트롤바 표시 */}
      {(mode === "audio" || isVideoMinimized) && (
        <MiniControlBar mediaRef={mediaRef} onRestore={handleVideoRestore} />
      )}

      <div className="widget-grid">
        {rows.map((row, rowIndex) => (
          <React.Fragment key={rowIndex}>
            <div
              className="widget-row"
              style={{
                flex: rowHeights[rowIndex] || row.h,
                gap: `${GAP}px`,
              }}
            >
              {row.items.map((item, colIndex) => (
                <React.Fragment key={item.i}>
                  <div
                    className={`widget-panel${item.i === "video" && isVideoMinimized ? " widget-minimized" : ""}`}
                    style={{
                      flex: columnWidths[rowIndex]?.[colIndex] || item.w,
                    }}
                  >
                    {renderWidgetContent(item.i)}
                  </div>
                  {/* 열 리사이저 (마지막 열 제외) */}
                  {colIndex < row.items.length - 1 && (
                    <div
                      className="col-resizer"
                      onMouseDown={(e) =>
                        handleColResizeStart(e, rowIndex, colIndex)
                      }
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
            {/* 행 리사이저 (마지막 행 제외) */}
            {rowIndex < rows.length - 1 && (
              <div
                className="row-resizer"
                onMouseDown={(e) => handleRowResizeStart(e, rowIndex)}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
