import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSubtitleStore } from "../../../stores/subtitleStore";
import { confirm } from "../../../stores/modalStore";
import { toast } from "../../../stores/toastStore";
import { Role, getBaseRole } from "../../../stores/roleStore";
import {
  getEditHistory,
  getHistorySubtitles,
  clearEditHistory,
} from "../../../utils/waveformCache";
import { secondsToTimeCode } from "../../../utils/timeUtils";
import { getSubtitleWorksByWorkType } from "../../../api/v9/subtitleWorks";
import { parseSubtitleJson } from "../../../utils/subtitleJsonFormat";
import { useTranslation } from "react-i18next";
import "./EditHistoryModal.css";

const WORK_TYPE_LABEL_KEYS = {
  START: "editHistory.sourceLanguage",
  MID: "editHistory.middleLanguage",
  FINAL: "editHistory.targetLanguage",
};

// role별 볼 수 있는 work_type (검수자는 해당 작업자와 동일)
const getVisibleWorkTypes = (role) => {
  const baseRole = getBaseRole(role);
  switch (baseRole) {
    case Role.START:
      return ["START"];
    case Role.MID:
      return ["START", "MID"];
    case Role.FINAL:
      return ["START", "MID", "FINAL"];
    default:
      return ["START", "MID", "FINAL"];
  }
};

export default function EditHistoryModal({
  isOpen,
  onClose,
  fileId = null,
  servCd = null,
  fileNo = null,
  role = null,
  isServerFile = false,
}) {
  const { t } = useTranslation("worktool");
  const {
    restoreFromHistory,
    restoreFromServerRevision,
    subtitles: currentSubtitles,
    isServerMode,
  } = useSubtitleStore();

  // 탭 상태 (서버 모드이고 서버 파일일 때만 서버 탭을 기본으로)
  const [activeTab, setActiveTab] = useState(
    isServerMode && isServerFile ? "server" : "local",
  );

  // 로컬 이력 상태
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);

  // 미리보기 확장 상태
  const [previewExpanded, setPreviewExpanded] = useState(false);

  // 서버 이력 상태
  const [serverRevisions, setServerRevisions] = useState([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverPreviewData, setServerPreviewData] = useState(null);
  const [selectedRevision, setSelectedRevision] = useState(null);

  // role에 따른 visible work types
  const visibleWorkTypes = useMemo(() => getVisibleWorkTypes(role), [role]);
  const [activeWorkType, setActiveWorkType] = useState(
    visibleWorkTypes[0] || "START",
  );

  // role 변경 시 activeWorkType 리셋
  useEffect(() => {
    if (!visibleWorkTypes.includes(activeWorkType)) {
      setActiveWorkType(visibleWorkTypes[0] || "START");
    }
  }, [visibleWorkTypes, activeWorkType]);

  // 탭 변경 시 초기화
  useEffect(() => {
    if (isOpen) {
      if (activeTab === "local") {
        loadHistory();
      } else if (activeTab === "server" && servCd && fileNo) {
        loadServerRevisions(activeWorkType);
      }
    }
  }, [isOpen, activeTab, servCd, fileNo, activeWorkType, role]);

  // 로컬 이력 로드
  const loadHistory = async () => {
    setLoading(true);
    const data = await getEditHistory(fileId, role);
    setHistory(data);
    setLoading(false);
  };

  // 서버 자막 작업 이력 로드 (subtitle_works 기준, work_type 별)
  const loadServerRevisions = async (workType) => {
    if (!servCd || !fileNo || !workType) return;
    setServerLoading(true);
    try {
      const response = await getSubtitleWorksByWorkType(servCd, fileNo, workType);
      if (response?.status === "SUCCESS") {
        setServerRevisions(response.data || []);
      } else {
        setServerRevisions([]);
      }
    } catch (error) {
      console.error("서버 이력 조회 실패:", error);
      setServerRevisions([]);
    } finally {
      setServerLoading(false);
    }
  };

  // 서버 이력 목록 (이미 work_type 으로 필터된 결과를 revision 내림차순 정렬)
  const filteredRevisions = useMemo(() => {
    return [...serverRevisions].sort((a, b) => b.revision - a.revision);
  }, [serverRevisions]);

  // 로컬 이력 미리보기
  const handlePreview = async (historyItem) => {
    setSelectedHistoryId(historyItem.id);
    setPreviewExpanded(false);
    const subtitles = await getHistorySubtitles(historyItem.id);
    setPreviewData({
      ...historyItem,
      subtitles: subtitles || [],
    });
  };

  // 서버 revision 미리보기 (subtitle_works.subtitle envelope JSON 을 직접 파싱)
  const handleServerPreview = (revisionItem) => {
    setSelectedRevision(revisionItem.revision);
    setPreviewExpanded(false);
    try {
      const parsed = revisionItem.subtitle
        ? parseSubtitleJson(revisionItem.subtitle)
        : null;
      setServerPreviewData({
        ...revisionItem,
        subtitles: parsed?.subtitles ?? [],
      });
    } catch (error) {
      console.error("자막 파싱 실패:", error);
      setServerPreviewData({
        ...revisionItem,
        subtitles: [],
      });
    }
  };

  // 로컬 이력 복구
  const handleRestore = async () => {
    if (!previewData || !previewData.subtitles) return;

    let confirmed = true;
    if (currentSubtitles.length > 0) {
      confirmed = await confirm(
        t("editHistory.localRestoreConfirm", {
          count: currentSubtitles.length,
        }),
        {
          title: t("common.restore"),
          confirmText: t("common.restore"),
          cancelText: t("common.cancel"),
        },
      );
    }

    if (confirmed) {
      restoreFromHistory(previewData.subtitles, {
        action: previewData.action,
        timestamp: previewData.timestamp,
      });

      const timeStr = formatTimestamp(previewData.timestamp);
      toast.success(
        t("editHistory.localRestoreSuccess", {
          action: previewData.action,
          time: timeStr,
          count: previewData.subtitles.length,
        }),
      );

      onClose();
    }
  };

  // 서버 이력 복구
  const handleServerRestore = async () => {
    if (!serverPreviewData?.subtitles) return;

    const workTypeLabel = t(WORK_TYPE_LABEL_KEYS[serverPreviewData.workType]);

    const confirmed = await confirm(
      t("editHistory.serverRestoreConfirm", {
        revision: serverPreviewData.revision,
        workTypeLabel,
      }),
      {
        title: t("common.restore"),
        confirmText: t("common.restore"),
        cancelText: t("common.cancel"),
      },
    );

    if (confirmed) {
      restoreFromServerRevision(
        serverPreviewData.subtitles,
        serverPreviewData.workType,
      );

      toast.success(
        t("editHistory.serverRestoreSuccess", {
          revision: serverPreviewData.revision,
          workTypeLabel,
          count: serverPreviewData.subtitles.length,
        }),
      );

      onClose();
    }
  };

  // 로컬 이력 전체 삭제
  const handleClearHistory = async () => {
    const confirmed = await confirm(t("editHistory.deleteAllConfirm"), {
      title: t("editHistory.deleteHistoryTitle"),
      confirmText: t("common.delete"),
      cancelText: t("common.cancel"),
    });
    if (confirmed) {
      await clearEditHistory();
      setHistory([]);
      setPreviewData(null);
      setSelectedHistoryId(null);
    }
  };

  // 시간 포맷
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return "방금 전";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;

    return date.toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="history-modal-overlay">
      <div className="history-modal">
        <div className="history-modal-header">
          <h3>{t("editHistory.title")}</h3>
          <div className="history-header-actions">
            {activeTab === "local" && (
              <button
                onClick={handleClearHistory}
                className="history-clear-btn"
                disabled={history.length === 0}
              >
                {t("editHistory.deleteAll")}
              </button>
            )}
            <button onClick={onClose} className="history-close-btn">
              ✕
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div className="history-tabs">
          {/* 서버 모드일 때만 서버 이력 탭 표시 */}
          {isServerMode && (
            <button
              className={`history-tab ${activeTab === "server" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("server");
                setPreviewData(null);
                setSelectedHistoryId(null);
              }}
            >
              {t("editHistory.serverHistory")}
            </button>
          )}
          <button
            className={`history-tab ${activeTab === "local" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("local");
              setServerPreviewData(null);
              setSelectedRevision(null);
            }}
          >
            {t("editHistory.localHistory")}
          </button>
        </div>

        {/* 서버 이력: work_type 서브탭 (role에 따라 표시) */}
        {activeTab === "server" && (
          <div className="history-subtabs">
            {visibleWorkTypes.map((type) => (
              <button
                key={type}
                className={`history-subtab ${activeWorkType === type ? "active" : ""}`}
                onClick={() => {
                  setActiveWorkType(type);
                  setServerPreviewData(null);
                  setSelectedRevision(null);
                }}
              >
                {t(WORK_TYPE_LABEL_KEYS[type])}
              </button>
            ))}
          </div>
        )}

        <div className="history-modal-content">
          {/* 로컬 이력 */}
          {activeTab === "local" && (
            <>
              <div className="history-list-section">
                <div className="history-section-title">
                  {t("editHistory.historyCount", { count: history.length })}
                </div>

                {loading ? (
                  <div className="history-loading">
                    <span className="history-spinner"></span>
                    <span>{t("editHistory.loadingHistory")}</span>
                  </div>
                ) : history.length === 0 ? (
                  <div className="history-empty">
                    <span className="history-empty-icon">—</span>
                    <p>{t("editHistory.noHistory")}</p>
                    <p className="history-empty-hint">
                      {t("editHistory.editGuide")}
                    </p>
                  </div>
                ) : (
                  <div className="history-list">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className={`history-item ${selectedHistoryId === item.id ? "selected" : ""}`}
                        onClick={() => handlePreview(item)}
                      >
                        <div className="history-item-header">
                          <span className="history-action">{item.action}</span>
                          <span className="history-time">
                            {formatTimestamp(item.timestamp)}
                          </span>
                        </div>
                        <div className="history-item-meta">
                          <span className="history-count">
                            {t("editHistory.subtitleCount", {
                              count: item.subtitleCount,
                            })}
                          </span>
                          {item.details?.text && (
                            <span className="history-detail">
                              "{item.details.text.slice(0, 20)}..."
                            </span>
                          )}
                          {item.details?.fields && (
                            <span className="history-detail">
                              ({item.details.fields})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="history-preview-section">
                <div className="history-section-title">
                  {t("editHistory.previewButton")}
                </div>

                {previewData ? (
                  <div className="history-preview">
                    <div className="preview-header">
                      <span className="preview-action">
                        {previewData.action}
                      </span>
                      <span className="preview-count">
                        {t("editHistory.subtitleCountShort", {
                          count: previewData.subtitles.length,
                        })}
                      </span>
                    </div>

                    <div className="preview-list">
                      {(previewExpanded
                        ? previewData.subtitles
                        : previewData.subtitles.slice(0, 10)
                      ).map((sub, index) => (
                        <div key={index} className="preview-item">
                          <div className="preview-time">
                            {secondsToTimeCode(sub.startTime)} →{" "}
                            {secondsToTimeCode(sub.endTime)}
                          </div>
                          <div className="preview-text">
                            {sub.text || t("editHistory.emptySubtitle")}
                          </div>
                        </div>
                      ))}
                      {!previewExpanded &&
                        previewData.subtitles.length > 10 && (
                          <button
                            className="preview-more"
                            onClick={() => setPreviewExpanded(true)}
                          >
                            {t("editHistory.showMore", {
                              count: previewData.subtitles.length - 10,
                            })}
                          </button>
                        )}
                    </div>

                    <button
                      onClick={handleRestore}
                      className="history-restore-btn"
                    >
                      {t("editHistory.restoreToThis")}
                    </button>
                  </div>
                ) : (
                  <div className="preview-empty">
                    <span className="preview-empty-icon">—</span>
                    <p>{t("editHistory.selectHistoryGuide")}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 서버 이력 */}
          {activeTab === "server" && (
            <>
              <div className="history-list-section">
                <div className="history-section-title">
                  {t(WORK_TYPE_LABEL_KEYS[activeWorkType])} (
                  {filteredRevisions.length})
                </div>

                {serverLoading ? (
                  <div className="history-loading">
                    <span className="history-spinner"></span>
                    <span>{t("editHistory.loadingHistory")}</span>
                  </div>
                ) : filteredRevisions.length === 0 ? (
                  <div className="history-empty">
                    <span className="history-empty-icon">—</span>
                    <p>{t("editHistory.noHistory")}</p>
                  </div>
                ) : (
                  <div className="history-list">
                    {filteredRevisions.map((item) => (
                      <div
                        key={item.revision}
                        className={`history-item ${selectedRevision === item.revision ? "selected" : ""}`}
                        onClick={() => handleServerPreview(item)}
                      >
                        <div className="history-item-header">
                          <span className="history-action">
                            Rev #{item.revision}
                          </span>
                          <span className="history-time">
                            {formatTimestamp(item.createdAt)}
                          </span>
                        </div>
                        <div className="history-item-meta">
                          <span className="history-count">
                            {item.lang || t("editHistory.unspecifiedLanguage")}
                          </span>
                          <span className="history-detail">
                            {t("editHistory.workerLabel", {
                              workerId: item.workerId || t("common.unknown"),
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="history-preview-section">
                <div className="history-section-title">
                  {t("editHistory.previewButton")}
                </div>

                {serverPreviewData ? (
                  <div className="history-preview">
                    <div className="preview-header">
                      <span className="preview-action">
                        Rev #{serverPreviewData.revision} (
                        {t(WORK_TYPE_LABEL_KEYS[serverPreviewData.workType])})
                      </span>
                      <span className="preview-count">
                        {t("editHistory.subtitleCountShort", {
                          count: serverPreviewData.subtitles.length,
                        })}
                      </span>
                    </div>

                    <div className="preview-list">
                      {(previewExpanded
                        ? serverPreviewData.subtitles
                        : serverPreviewData.subtitles.slice(0, 10)
                      ).map((sub, index) => {
                        // subtitle_works envelope 는 startTime/endTime (초, number) 사용.
                        // 레거시 형식(start/end HH:MM:SS) 도 안전하게 표시.
                        const startSec =
                          typeof sub.startTime === "number" ? sub.startTime : null;
                        const endSec =
                          typeof sub.endTime === "number" ? sub.endTime : null;
                        const timeLabel =
                          startSec != null && endSec != null
                            ? `${secondsToTimeCode(startSec)} → ${secondsToTimeCode(endSec)}`
                            : `${sub.start || ""} → ${sub.end || ""}`;
                        // work_type 별 컨텐츠 필드 우선순위.
                        const wt = serverPreviewData.workType;
                        const textValue =
                          wt === "START"
                            ? sub.sourceText ?? sub.text
                            : wt === "MID"
                              ? sub.middleText ?? sub.text
                              : sub.text ?? sub.middleText ?? sub.sourceText;
                        return (
                          <div key={index} className="preview-item">
                            <div className="preview-time">{timeLabel}</div>
                            <div className="preview-text">
                              {textValue || t("editHistory.emptySubtitle")}
                            </div>
                          </div>
                        );
                      })}
                      {!previewExpanded &&
                        serverPreviewData.subtitles.length > 10 && (
                          <button
                            className="preview-more"
                            onClick={() => setPreviewExpanded(true)}
                          >
                            {t("editHistory.showMore", {
                              count: serverPreviewData.subtitles.length - 10,
                            })}
                          </button>
                        )}
                    </div>

                    <button
                      onClick={handleServerRestore}
                      className="history-restore-btn"
                    >
                      {t("editHistory.restoreVersion")}
                    </button>
                  </div>
                ) : (
                  <div className="preview-empty">
                    <span className="preview-empty-icon">—</span>
                    <p>{t("editHistory.selectHistoryGuide")}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
