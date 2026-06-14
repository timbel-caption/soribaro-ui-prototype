import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Checkbox from "@mui/material/Checkbox";
import {
  getEnterpriseWorkDetail,
  getServByServCd,
  getFilesByServCd,
  updateFileDifficultyByFileNo,
  createProject,
  updateProject,
  deleteProject,
  getProjectFilesByProjectId,
  createProjectFile,
  createProjectFiles,
  deleteProjectFile,
  updateProjectFileWorkerId,
  updateProjectFileCheckerId,
  createWorksfyProject,
  updateWorksfyProject,
  closeWorksfyProject,
  getWorksfyProject,
  updateAdminMessage,
  updateWorkerMessage,
  updateCheckerMessage,
  getAttachmentsByServCd,
  uploadSharedFile,
  getSharedFileDownloadUrl,
  getCustomerFileDownloadUrl,
  getFileDownloadUrl,
  deleteSharedFiles,
  getFileStreamUrl,
  getProfile,
  updateStenoMemo,
  updateAdminMemo,
  updateAttachmentShare,
  updateFileSplitSegments,
  deleteRequestFiles,
  cancelServ,
  getLatestMergedSubtitleWork,
  uploadEnterpriseEstimateFile,
  uploadEnterpriseFinalFile,
  getLatestEnterpriseFile,
  sendEnterpriseNotification,
  ENTERPRISE_FILE_TP,
  updateServBssType,
} from "../../../api/v9";
import { getCommonCodes } from "../../../api/v9/member";
import { getFileDifficulties } from "../../../api/v9/fileDifficulties";

import { useUserStore } from "../../../stores/userStore";
import { useTranslation } from "react-i18next";
import WorksfyRegisterModal from "../../../components/common/WorksfyRegisterModal/WorksfyRegisterModal";
import WorksfyApplicantsModal from "../../../components/common/WorksfyApplicantsModal/WorksfyApplicantsModal";
import WorkerAssignModal from "../../../components/common/WorkerAssignModal/WorkerAssignModal";
import BatchAssignFileSelectModal from "../../../components/common/BatchAssignFileSelectModal/BatchAssignFileSelectModal";
import ProfileChip from "../../../components/common/ProfileChip";
import SubtitleViewModal from "../../../components/common/SubtitleViewModal";
import FileSplitModal from "../../../components/common/FileSplitModal/FileSplitModal";
import ProjectFileAddModal from "../../../components/common/ProjectFileAddModal/ProjectFileAddModal";
import RequestFileAddModal from "../../../components/common/RequestFileAddModal/RequestFileAddModal";
import HwpExportModal from "../../../components/common/HwpExportModal/HwpExportModal";
import WorkTimeEditModal from "../../../components/common/WorkTimeEditModal/WorkTimeEditModal";
import NormalizeMp3Modal from "../../../components/common/NormalizeMp3Modal";
import { Pencil } from "lucide-react";
import {
  DOWNLOAD_FORMATS,
  DOCUMENT_DOWNLOAD_FORMATS,
  downloadSubtitleFile,
  downloadSubtitleAsJson,
  downloadSubtitleAsTxt,
  mergeSubtitleFiles,
  normalizeSubtitles,
} from "../../../utils/subtitleExportUtils";
import { createEncodedBlob } from "../../../utils/encodingUtils";
import { triggerDownloadViaIframe } from "../../../utils/downloadUtils";
import { exportHwpRaw } from "../../../api/v9/tools/index";
import MergeExportModal from "../../../components/common/MergeExportModal";
import FormatModal from "../../../components/worktool/subtitle/FormatModal";
import { fetchSubtitlesByType } from "../../../utils/subtitleFetchUtils";
import { parseSubtitleJson } from "../../../utils/subtitleJsonFormat";
import { toast } from "../../../components/common/Toast";
import SplitWaveformPreview from "../translation/SplitWaveformPreview";
import PROJECT_TYPES from "../../../constants/projectTypes.json";
import LANGUAGES from "../../../constants/language.json";
import SERVICE_STATUSES from "../../../constants/serviceStatus.json";
import FILE_STATUSES from "../../../constants/fileStatus.json";
import {
  getProjectStatusChipSx,
  getChipSxFromColor,
  isWorkStartBlockedStatus,
  isReviewStartBlockedStatus,
} from "../../../utils/projectStatusUtils";
import { getLanguageDisplayName } from "../../../utils/languageUtils";
import {
  buildWorktoolPath,
  resolveWorkCategoryFromPathname,
  toAppUrl,
} from "../../../utils/worktoolRoute";
import "flag-icons/css/flag-icons.min.css";
import "../../../styles/notion-list.css";
import "../translation/TranslationWorkDetailPage.css";
import "./EnterpriseWorkDetailPage.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const OUTPUT_DOWNLOADABLE_STATUSES = ["REVIEW_DONE", "WORK_DONE", "DONE"];

const PROJECT_STATUS_COLORS = {
  RECRUITING: "#29b6f6",
  RECRUIT_CLOSED: "#ffa726",
  IN_PROGRESS: "#66bb6a",
  COMPLETED: "#78909c",
};

const WORKING_OR_ABOVE = new Set([
  "WORKING",
  "WORK_DONE",
  "REVIEWING",
  "REVIEW_REJECT",
  "REVIEW_DONE",
  "READONLY",
]);

const resolveProjectStatus = (project, projectFiles, worksfyDetail) => {
  const files = projectFiles?.data || [];
  const allReviewDone =
    files.length > 0 && files.every((f) => f.status === "REVIEW_DONE");
  if (allReviewDone) return "COMPLETED";

  const hasWorkingFile = files.some((f) => WORKING_OR_ABOVE.has(f.status));
  if (hasWorkingFile) return "IN_PROGRESS";

  const now = new Date();
  const recruitEnded = project.recruitEnd && new Date(project.recruitEnd) < now;
  const worksfyClosed = worksfyDetail?.isApplicable === false;
  const isClosed = recruitEnded || worksfyClosed;

  if (isClosed) return "RECRUIT_CLOSED";
  return "RECRUITING";
};

const PROJECT_TYPE_COLORS = {
  START: "#64b5f6",
  MID: "#ffb74d",
  FINAL: "#81c784",
};

const toYMDHM = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
};

const toYMD = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

const formatFileSize = (bytes) => {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatSec = (sec) => {
  if (sec == null) return "-";
  const totalSec = Math.floor(Number(sec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const hhmmssToSec = (str) => {
  const [h, m, s] = (str || "").split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
};

const formatISODateOnly = (iso) => {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  } catch {
    return iso;
  }
};

// 14자리 YYYYMMDDHHMMSS 또는 ISO -> YYYY.MM.DD HH:mm:ss
const formatRegDttm = (value) => {
  if (!value) return "-";
  const s = String(value);
  if (/^\d{14}$/.test(s)) {
    return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`;
  }
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return s;
  }
};

const toDatetimeLocal = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
};

const formatRecDate = (raw) => {
  if (!raw) return "-";
  if (raw.length === 8)
    return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
  return raw;
};

const formatAmount = (value) => {
  if (value == null) return "-";
  return Number(value).toLocaleString();
};

const getAttachmentChipProps = (fileTp, t) => {
  const tp = String(fileTp);
  if (tp === "8")
    return {
      label: t("enterprise.customerAttachmentFront"),
      sx: {
        fontSize: "11px",
        height: "20px",
        fontWeight: 500,
        ...getChipSxFromColor("#ef5350"),
      },
    };
  if (tp === "9")
    return {
      label: t("enterprise.customerAttachmentAdmin"),
      sx: {
        fontSize: "11px",
        height: "20px",
        fontWeight: 500,
        ...getChipSxFromColor("#ffb74d"),
      },
    };
  return {
    label: t("common.sharedFile"),
    sx: {
      fontSize: "11px",
      height: "20px",
      fontWeight: 500,
      ...getChipSxFromColor("#64b5f6"),
    },
  };
};

const PROJECT_DEFAULTS_BY_CATEGORY = {
  vod: { title: "VOD 전사 프로젝트", description: "VOD 전사 프로젝트" },
  meeting: {
    title: "회의록 전사 프로젝트",
    description: "회의록 전사 프로젝트",
  },
  record: { title: "녹음 전사 프로젝트", description: "녹음 전사 프로젝트" },
};

const getEmptyProjectForm = (workCategory) => {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const recruitStart = new Date(now);
  const recruitEnd = new Date(now.getTime() + 60 * 60 * 1000);
  const workStart = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const workEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const defaults = PROJECT_DEFAULTS_BY_CATEGORY[workCategory] || {};

  return {
    type: "START",
    lang: "",
    title: defaults.title || "",
    workerCnt: 1,
    price: "내부 기준 적용",
    recruitStart: fmt(recruitStart),
    recruitEnd: fmt(recruitEnd),
    workStart: fmt(workStart),
    workEnd: fmt(workEnd),
    isImportant: false,
    isAnyWorker: true,
    _defaultDescription: defaults.description || "",
  };
};

// ============================================================
// Tiptap 툴바
// ============================================================
const TiptapToolbar = ({ editor }) => {
  const { t } = useTranslation("soribaro");
  if (!editor) return null;
  return (
    <div className="tiptap-toolbar">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive("bold") ? "active" : ""}
        title={t("enterprise.toolbarBold")}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive("italic") ? "active" : ""}
        title={t("enterprise.toolbarItalic")}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive("strike") ? "active" : ""}
        title={t("enterprise.toolbarStrike")}
      >
        <s>S</s>
      </button>
      <span className="toolbar-divider" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={editor.isActive("heading", { level: 2 }) ? "active" : ""}
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={editor.isActive("heading", { level: 3 }) ? "active" : ""}
      >
        H3
      </button>
      <span className="toolbar-divider" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive("bulletList") ? "active" : ""}
      >
        {t("enterprise.toolbarBulletList")}
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive("orderedList") ? "active" : ""}
      >
        {t("enterprise.toolbarOrderedList")}
      </button>
      <span className="toolbar-divider" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={editor.isActive("blockquote") ? "active" : ""}
      >
        {t("enterprise.toolbarBlockquote")}
      </button>
    </div>
  );
};

// ============================================================
// 프로젝트 모달
// ============================================================
const ProjectModal = ({
  open,
  mode,
  initialData,
  onClose,
  onSubmit,
  submitting,
  hideProjectTypeSelect = false,
  workCategory,
}) => {
  const { t } = useTranslation("soribaro");
  const [form, setForm] = useState(() => getEmptyProjectForm(workCategory));
  const descriptionEditor = useEditor({
    extensions: [StarterKit],
    content: "",
    editable: true,
  });

  useEffect(() => {
    if (open) {
      if (mode === "edit" && initialData) {
        setForm({
          type: initialData.type || "",
          lang: initialData.lang || "",
          title: initialData.title || "",
          workerCnt: initialData.workerCnt ?? 1,
          price: initialData.price ?? "",
          recruitStart: toDatetimeLocal(initialData.recruitStart),
          recruitEnd: toDatetimeLocal(initialData.recruitEnd),
          workStart: toDatetimeLocal(initialData.workStart),
          workEnd: toDatetimeLocal(initialData.workEnd),
          isImportant: initialData.isImportant ?? false,
          isAnyWorker: initialData.isAnyWorker ?? true,
        });
        if (descriptionEditor && !descriptionEditor.isDestroyed)
          descriptionEditor.commands.setContent(initialData.description || "");
      } else {
        const emptyForm = getEmptyProjectForm(workCategory);
        setForm(emptyForm);
        if (descriptionEditor && !descriptionEditor.isDestroyed)
          descriptionEditor.commands.setContent(
            emptyForm._defaultDescription
              ? `<p>${emptyForm._defaultDescription}</p>`
              : "",
          );
      }
    }
  }, [open, mode, initialData, descriptionEditor]);

  const handleChange = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert(t("enterprise.alertEnterProjectName"));
      return;
    }
    if (!hideProjectTypeSelect && !form.lang) {
      alert(t("enterprise.alertSelectLanguage"));
      return;
    }
    const descHtml = descriptionEditor ? descriptionEditor.getHTML() : "";
    const description = !descHtml || descHtml === "<p></p>" ? null : descHtml;
    if (!description) {
      alert(t("enterprise.alertEnterProjectDescription"));
      return;
    }
    if (!Number(form.workerCnt) || Number(form.workerCnt) < 1) {
      alert(t("enterprise.alertEnterWorkerCount"));
      return;
    }
    if (!form.price || !String(form.price).trim()) {
      alert(t("enterprise.alertEnterUnitPrice"));
      return;
    }
    if (!form.recruitStart || !form.recruitEnd) {
      alert(t("enterprise.alertEnterRecruitPeriod"));
      return;
    }
    if (!form.workStart || !form.workEnd) {
      alert(t("enterprise.alertEnterWorkPeriod"));
      return;
    }
    const { _defaultDescription, ...submitForm } = form;
    onSubmit({
      ...submitForm,
      description,
      workerCnt: Number(form.workerCnt) || 1,
      price: form.price,
      recruitStart: form.recruitStart || null,
      recruitEnd: form.recruitEnd || null,
      workStart: form.workStart || null,
      workEnd: form.workEnd || null,
    });
  };

  if (!open) return null;

  return (
    <div className="notion-modal-overlay">
      <div className="notion-modal notion-modal-lg">
        <div className="notion-modal-header">
          <h3>
            {mode === "edit"
              ? t("enterprise.editProject")
              : t("enterprise.newProject")}
          </h3>
          <button className="notion-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="notion-modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t("enterprise.labelProjectName")}</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder={t("enterprise.placeholderProjectName")}
            />
          </div>
          {!hideProjectTypeSelect && (
            <div className="form-row">
              <div className="form-group">
                <label>{t("enterprise.labelProjectType")}</label>
                <select
                  value={form.type}
                  onChange={(e) => handleChange("type", e.target.value)}
                >
                  <option value="">{t("enterprise.selectPlaceholder")}</option>
                  {PROJECT_TYPES.map((pt) => (
                    <option key={pt.type} value={pt.type}>
                      {t(`common.projectType_${pt.type}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t("enterprise.labelLanguage")}</label>
                <div className="lang-select-wrapper">
                  {form.lang && (
                    <span
                      className={`fi fi-${LANGUAGES.find((l) => l.code === form.lang)?.country?.toLowerCase() || ""} lang-select-flag`}
                    ></span>
                  )}
                  <select
                    value={form.lang}
                    onChange={(e) => handleChange("lang", e.target.value)}
                    className={form.lang ? "has-flag" : ""}
                  >
                    <option value="">
                      {t("enterprise.selectPlaceholder")}
                    </option>
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {getLanguageDisplayName(lang)} (
                        {lang.code.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
          <div className="form-group">
            <label>{t("enterprise.labelProjectDescription")}</label>
            <div className="tiptap-editor-wrapper">
              <TiptapToolbar editor={descriptionEditor} />
              <EditorContent editor={descriptionEditor} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t("enterprise.labelWorkerCount")}</label>
              <input
                type="number"
                min="1"
                value={form.workerCnt}
                onChange={(e) => handleChange("workerCnt", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>{t("enterprise.labelUnitPrice")}</label>
              <input
                type="text"
                value={form.price}
                onChange={(e) => handleChange("price", e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t("enterprise.labelRecruitStart")}</label>
              <input
                type="datetime-local"
                value={form.recruitStart}
                onChange={(e) => handleChange("recruitStart", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>{t("enterprise.labelRecruitEnd")}</label>
              <input
                type="datetime-local"
                value={form.recruitEnd}
                onChange={(e) => handleChange("recruitEnd", e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t("enterprise.labelWorkStart")}</label>
              <input
                type="datetime-local"
                value={form.workStart}
                onChange={(e) => handleChange("workStart", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>{t("enterprise.labelWorkEnd")}</label>
              <input
                type="datetime-local"
                value={form.workEnd}
                onChange={(e) => handleChange("workEnd", e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={form.isImportant}
                  onChange={(e) =>
                    handleChange("isImportant", e.target.checked)
                  }
                />
                {t("enterprise.labelImportantProject")}
              </label>
            </div>
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={form.isAnyWorker}
                  onChange={(e) =>
                    handleChange("isAnyWorker", e.target.checked)
                  }
                />
                {t("enterprise.labelAnyoneCanApply")}
              </label>
            </div>
          </div>
          <div className="notion-modal-footer">
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting
                ? t("common.processing")
                : mode === "edit"
                  ? t("common.edit")
                  : t("common.register")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// 메시지 인라인 편집
// ============================================================
const MessageEditor = ({
  projectId,
  field,
  label,
  value,
  onSaved,
  readOnly = false,
}) => {
  const { t } = useTranslation("soribaro");
  const hasContent = value && value !== "<p></p>";
  const [collapsed, setCollapsed] = useState(!hasContent);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const originalRef = useRef(value || "");

  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "",
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const isEmpty = html === "<p></p>" || html === "";
      const origEmpty =
        !originalRef.current || originalRef.current === "<p></p>";
      setDirty(isEmpty !== origEmpty || html !== originalRef.current);
    },
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.setEditable(!readOnly);
    }
  }, [readOnly, editor]);

  useEffect(() => {
    originalRef.current = value || "";
    if (editor && !editor.isDestroyed) {
      const currentHtml = editor.getHTML();
      if (currentHtml !== (value || ""))
        editor.commands.setContent(value || "");
      setDirty(false);
    }
  }, [value, editor]);

  const handleSave = async () => {
    if (!editor || readOnly) return;
    setSaving(true);
    try {
      const html = editor.getHTML();
      const content = html === "<p></p>" ? null : html;
      const apiFnMap = {
        adminMessage: updateAdminMessage,
        workerMessage: updateWorkerMessage,
        checkerMessage: updateCheckerMessage,
      };
      const apiFn = apiFnMap[field];
      const response = await apiFn(projectId, content);
      if (response?.status === "SUCCESS") {
        originalRef.current = html;
        setDirty(false);
        if (onSaved) onSaved();
      } else alert(response?.message || t("enterprise.saveFailed"));
    } catch (err) {
      alert(err.message || t("enterprise.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="message-editor">
      <div
        className="message-editor-header"
        onClick={() => setCollapsed((p) => !p)}
        style={{ cursor: "pointer" }}
      >
        <div className="message-editor-toggle">
          <span className="toggle-arrow">{collapsed ? "▶" : "▼"}</span>
          <span className="info-label">{label}</span>
          {collapsed && !hasContent && (
            <span className="message-empty-hint">
              {t("enterprise.noContent")}
            </span>
          )}
        </div>
        {!readOnly && dirty && !collapsed && (
          <Button
            variant="contained"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleSave();
            }}
            disabled={saving}
            sx={{
              fontSize: "11px",
              textTransform: "none",
              height: "24px",
              minWidth: "50px",
            }}
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        )}
      </div>
      {!collapsed && (
        <div className="tiptap-editor-wrapper">
          {!readOnly && <TiptapToolbar editor={editor} />}
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  );
};

// ============================================================
// 메인 컴포넌트
// ============================================================
export default function EnterpriseWorkDetailPage({
  fetchDetailApi = getEnterpriseWorkDetail,
  backLabel,
  showVideoYn = true,
  hideProjectTypeSelect = true,
  showRequestDetails = true,
  showAddRequestFile = true,
  notificationSendType = "23",
  showRequesterContactPayment = false,
}) {
  const { t } = useTranslation("soribaro");
  const resolvedBackLabel = backLabel ?? t("common.backToWorkList");
  const { servCd } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const attachmentFileInputRef = useRef(null);

  const isAdmin = useUserStore((s) => s.isAdmin);
  const membId = useUserStore((s) => s.user?.membId);

  // ========== 상태 ==========
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overallStatus, setOverallStatus] = useState(null);
  const [trnsYn, setTrnsYn] = useState("N");
  const [cnlYn, setCnlYn] = useState("N");
  const [subtitleViewModal, setSubtitleViewModal] = useState({
    open: false,
    fileNo: null,
  });
  const [downloadMenu, setDownloadMenu] = useState({
    open: false,
    fileNo: null,
    fileNm: "",
  });
  const [requestFileAddModal, setRequestFileAddModal] = useState(false);
  const [hwpExportModal, setHwpExportModal] = useState({
    open: false,
    fileNo: null,
    fileNm: "",
  });
  const [normalizeMp3Modal, setNormalizeMp3Modal] = useState({
    open: false,
    fileNo: null,
    fileNm: "",
  });
  const [bulkHwpExportOpen, setBulkHwpExportOpen] = useState(false);
  const [mergeExportOpen, setMergeExportOpen] = useState(false);
  const [mergedData, setMergedData] = useState(null);
  const [selectedFileNos, setSelectedFileNos] = useState(new Set());
  const [bulkDifficultyId, setBulkDifficultyId] = useState("");
  const [applyingBulkDifficulty, setApplyingBulkDifficulty] = useState(false);

  const handleToggleFileSelect = useCallback((fileNo) => {
    setSelectedFileNos((prev) => {
      const next = new Set(prev);
      if (next.has(fileNo)) next.delete(fileNo);
      else next.add(fileNo);
      return next;
    });
  }, []);

  const exportSubtitleForFile = useCallback(
    async (
      dlFileNo,
      fileNm,
      format,
      _targetField = "text",
      encoding = "utf-8",
      options = {},
    ) => {
      if (!dlFileNo) return;
      const isTranslation = trnsYn === "Y";
      const types = isTranslation ? ["FINAL", "MID", "START"] : ["START"];
      let subtitles = [];
      let resolvedType = null;
      for (const type of types) {
        subtitles = await fetchSubtitlesByType(servCd, dlFileNo, type);
        if (subtitles.length > 0) {
          resolvedType = type;
          break;
        }
      }
      if (!subtitles.length) {
        toast.warning(
          `${fileNm || dlFileNo}: ${t("enterprise.noSubtitleData")}`,
        );
        return;
      }

      subtitles = normalizeSubtitles(subtitles);

      if (options.includePosition === false) {
        subtitles = subtitles.map((sub) => ({
          ...sub,
          position: "bottomCenter",
        }));
      }

      const title = fileNm ? fileNm.replace(/\.[^/.]+$/, "") : "subtitle";
      const { exportToSMI } = await import("../../../utils/smiUtils");
      const { exportToSRT } = await import("../../../utils/srtUtils");
      const { exportToVTT } = await import("../../../utils/vttUtils");
      const { exportToDFXP } = await import("../../../utils/dfxpUtils");

      let content = "";
      let extension = format.extension;
      let mimeType = format.mimeType;

      switch (format.id) {
        case "json":
          // worktool envelope 포맷으로 내보내기. resolvedType 을 permission 메타로 전달해
          // 재가져오기 시 역할을 인식할 수 있게 한다 (docs/interface/subtitle-json-format.md).
          downloadSubtitleAsJson(
            { subtitles, permission: resolvedType },
            `${title}.json`,
            encoding,
          );
          return;
        case "dfxp":
          content = exportToDFXP(subtitles, title);
          break;
        case "smi":
          content = exportToSMI(subtitles, title, "ko", {
            includeTags: true,
            includeNbsp: options.includeNbsp !== false,
          });
          break;
        case "smi-notag":
          content = exportToSMI(subtitles, title, "ko", {
            includeTags: false,
            includeNbsp: options.includeNbsp !== false,
          });
          extension = ".smi";
          break;
        case "srt":
          content = exportToSRT(subtitles);
          break;
        case "srt-noblank":
          content = exportToSRT(subtitles, { skipEmpty: true });
          extension = ".srt";
          break;
        case "vtt":
          content = exportToVTT(subtitles);
          break;
        case "txt":
          content = subtitles
            .map((sub) => (sub.text || "").replace(/ {2,}/g, " "))
            .join("\n\n");
          break;
        case "txt-noblank":
          content = subtitles
            .map((sub) => (sub.text || "").replace(/\n/g, " "))
            .join(" ")
            .replace(/ {2,}/g, " ")
            .trim();
          extension = ".txt";
          break;
        default:
          return;
      }

      const blob = createEncodedBlob(content, mimeType, encoding);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}${extension}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [servCd, trnsYn, t],
  );

  const handleFormatSelect = useCallback(
    async (format, targetField = "text", encoding = "utf-8", options = {}) => {
      const { fileNo: dlFileNo, fileNm } = downloadMenu;
      setDownloadMenu({ open: false, fileNo: null, fileNm: "" });
      if (!dlFileNo) return;
      toast.info(t("enterprise.downloadPreparing"));
      await exportSubtitleForFile(
        dlFileNo,
        fileNm,
        format,
        targetField,
        encoding,
        options,
      );
    },
    [downloadMenu, exportSubtitleForFile, t],
  );

  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [difficultyOptions, setDifficultyOptions] = useState([]);
  const [deletingRequestFiles, setDeletingRequestFiles] = useState(false);

  const handleToggleAllFiles = useCallback(() => {
    setSelectedFileNos((prev) => {
      if (prev.size === files.length) return new Set();
      return new Set(files.map((f) => f.fileNo));
    });
  }, [files]);

  const handleDeleteRequestFiles = useCallback(async () => {
    if (selectedFileNos.size === 0) return;
    const fileNos = Array.from(selectedFileNos);
    const fileNameList = files
      .filter((f) => selectedFileNos.has(f.fileNo))
      .map((f) => `• ${f.fileNm || f.fileNo}`)
      .join("\n");
    const confirmMsg =
      t("enterprise.confirmDeleteRequestFiles", { count: fileNos.length }) +
      "\n\n" +
      fileNameList +
      "\n\n" +
      t("enterprise.deleteRequestFileWarning");
    if (!window.confirm(confirmMsg)) return;

    setDeletingRequestFiles(true);
    try {
      const res = await deleteRequestFiles({ servCd, fileNos });
      const data = res?.data || res;
      const deleted = data?.deletedCount || 0;
      const skipped = Array.isArray(data?.skipped) ? data.skipped : [];

      if (deleted > 0) {
        toast.success(
          t("enterprise.deleteRequestFileSuccess", { count: deleted }),
        );
      }
      if (skipped.length > 0) {
        const reasonLabel = (reason) => {
          switch (reason) {
            case "ASSIGNED_IN_PROGRESS":
              return t("enterprise.skipReasonAssigned");
            case "HAS_SUBTITLES":
              return t("enterprise.skipReasonHasSubtitles");
            case "NOT_OWNED":
              return t("enterprise.skipReasonNotOwned");
            case "NOT_REQUEST_FILE":
              return t("enterprise.skipReasonNotRequest");
            case "LAST_REMAINING":
              return t("enterprise.skipReasonLastRemaining");
            default:
              return reason;
          }
        };
        const detail = skipped
          .map((s) => `#${s.fileNo} (${reasonLabel(s.reason)})`)
          .join(", ");
        toast.warning(
          t("enterprise.deleteRequestFileSkipped", {
            count: skipped.length,
            detail,
          }),
        );
      }

      setSelectedFileNos(new Set());

      try {
        const fRes = await getFilesByServCd(servCd);
        if (Array.isArray(fRes)) setFiles(fRes);
        else if (fRes?.status === "SUCCESS") setFiles(fRes.data || []);
        else if (Array.isArray(fRes?.data)) setFiles(fRes.data);
      } catch {
        // 재조회 실패 시 페이지 새로고침으로 대체 가능 - 사용자에게는 영향 없음
      }
    } catch (err) {
      console.error("Delete request files error:", err);
      toast.error(err?.message || t("enterprise.deleteRequestFileError"));
    } finally {
      setDeletingRequestFiles(false);
    }
  }, [selectedFileNos, files, servCd, t]);

  const handleDownloadOriginal = useCallback(async () => {
    if (selectedFileNos.size === 0) return;
    toast.info(t("enterprise.downloadPreparing"));
    const fileNoList = Array.from(selectedFileNos);
    for (let i = 0; i < fileNoList.length; i++) {
      const fileNo = fileNoList[i];
      try {
        const res = await getFileDownloadUrl(fileNo);
        const data = res?.data || res;
        const url = data?.url || data?.downloadUrl;
        if (url) {
          triggerDownloadViaIframe(url);
          // 다건 시 브라우저가 동시 스트림을 안정적으로 처리하도록 짧은 간격을 둠
          if (i < fileNoList.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
      } catch (err) {
        toast.error(
          `${fileNo}: ${err.message || t("enterprise.downloadFailed")}`,
        );
      }
    }
  }, [selectedFileNos, t]);

  // 산출물 일괄 다운로드: 선택된 파일 중 검수완료(REVIEW_DONE/WORK_DONE/DONE) 파일만 대상
  const [bulkDownloadOpen, setBulkDownloadOpen] = useState(false);
  const reviewDoneSelectedFiles = useMemo(() => {
    return files.filter(
      (f) =>
        selectedFileNos.has(f.fileNo) &&
        OUTPUT_DOWNLOADABLE_STATUSES.includes(f.overallStatus),
    );
  }, [files, selectedFileNos]);

  const handleBulkFormatSelect = useCallback(
    async (format, targetField = "text", encoding = "utf-8", options = {}) => {
      if (reviewDoneSelectedFiles.length === 0) return;
      toast.info(t("enterprise.downloadPreparing"));
      for (const f of reviewDoneSelectedFiles) {
        await exportSubtitleForFile(
          f.fileNo,
          f.fileNm || "",
          format,
          targetField,
          encoding,
          options,
        );
      }
    },
    [reviewDoneSelectedFiles, exportSubtitleForFile, t],
  );

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [expandedProjectIds, setExpandedProjectIds] = useState(new Set());
  const [projectFilesMap, setProjectFilesMap] = useState({});

  const [projectModal, setProjectModal] = useState({
    open: false,
    mode: "create",
    data: null,
  });
  const [projectModalSubmitting, setProjectModalSubmitting] = useState(false);
  const [fileAddModal, setFileAddModal] = useState({
    open: false,
    projectId: null,
  });
  const [fileAddSubmitting, setFileAddSubmitting] = useState(false);
  const [worksfyRegisterModal, setWorksfyRegisterModal] = useState({
    open: false,
    project: null,
  });
  const [worksfyRegisterSubmitting, setWorksfyRegisterSubmitting] =
    useState(false);
  const [worksfyApplicantsModal, setWorksfyApplicantsModal] = useState({
    open: false,
    worksfyProjectKey: null,
  });
  const [workerAssignModal, setWorkerAssignModal] = useState({
    open: false,
    projectId: null,
    projectFileId: null,
    worksfyProjectKey: null,
  });
  const [workerAssigning, setWorkerAssigning] = useState(false);
  const [checkerAssignModal, setCheckerAssignModal] = useState({
    open: false,
    projectId: null,
    projectFileId: null,
    worksfyProjectKey: null,
  });
  const [checkerAssigning, setCheckerAssigning] = useState(false);

  // 작업시간 편집 모달 (관리자 전용)
  const [workTimeEditModal, setWorkTimeEditModal] = useState({
    open: false,
    projectId: null,
    projectFile: null,
    fileName: "",
  });

  // 일괄 배정 파일 선택 모달
  const [batchAssignModal, setBatchAssignModal] = useState({
    open: false,
    projectId: null,
    assigneeId: null,
    type: null,
    projectFiles: [],
    loading: false,
  });

  // 웍스파이 상세 정보 캐시 { [worksfyProjectKey]: WorksfyProjectDto }
  const [worksfyDetailsMap, setWorksfyDetailsMap] = useState({});
  const [worksfyClosingKeys, setWorksfyClosingKeys] = useState(new Set());

  const [playingFileNo, setPlayingFileNo] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const audioRef = useRef(null);

  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [attachmentUploadModal, setAttachmentUploadModal] = useState(false);
  const [uploadSelectedFiles, setUploadSelectedFiles] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [expandedFileNos, setExpandedFileNos] = useState(new Set());
  const [fileDetailOpen, setFileDetailOpen] = useState(true);
  const [fileSplitModal, setFileSplitModal] = useState({
    open: false,
    file: null,
  });
  const [editStenoMemo, setEditStenoMemo] = useState("");
  const [savingStenoMemo, setSavingStenoMemo] = useState(false);
  const [editAdminMemo, setEditAdminMemo] = useState("");
  const [savingAdminMemo, setSavingAdminMemo] = useState(false);
  const [selectedAttFileNos, setSelectedAttFileNos] = useState(new Set());
  const [savingShare, setSavingShare] = useState(false);

  const fileMap = useMemo(() => {
    const map = {};
    files.forEach((f) => {
      map[f.fileNo] = f;
    });
    return map;
  }, [files]);

  const visibleAttachments = useMemo(() => {
    if (isAdmin()) return attachments;
    return attachments.filter((a) => a.shareYn === "Y");
  }, [attachments, isAdmin]);

  const comm = data?.commInfo;
  const isDocumentType = !showVideoYn || comm?.videoYn === "N";
  const workCategory = useMemo(
    () => resolveWorkCategoryFromPathname(location.pathname),
    [location.pathname],
  );
  const activeFormats = isDocumentType
    ? DOCUMENT_DOWNLOAD_FORMATS
    : DOWNLOAD_FORMATS;

  const selectedMergeableFiles = useMemo(
    () =>
      files.filter(
        (f) =>
          selectedFileNos.has(f.fileNo) &&
          ["REVIEW_DONE", "DONE"].includes(f.overallStatus),
      ),
    [files, selectedFileNos],
  );

  const allFilesReviewDone = useMemo(
    () =>
      files.length >= 2 &&
      files.every((f) => ["REVIEW_DONE", "DONE"].includes(f.overallStatus)),
    [files],
  );

  const handleMergeReview = useCallback(() => {
    if (!allFilesReviewDone) return;

    const mergeData = files.map((f) => ({
      fileNo: f.fileNo,
      playTm: f.playTm || 0,
    }));
    sessionStorage.setItem(
      "soribaro-merge-review",
      JSON.stringify({
        servCd,
        trnsYn,
        files: mergeData,
      }),
    );
    const w = Math.round(screen.width * 0.9);
    const h = Math.round(screen.height * 0.9);
    const left = Math.round((screen.width - w) / 2);
    const top = Math.round((screen.height - h) / 2);
    window.open(
      toAppUrl(`/worktool?mode=merge&servCd=${servCd}&popup=true`),
      "mergeReview",
      `width=${w},height=${h},left=${left},top=${top}`,
    );
  }, [allFilesReviewDone, files, servCd, trnsYn]);

  const handleMergeDownload = useCallback(async () => {
    if (!allFilesReviewDone) return;

    toast.info(t("enterprise.mergeDownloadPreparing"));

    // DB에서 저장된 병합 자막 조회
    try {
      const mergedRes = await getLatestMergedSubtitleWork(servCd);
      if (mergedRes?.status === "SUCCESS" && mergedRes?.data?.subtitle) {
        const savedMerged =
          parseSubtitleJson(mergedRes.data.subtitle)?.subtitles ?? [];
        if (savedMerged.length > 0) {
          setMergedData(savedMerged);
          setMergeExportOpen(true);
          return;
        }
      }
    } catch {}

    // 저장된 병합 자막이 없으면 알림
    toast.warning(
      t(
        "enterprise.noMergedSubtitleData",
        "병합 검수된 자막 파일이 없습니다. 병합 검수를 먼저 진행해주세요.",
      ),
    );
  }, [allFilesReviewDone, servCd]);

  // ────────────────────────────────────────
  // 엔터프라이즈 회의록: 견적서/최종산출물/알림발송
  // ────────────────────────────────────────
  const estimateFileInputRef = useRef(null);
  const finalOutputFileInputRef = useRef(null);
  const [sendingNotification, setSendingNotification] = useState(false);

  const estimateLabel = workCategory === "record" ? "공증파일" : "견적서";

  const handleEnterpriseFileUpload = useCallback(
    async (file, { isFinal }) => {
      if (!file || !servCd) return;
      const label = isFinal ? "최종산출물" : estimateLabel;
      try {
        toast.info(`${label} 업로드 중...`);
        const uploader = isFinal
          ? uploadEnterpriseFinalFile
          : uploadEnterpriseEstimateFile;
        const res = await uploader(file, servCd);
        if (res?.status === "SUCCESS") {
          toast.success(`${label}가 업로드되었습니다.`);
          // 공증파일(녹취록 ESTIMATE) 업로드 완료 시 알리고 템플릿 "20" 발송 — 백엔드는 sendType="20" 시 상태전이 스킵
          if (!isFinal && workCategory === "record") {
            try {
              const notifyRes = await sendEnterpriseNotification(servCd, "20");
              if (notifyRes?.status === "SUCCESS") {
                if (notifyRes.data?.smsSent) {
                  toast.success(`${label} 업로드 알림이 발송되었습니다.`);
                } else {
                  toast.warning(
                    `${label}은 업로드되었으나 알림 발송에 실패했습니다: ${notifyRes.data?.smsMessage || "알 수 없음"}`,
                  );
                  console.error(
                    "[sendEnterpriseNotification:공증] SMS 실패",
                    notifyRes.data,
                  );
                }
              } else {
                toast.error(
                  notifyRes?.message || `${label} 알림 발송에 실패했습니다.`,
                );
              }
            } catch (notifyErr) {
              toast.error(
                notifyErr?.message ||
                  `${label} 알림 발송 중 오류가 발생했습니다.`,
              );
              console.error(
                "[sendEnterpriseNotification:공증] 예외",
                notifyErr,
              );
            }
          }
        } else {
          toast.error(res?.message || `${label} 업로드에 실패했습니다.`);
        }
      } catch (err) {
        toast.error(err?.message || `${label} 업로드 중 오류가 발생했습니다.`);
      }
    },
    [servCd, estimateLabel, workCategory],
  );

  const handleEnterpriseFileDownload = useCallback(
    async ({ isFinal }) => {
      if (!servCd) return;
      const label = isFinal ? "최종산출물" : estimateLabel;
      const fileTp = isFinal
        ? ENTERPRISE_FILE_TP.FINAL
        : ENTERPRISE_FILE_TP.ESTIMATE;
      try {
        const metaRes = await getLatestEnterpriseFile(servCd, fileTp);
        const fileNo = metaRes?.data?.fileNo;
        if (metaRes?.status !== "SUCCESS" || !fileNo) {
          toast.warning(`${label} 파일이 없습니다.`);
          return;
        }
        const urlRes = await getFileDownloadUrl(fileNo);
        const url = urlRes?.data?.url;
        if (!url) {
          toast.error(`${label} 다운로드 URL 생성에 실패했습니다.`);
          return;
        }
        const a = document.createElement("a");
        a.href = url;
        a.download = metaRes.data.fileNm || "";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        toast.error(
          err?.message || `${label} 다운로드 중 오류가 발생했습니다.`,
        );
      }
    },
    [servCd, estimateLabel],
  );

  const handleSendEnterpriseNotification = useCallback(async () => {
    if (!servCd || sendingNotification) return;
    if (
      !window.confirm(
        t(
          "enterprise.confirmSendNotification",
          "관련자들에게 초안 완성 알림을 발송하시겠습니까?",
        ),
      )
    ) {
      return;
    }
    setSendingNotification(true);
    try {
      const res = await sendEnterpriseNotification(
        servCd,
        notificationSendType,
      );
      if (res?.status === "SUCCESS") {
        if (res.data?.smsSent) {
          toast.success("초안완성 알림이 발송되었습니다.");
        } else {
          // 상태 전이는 성공했으나 SMS 실패한 경우 실패 내용을 그대로 노출
          toast.warning(
            `초안완성 상태로 변경되었습니다. SMS 실패: ${res.data?.smsMessage || "알 수 없음"}`,
          );
          // 디버깅을 위해 콘솔에 결과 코드 출력
          console.error("[sendEnterpriseNotification] SMS 실패", res.data);
        }
      } else {
        toast.error(res?.message || "알림 발송에 실패했습니다.");
      }
    } catch (err) {
      toast.error(err?.message || "알림 발송 중 오류가 발생했습니다.");
      console.error("[sendEnterpriseNotification] 예외", err);
    } finally {
      setSendingNotification(false);
    }
  }, [servCd, sendingNotification, notificationSendType, t]);

  const handleMergeExport = useCallback(
    async (formatId, options) => {
      if (!mergedData?.length) return;
      const fileName = `${servCd}_merged`;

      if (formatId === "json") {
        // 병합 결과는 FINAL 단계의 산출물로 간주.
        downloadSubtitleAsJson(
          { subtitles: mergedData, permission: "FINAL" },
          `${fileName}.json`,
        );
      } else if (formatId === "txt" || formatId === "txt-noblank") {
        let content;
        if (formatId === "txt") {
          content = mergedData.map((sub) => sub.text || "").join("\n\n");
        } else {
          content = mergedData
            .map((sub) => (sub.text || "").replace(/\n/g, " "))
            .join(" ")
            .replace(/ {2,}/g, " ")
            .trim();
        }
        const blob = createEncodedBlob(content, "text/plain");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileName}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (formatId === "hwp" && options?.templateFile) {
        try {
          toast.info(t("enterprise.hwpExportProcessing", "HWP 생성 중..."));
          const blob = await exportHwpRaw(options.templateFile, mergedData);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${fileName}.hwp`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success(t("enterprise.hwpExportSuccess"));
        } catch (err) {
          toast.error(t("enterprise.hwpExportError"));
        }
      }

      setMergeExportOpen(false);
    },
    [mergedData, servCd, trnsYn, selectedMergeableFiles],
  );

  const speakersByFile = useMemo(() => {
    if (!showRequestDetails) return {};
    const speakers = data?.speakers || [];
    const map = {};
    speakers.forEach((s) => {
      if (!map[s.fileNo]) map[s.fileNo] = [];
      map[s.fileNo].push(s);
    });
    return map;
  }, [showRequestDetails, data?.speakers]);

  const toggleFileExpand = useCallback((fileNo) => {
    setExpandedFileNos((prev) => {
      const next = new Set(prev);
      if (next.has(fileNo)) next.delete(fileNo);
      else next.add(fileNo);
      return next;
    });
  }, []);

  const openFileSplitModal = useCallback((file) => {
    setFileSplitModal({ open: true, file });
  }, []);
  const closeFileSplitModal = useCallback(() => {
    setFileSplitModal({ open: false, file: null });
  }, []);

  const allProjectFiles = useMemo(() => {
    return Object.values(projectFilesMap).flatMap((pf) => pf?.data || []);
  }, [projectFilesMap]);

  const assignedFileNos = useMemo(() => {
    const nos = new Set();
    allProjectFiles.forEach((f) => nos.add(f.fileNo));
    return nos;
  }, [allProjectFiles]);

  const myAssignedFileNos = useMemo(() => {
    if (isAdmin()) return null;
    const nos = new Set();
    Object.values(projectFilesMap).forEach((pf) => {
      (pf?.data || []).forEach((f) => {
        if (f.workerId === membId || f.checkerId === membId) {
          nos.add(f.fileNo);
        }
      });
    });
    return nos;
  }, [projectFilesMap, membId, isAdmin]);

  const segmentProjectMap = useMemo(() => {
    const map = {};
    files.forEach((file) => {
      if (file.splitTp !== "1" || !file.timeSegments?.length) return;
      const allProjFiles = [];
      projects.forEach((proj) => {
        const pf = projectFilesMap[proj.id];
        if (!pf?.data) return;
        pf.data.forEach((pFile) => {
          if (pFile.isSplit && pFile.fileNo === file.fileNo) {
            allProjFiles.push({
              ...pFile,
              projectTitle: proj.title,
              projectId: proj.id,
            });
          }
        });
      });
      file.timeSegments.forEach((seg) => {
        const segStartSec = hhmmssToSec(seg.splitTimeSt);
        const segEndSec = hhmmssToSec(seg.splitTimeEd);
        const key = `${file.fileNo}_${seg.splitSeq}`;
        const matches = allProjFiles.filter(
          (pf) =>
            Math.abs(pf.startSec - segStartSec) < 2 &&
            Math.abs(pf.endSec - segEndSec) < 2,
        );
        if (matches.length > 0) map[key] = matches;
      });
    });
    return map;
  }, [files, projects, projectFilesMap]);

  const fileGridRows = useMemo(() => {
    const rows = [];
    const visibleFiles =
      !isAdmin() && myAssignedFileNos
        ? files.filter((f) => myAssignedFileNos.has(f.fileNo))
        : files;
    visibleFiles.forEach((file) => {
      rows.push({ ...file, _isSegmentRow: false });
      const hasSeg = file.splitTp === "1" && file.timeSegments?.length > 0;
      if (hasSeg && expandedFileNos.has(file.fileNo)) {
        file.timeSegments.forEach((seg) => {
          const key = `${file.fileNo}_${seg.splitSeq}`;
          rows.push({
            _isSegmentRow: true,
            _parentFileNo: file.fileNo,
            _rowId: `${file.fileNo}_seg_${seg.splitSeq}`,
            splitSeq: seg.splitSeq,
            splitTimeSt: seg.splitTimeSt,
            splitTimeEd: seg.splitTimeEd,
            splitTime: seg.splitTime,
            _projectMatches: segmentProjectMap[key] || [],
          });
        });
      }
    });
    return rows;
  }, [files, expandedFileNos, segmentProjectMap, isAdmin, myAssignedFileNos]);

  // VOD 분할파일 검수: 단일 파일이 N분할되어 있고 각 세그먼트(분할 프로젝트)가
  // 모두 REVIEW_DONE 일 때, 병합검수 모드 worktool 로 통합 검수 진입.
  // 미디어는 원본 파일을 그대로 사용 (WorkToolPage 가 files.length===1 분기 처리).
  const isFileSplitMergeReviewable = useCallback(
    (file) => {
      if (!file) return false;
      if (file.splitTp !== "1") return false;
      const segments = file.timeSegments;
      if (!segments?.length || segments.length < 2) return false;
      return segments.every((seg) => {
        const key = `${file.fileNo}_${seg.splitSeq}`;
        const matches = segmentProjectMap[key] || [];
        if (matches.length === 0) return false;
        return matches.every((m) =>
          ["REVIEW_DONE", "DONE"].includes(m.status),
        );
      });
    },
    [segmentProjectMap],
  );

  const handleSplitFileMergeReview = useCallback(
    (file) => {
      if (!isFileSplitMergeReviewable(file)) return;
      sessionStorage.setItem(
        "soribaro-merge-review",
        JSON.stringify({
          servCd,
          trnsYn,
          files: [{ fileNo: file.fileNo, playTm: 0 }],
        }),
      );
      const w = Math.round(screen.width * 0.9);
      const h = Math.round(screen.height * 0.9);
      const left = Math.round((screen.width - w) / 2);
      const top = Math.round((screen.height - h) / 2);
      window.open(
        toAppUrl(`/worktool?mode=merge&servCd=${servCd}&popup=true`),
        "mergeReview",
        `width=${w},height=${h},left=${left},top=${top}`,
      );
    },
    [isFileSplitMergeReviewable, servCd, trnsYn],
  );

  // ========== API 호출 ==========
  const fetchProjectFiles = useCallback(async (projectId) => {
    setProjectFilesMap((prev) => ({
      ...prev,
      [projectId]: { loading: true, data: prev[projectId]?.data || [] },
    }));
    try {
      const response = await getProjectFilesByProjectId(projectId);
      const d = response?.status === "SUCCESS" ? response.data || [] : [];
      setProjectFilesMap((prev) => ({
        ...prev,
        [projectId]: { loading: false, data: d },
      }));
    } catch {
      setProjectFilesMap((prev) => ({
        ...prev,
        [projectId]: { loading: false, data: [] },
      }));
    }
  }, []);

  // 웍스파이 상세 조회 (worksfyProjectKey 목록 기준)
  const fetchWorksfyDetails = useCallback(async (projectList) => {
    const keys = projectList
      .filter((p) => p.worksfyProjectKey)
      .map((p) => p.worksfyProjectKey);
    if (keys.length === 0) return;
    const results = await Promise.allSettled(
      keys.map((key) => getWorksfyProject(key)),
    );
    const newMap = {};
    results.forEach((result, idx) => {
      if (result.status === "fulfilled" && result.value?.status === "SUCCESS") {
        newMap[keys[idx]] = result.value.data;
      }
    });
    setWorksfyDetailsMap((prev) => ({ ...prev, ...newMap }));
  }, []);

  const fetchDetail = useCallback(
    async (isInitial = false) => {
      if (isInitial) {
        setLoading(true);
        setError(null);
      }
      setProjectsLoading(true);
      try {
        const res = await fetchDetailApi(servCd);
        if (res.status === "SUCCESS") {
          setData(res.data);
          const list = res.data?.projects || [];
          setProjects(list);
          if (isAdmin()) {
            setExpandedProjectIds(new Set(list.map((p) => p.id)));
          }
          list.forEach((p) => fetchProjectFiles(p.id));
          fetchWorksfyDetails(list);
          if (showRequestDetails) {
            setEditStenoMemo(res.data?.commInfo?.stenoMemo || "");
            setEditAdminMemo(res.data?.commInfo?.adminMemo || "");
            if (Array.isArray(res.data?.files) && res.data.files.length > 0) {
              setFiles(res.data.files);
              setFilesLoading(false);
            } else {
              try {
                const fRes = await getFilesByServCd(servCd);
                if (Array.isArray(fRes)) setFiles(fRes);
                else if (fRes?.status === "SUCCESS") setFiles(fRes.data || []);
                else if (Array.isArray(fRes?.data)) setFiles(fRes.data);
                else setFiles([]);
              } catch {
                setFiles([]);
              } finally {
                setFilesLoading(false);
              }
            }
            if (Array.isArray(res.data?.attachments)) {
              setAttachments(res.data.attachments);
              setAttachmentsLoading(false);
            } else {
              try {
                const aRes = await getAttachmentsByServCd(servCd);
                if (Array.isArray(aRes)) setAttachments(aRes);
                else if (aRes?.status === "SUCCESS")
                  setAttachments(aRes.data || []);
                else if (Array.isArray(aRes?.data)) setAttachments(aRes.data);
                else setAttachments([]);
              } catch {
                setAttachments([]);
              } finally {
                setAttachmentsLoading(false);
              }
            }
          }
        } else {
          if (isInitial) setError(res.message || t("common.loadDetailFailed"));
          setProjects([]);
        }
      } catch (err) {
        if (isInitial) setError(err.message || t("common.loadDetailFailed"));
        setProjects([]);
      } finally {
        if (isInitial) setLoading(false);
        setProjectsLoading(false);
      }
    },
    [servCd, fetchProjectFiles, fetchDetailApi, fetchWorksfyDetails],
  );

  useEffect(() => {
    if (servCd) fetchDetail(true);
  }, [servCd, fetchDetail]);

  useEffect(() => {
    if (isAdmin()) return;
    const ids = new Set();
    projects.forEach((project) => {
      const pf = projectFilesMap[project.id];
      if (
        pf?.data?.some((f) => f.workerId === membId || f.checkerId === membId)
      ) {
        ids.add(project.id);
      }
    });
    setExpandedProjectIds(ids);
  }, [projectFilesMap, projects, membId]);

  const visibleProjects = useMemo(() => {
    if (isAdmin()) return projects;
    return projects.filter((project) => {
      const pf = projectFilesMap[project.id];
      return pf?.data?.some(
        (f) => f.workerId === membId || f.checkerId === membId,
      );
    });
  }, [projects, projectFilesMap, membId, isAdmin]);

  const isProjectChecker = useCallback(
    (projectId) => {
      if (isAdmin()) return true;
      const pf = projectFilesMap[projectId];
      return pf?.data?.some((f) => f.checkerId === membId);
    },
    [projectFilesMap, membId, isAdmin],
  );

  // 현재 의뢰(serv) 내 어느 파일이든 검수자로 배정되어 있는지
  const isAnyChecker = useMemo(() => {
    if (isAdmin()) return true;
    return projects.some((project) => {
      const pf = projectFilesMap[project.id];
      return pf?.data?.some((f) => f.checkerId === membId);
    });
  }, [projects, projectFilesMap, membId, isAdmin]);

  useEffect(() => {
    if (showRequestDetails) return;
    const fetchFiles = async () => {
      setFilesLoading(true);
      try {
        const response = await getFilesByServCd(servCd);
        if (Array.isArray(response)) setFiles(response);
        else if (response?.status === "SUCCESS") setFiles(response.data || []);
        else if (Array.isArray(response?.data)) setFiles(response.data);
        else setFiles([]);
      } catch {
        setFiles([]);
      } finally {
        setFilesLoading(false);
      }
    };
    if (servCd) fetchFiles();
  }, [servCd, showRequestDetails]);

  const [bssType, setBssType] = useState(null);
  const [bssTypeOptions, setBssTypeOptions] = useState([]);

  const refetchDifficulties = useCallback(async (nextBssType) => {
    if (!nextBssType) {
      setDifficultyOptions([]);
      return;
    }
    try {
      const fdRes = await getFileDifficulties({ bssTypeCd: nextBssType });
      setDifficultyOptions(fdRes.status === "SUCCESS" ? fdRes.data || [] : []);
    } catch {
      setDifficultyOptions([]);
    }
  }, []);

  useEffect(() => {
    const fetchServAndDifficulties = async () => {
      try {
        const servRes = await getServByServCd(servCd);
        const currentBssType =
          servRes.status === "SUCCESS" ? servRes.data?.bssType || null : null;
        if (servRes.status === "SUCCESS") {
          setOverallStatus(servRes.data?.overallStatus ?? null);
          setTrnsYn(servRes.data?.trnsYn ?? "N");
          setCnlYn(servRes.data?.cnlYn ?? "N");
          setBssType(currentBssType);
        }
        await refetchDifficulties(currentBssType);
      } catch {
        /* silent */
      }
    };
    if (servCd) fetchServAndDifficulties();
  }, [servCd, refetchDifficulties]);

  // BSS_TYPE 공통코드 옵션 로드 (ADMIN 전용 셀렉터 용도)
  useEffect(() => {
    if (!isAdmin()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getCommonCodes("BSS_TYPE");
        if (!cancelled && res?.status === "SUCCESS") {
          setBssTypeOptions(res.data || []);
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const handleBssTypeChange = useCallback(
    async (nextBssType) => {
      if (!servCd || !nextBssType || nextBssType === bssType) return;
      try {
        const res = await updateServBssType(servCd, nextBssType);
        if (res?.status === "SUCCESS") {
          setBssType(nextBssType);
          await refetchDifficulties(nextBssType);
          toast.success("의뢰 유형이 변경되었습니다.");
        } else {
          toast.error(res?.message || "의뢰 유형 변경에 실패했습니다.");
        }
      } catch (err) {
        toast.error(err?.message || "의뢰 유형 변경 중 오류가 발생했습니다.");
      }
    },
    [servCd, bssType, refetchDifficulties],
  );

  useEffect(() => {
    if (showRequestDetails) return;
    const fetchAttachments = async () => {
      setAttachmentsLoading(true);
      try {
        const response = await getAttachmentsByServCd(servCd);
        if (Array.isArray(response)) setAttachments(response);
        else if (response?.status === "SUCCESS")
          setAttachments(response.data || []);
        else if (Array.isArray(response?.data)) setAttachments(response.data);
        else setAttachments([]);
      } catch {
        setAttachments([]);
      } finally {
        setAttachmentsLoading(false);
      }
    };
    if (servCd) fetchAttachments();
  }, [servCd, showRequestDetails]);

  const refreshAttachments = useCallback(async () => {
    try {
      const response = await getAttachmentsByServCd(servCd);
      if (Array.isArray(response)) setAttachments(response);
      else if (response?.status === "SUCCESS")
        setAttachments(response.data || []);
      else if (Array.isArray(response?.data)) setAttachments(response.data);
    } catch {
      /* silent */
    }
  }, [servCd]);

  const refreshFiles = useCallback(async () => {
    try {
      const response = await getFilesByServCd(servCd);
      if (Array.isArray(response)) setFiles(response);
      else if (response?.status === "SUCCESS") setFiles(response.data || []);
      else if (Array.isArray(response?.data)) setFiles(response.data);
    } catch {
      /* silent */
    }
  }, [servCd]);

  const handleDifficultyChange = useCallback(
    async (fileNo, fileDifficultId) => {
      try {
        const res = await updateFileDifficultyByFileNo(fileNo, fileDifficultId);
        if (res.status === "SUCCESS") refreshFiles();
        else alert(res.message || t("enterprise.difficultyChangeFailed"));
      } catch (err) {
        alert(err.message || t("enterprise.difficultyChangeFailed"));
      }
    },
    [refreshFiles],
  );

  const handleBulkDifficultyApply = useCallback(async () => {
    if (!bulkDifficultyId || selectedFileNos.size === 0) return;
    setApplyingBulkDifficulty(true);
    try {
      const targets = [...selectedFileNos];
      await Promise.all(
        targets.map((fileNo) =>
          updateFileDifficultyByFileNo(fileNo, Number(bulkDifficultyId)),
        ),
      );
      toast.success(
        t("enterprise.bulkDifficultySuccess", { count: targets.length }),
      );
      refreshFiles();
      setBulkDifficultyId("");
    } catch (err) {
      toast.error(err.message || t("enterprise.difficultyChangeFailed"));
    } finally {
      setApplyingBulkDifficulty(false);
    }
  }, [bulkDifficultyId, selectedFileNos, refreshFiles, t]);

  const handleTogglePlay = useCallback(
    async (fileNo) => {
      if (playingFileNo === fileNo) {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
        }
        setPlayingFileNo(null);
        setStreamUrl(null);
        return;
      }
      try {
        const res = await getFileStreamUrl(fileNo);
        const d = res?.data || res;
        const url = d?.url;
        if (url) {
          setPlayingFileNo(fileNo);
          setStreamUrl(url);
        } else {
          alert(res?.message || t("enterprise.streamUrlFailed"));
        }
      } catch (err) {
        alert(err.message || t("enterprise.streamUrlFailed"));
      }
    },
    [playingFileNo],
  );

  // ========== 첨부파일 핸들러 ==========
  const openAttachmentUploadModal = useCallback(() => {
    setUploadSelectedFiles([]);
    setAttachmentUploadModal(true);
  }, []);
  const closeAttachmentUploadModal = useCallback(() => {
    setAttachmentUploadModal(false);
    setUploadSelectedFiles([]);
    if (attachmentFileInputRef.current)
      attachmentFileInputRef.current.value = "";
  }, []);
  const handleAttachmentFileSelect = useCallback((e) => {
    const newFiles = Array.from(e.target.files || []);
    setUploadSelectedFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const unique = newFiles.filter(
        (f) => !existing.has(`${f.name}_${f.size}`),
      );
      return [...prev, ...unique];
    });
    if (attachmentFileInputRef.current)
      attachmentFileInputRef.current.value = "";
  }, []);
  const handleRemoveSelectedFile = useCallback((index) => {
    setUploadSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAttachmentUploadSubmit = useCallback(async () => {
    if (uploadSelectedFiles.length === 0) {
      alert(t("common.alertSelectFileToUpload"));
      return;
    }
    setUploadingAttachment(true);
    try {
      for (const file of uploadSelectedFiles) {
        const res = await uploadSharedFile(
          file,
          servCd,
          !isAdmin() ? { shareYn: "Y" } : {},
        );
        if (res.status !== "SUCCESS" && !res.data) {
          alert(res.message || t("common.fileUploadFailed"));
          break;
        }
      }
      await refreshAttachments();
      closeAttachmentUploadModal();
    } catch (err) {
      alert(err.message || t("common.fileUploadFailed"));
    } finally {
      setUploadingAttachment(false);
    }
  }, [
    servCd,
    uploadSelectedFiles,
    refreshAttachments,
    closeAttachmentUploadModal,
  ]);

  const handleAttachmentDownload = useCallback(async (fileNo, fileTp) => {
    try {
      const tp = String(fileTp);
      const apiFn =
        tp === "8" || tp === "9"
          ? getCustomerFileDownloadUrl
          : getSharedFileDownloadUrl;
      const res = await apiFn(fileNo);
      const d = res?.data || res;
      if (d?.downloadUrl) window.open(d.downloadUrl, "_blank");
      else alert(res?.message || t("common.downloadUrlFailed"));
    } catch (err) {
      alert(err.message || t("common.downloadUrlFailed"));
    }
  }, []);

  const handleAttachmentDelete = useCallback(
    async (fileNo) => {
      if (!confirm(t("common.confirmDeleteAttachment"))) return;
      try {
        const res = await deleteSharedFiles([String(fileNo)]);
        if (res.status === "SUCCESS" || res.data) await refreshAttachments();
        else alert(res.message || t("common.fileDeleteFailed"));
      } catch (err) {
        alert(err.message || t("common.fileDeleteFailed"));
      }
    },
    [refreshAttachments],
  );

  // ========== 프로젝트 핸들러 ==========
  const fetchProjects = useCallback(() => fetchDetail(false), [fetchDetail]);

  const handleToggleProject = useCallback(
    (projectId) => {
      setExpandedProjectIds((prev) => {
        const next = new Set(prev);
        if (next.has(projectId)) next.delete(projectId);
        else {
          next.add(projectId);
          if (!projectFilesMap[projectId]?.data?.length)
            fetchProjectFiles(projectId);
        }
        return next;
      });
    },
    [projectFilesMap, fetchProjectFiles],
  );

  const openCreateProjectModal = useCallback(() => {
    if (files.some((f) => !f.fileDifficultId)) {
      toast.warning(t("enterprise.toastDifficultyRequired"));
      return;
    }
    setProjectModal({ open: true, mode: "create", data: null });
  }, [files, t]);
  const openEditProjectModal = useCallback(
    (project) => setProjectModal({ open: true, mode: "edit", data: project }),
    [],
  );
  const closeProjectModal = useCallback(
    () => setProjectModal({ open: false, mode: "create", data: null }),
    [],
  );

  const handleProjectSubmit = useCallback(
    async (formData) => {
      setProjectModalSubmitting(true);
      try {
        if (projectModal.mode === "create") {
          const response = await createProject({
            servCd,
            ...formData,
            type: "START",
          });
          if (response?.status === "SUCCESS") {
            closeProjectModal();
            await fetchProjects();
          } else
            alert(response?.message || t("enterprise.projectCreateFailed"));
        } else {
          const response = await updateProject(projectModal.data.id, {
            ...formData,
            type: "START",
          });
          if (response?.status === "SUCCESS") {
            const worksfyKey = projectModal.data.worksfyProjectKey;
            if (worksfyKey) {
              try {
                await updateWorksfyProject(worksfyKey, {
                  title: formData.title,
                  contents: formData.description || "",
                  applStrtDt: toYMDHM(formData.recruitStart),
                  applEndDt: toYMDHM(formData.recruitEnd),
                  wrkStrtDt: toYMD(formData.workStart),
                  wrkEndDt: toYMD(formData.workEnd),
                  applQualCd: formData.isAnyWorker ? "anyone" : "01",
                  applCnt: String(formData.workerCnt ?? 1),
                  unitPric: formData.price ?? "0",
                  fixYn: formData.isImportant ? "Y" : "N",
                });
              } catch (worksfyErr) {
                console.error("웍스파이 프로젝트 수정 실패:", worksfyErr);
              }
            }
            closeProjectModal();
            await fetchProjects();
          } else
            alert(response?.message || t("enterprise.projectUpdateFailed"));
        }
      } catch (err) {
        alert(err.message || t("enterprise.processingError"));
      } finally {
        setProjectModalSubmitting(false);
      }
    },
    [projectModal, servCd, closeProjectModal, fetchProjects],
  );

  const handleDeleteProject = useCallback(
    async (projectId) => {
      if (!confirm(t("enterprise.confirmDeleteProject"))) return;
      try {
        const response = await deleteProject(projectId);
        if (response?.status === "SUCCESS") await fetchProjects();
        else alert(response?.message || t("enterprise.projectDeleteFailed"));
      } catch (err) {
        alert(err.message || t("enterprise.projectDeleteError"));
      }
    },
    [fetchProjects],
  );

  const openFileAddModal = useCallback(
    (projectId) => setFileAddModal({ open: true, projectId }),
    [],
  );
  const closeFileAddModal = useCallback(
    () => setFileAddModal({ open: false, projectId: null }),
    [],
  );

  const handleFileAddSubmit = useCallback(
    async (items) => {
      const { projectId } = fileAddModal;
      if (!projectId || !items?.length) return;
      setFileAddSubmitting(true);
      try {
        const batchPayload = items.map((f) => ({
          projectId,
          fileNo: f.fileNo,
          isSplit: f.isSplit,
          splitSeq: f.splitSeq || (f.isSplit ? 1 : undefined),
          startSec: f.startSec,
          endSec: f.endSec,
        }));
        let response;
        try {
          response = await createProjectFiles(batchPayload);
        } catch (batchErr) {
          if (batchErr?.status === 404 || batchErr?.code === 404) {
            const results = await Promise.all(
              batchPayload.map((f) => createProjectFile(f)),
            );
            const failed = results.filter((r) => r?.status !== "SUCCESS");
            response =
              failed.length === 0
                ? { status: "SUCCESS" }
                : { status: "FAILURE", message: `${failed.length}건 실패` };
          } else throw batchErr;
        }
        if (response?.status === "SUCCESS") {
          closeFileAddModal();
          await fetchProjectFiles(projectId);
        } else alert(response?.message || t("enterprise.fileAddFailed"));
      } catch (err) {
        alert(err.message || t("enterprise.fileAddError"));
      } finally {
        setFileAddSubmitting(false);
      }
    },
    [fileAddModal, closeFileAddModal, fetchProjectFiles],
  );

  // 웍스파이
  const openWorksfyRegisterModal = useCallback(
    (project) => setWorksfyRegisterModal({ open: true, project }),
    [],
  );
  const closeWorksfyRegisterModal = useCallback(
    () => setWorksfyRegisterModal({ open: false, project: null }),
    [],
  );

  const handleWorksfyRegisterSubmit = useCallback(
    async (worksfyData) => {
      setWorksfyRegisterSubmitting(true);
      try {
        const response = await createWorksfyProject(worksfyData);
        if (response?.status === "SUCCESS") {
          const worksfyId = response.data?.id;
          if (worksfyId && worksfyRegisterModal.project?.id)
            await updateProject(worksfyRegisterModal.project.id, {
              worksfyProjectKey: worksfyId,
            });
          closeWorksfyRegisterModal();
          await fetchProjects();
        } else
          alert(response?.message || t("enterprise.worksfyRegisterFailed"));
      } catch (err) {
        alert(err.message || t("enterprise.worksfyRegisterError"));
      } finally {
        setWorksfyRegisterSubmitting(false);
      }
    },
    [worksfyRegisterModal, closeWorksfyRegisterModal, fetchProjects],
  );

  // 웍스파이 프로젝트 마감
  const handleCloseWorksfyProject = useCallback(async (project) => {
    const key = project?.worksfyProjectKey;
    if (!key) return;
    if (!window.confirm(t("enterprise.worksfyCloseConfirm"))) return;

    setWorksfyClosingKeys((prev) => new Set(prev).add(key));
    try {
      const closeRes = await closeWorksfyProject(key);
      if (closeRes?.status === "SUCCESS") {
        const detailRes = await getWorksfyProject(key);
        if (detailRes?.status === "SUCCESS") {
          setWorksfyDetailsMap((prev) => ({ ...prev, [key]: detailRes.data }));
        }
      } else {
        alert(closeRes?.message || t("enterprise.worksfyCloseFailed"));
      }
    } catch (err) {
      alert(err.message || t("enterprise.worksfyCloseError"));
    } finally {
      setWorksfyClosingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const openWorksfyApplicantsModal = useCallback((worksfyProjectKey) => {
    if (!worksfyProjectKey) {
      alert(t("enterprise.alertWorksfyRegisterFirst"));
      return;
    }
    setWorksfyApplicantsModal({ open: true, worksfyProjectKey });
  }, []);
  const closeWorksfyApplicantsModal = useCallback(
    () => setWorksfyApplicantsModal({ open: false, worksfyProjectKey: null }),
    [],
  );

  // 작업자/검수자 배정
  const openWorkerAssignModal = useCallback(
    (project, pFile) =>
      setWorkerAssignModal({
        open: true,
        projectId: project.id,
        projectFileId: pFile.id,
        worksfyProjectKey: project.worksfyProjectKey || null,
      }),
    [],
  );
  const closeWorkerAssignModal = useCallback(
    () =>
      setWorkerAssignModal({
        open: false,
        projectId: null,
        projectFileId: null,
        worksfyProjectKey: null,
      }),
    [],
  );

  const handleWorkerAssign = useCallback(
    async (workerId) => {
      const { projectId, projectFileId } = workerAssignModal;
      if (!projectFileId) return;
      setWorkerAssigning(true);
      try {
        const response = await updateProjectFileWorkerId(
          projectFileId,
          workerId,
        );
        if (response?.status === "SUCCESS") {
          closeWorkerAssignModal();
          if (projectId) await fetchProjectFiles(projectId);
        } else alert(response?.message || t("enterprise.workerAssignFailed"));
      } catch (err) {
        alert(err.message || t("enterprise.workerAssignError"));
      } finally {
        setWorkerAssigning(false);
      }
    },
    [workerAssignModal, closeWorkerAssignModal, fetchProjectFiles],
  );

  const handleWorkerBatchAssign = useCallback(
    async (workerId) => {
      const { projectId } = workerAssignModal;
      if (!projectId) return;
      setBatchAssignModal((prev) => ({ ...prev, open: false, loading: true }));
      try {
        const res = await getProjectFilesByProjectId(projectId);
        if (res?.status !== "SUCCESS") {
          alert(t("enterprise.workerAssignFailed"));
          return;
        }
        const pfList = res.data || [];
        if (pfList.length === 0) {
          alert(t("workerAssign.batchAssignNoTarget", { ns: "common" }));
          return;
        }
        setBatchAssignModal({
          open: true,
          projectId,
          assigneeId: workerId,
          type: "worker",
          projectFiles: pfList,
          loading: false,
        });
      } catch (err) {
        alert(err.message || t("enterprise.workerAssignError"));
        setBatchAssignModal((prev) => ({ ...prev, loading: false }));
      }
    },
    [workerAssignModal, t],
  );

  const handleWorkerRemove = useCallback(
    async (projectId, projectFileId) => {
      if (!window.confirm(t("enterprise.confirmRemoveWorker"))) return;
      try {
        const response = await updateProjectFileWorkerId(projectFileId, null);
        if (response?.status === "SUCCESS") {
          if (projectId) await fetchProjectFiles(projectId);
        } else alert(response?.message || t("enterprise.workerRemoveFailed"));
      } catch (err) {
        alert(err.message || t("enterprise.workerRemoveError"));
      }
    },
    [fetchProjectFiles],
  );

  const openCheckerAssignModal = useCallback(
    (project, pFile) =>
      setCheckerAssignModal({
        open: true,
        projectId: project.id,
        projectFileId: pFile.id,
        worksfyProjectKey: project.worksfyProjectKey || null,
      }),
    [],
  );
  const closeCheckerAssignModal = useCallback(
    () =>
      setCheckerAssignModal({
        open: false,
        projectId: null,
        projectFileId: null,
        worksfyProjectKey: null,
      }),
    [],
  );

  const handleCheckerAssign = useCallback(
    async (checkerId) => {
      const { projectId, projectFileId } = checkerAssignModal;
      if (!projectFileId) return;
      setCheckerAssigning(true);
      try {
        const response = await updateProjectFileCheckerId(
          projectFileId,
          checkerId,
        );
        if (response?.status === "SUCCESS") {
          closeCheckerAssignModal();
          if (projectId) await fetchProjectFiles(projectId);
        } else alert(response?.message || t("enterprise.checkerAssignFailed"));
      } catch (err) {
        alert(err.message || t("enterprise.checkerAssignError"));
      } finally {
        setCheckerAssigning(false);
      }
    },
    [checkerAssignModal, closeCheckerAssignModal, fetchProjectFiles],
  );

  const handleCheckerBatchAssign = useCallback(
    async (checkerId) => {
      const { projectId } = checkerAssignModal;
      if (!projectId) return;
      setBatchAssignModal((prev) => ({ ...prev, open: false, loading: true }));
      try {
        const res = await getProjectFilesByProjectId(projectId);
        if (res?.status !== "SUCCESS") {
          alert(t("enterprise.checkerAssignFailed"));
          return;
        }
        const pfList = res.data || [];
        if (pfList.length === 0) {
          alert(t("workerAssign.batchAssignNoTarget", { ns: "common" }));
          return;
        }
        setBatchAssignModal({
          open: true,
          projectId,
          assigneeId: checkerId,
          type: "checker",
          projectFiles: pfList,
          loading: false,
        });
      } catch (err) {
        alert(err.message || t("enterprise.checkerAssignError"));
        setBatchAssignModal((prev) => ({ ...prev, loading: false }));
      }
    },
    [checkerAssignModal, t],
  );

  const handleBatchAssignConfirm = useCallback(
    async (selectedFileIds) => {
      const { projectId, assigneeId, type } = batchAssignModal;
      if (!projectId || !assigneeId || selectedFileIds.length === 0) return;

      const isWorker = type === "worker";
      const setAssigning = isWorker ? setWorkerAssigning : setCheckerAssigning;
      const updateFn = isWorker
        ? updateProjectFileWorkerId
        : updateProjectFileCheckerId;
      const closeAssignModal = isWorker
        ? closeWorkerAssignModal
        : closeCheckerAssignModal;

      setAssigning(true);
      try {
        await Promise.all(
          selectedFileIds.map((id) => updateFn(id, assigneeId)),
        );
        alert(
          t("workerAssign.batchAssignSuccess", {
            ns: "common",
            count: selectedFileIds.length,
          }),
        );
        setBatchAssignModal((prev) => ({ ...prev, open: false }));
        closeAssignModal();
        await fetchProjectFiles(projectId);
      } catch (err) {
        alert(err.message || t("enterprise.workerAssignError"));
      } finally {
        setAssigning(false);
      }
    },
    [
      batchAssignModal,
      closeWorkerAssignModal,
      closeCheckerAssignModal,
      fetchProjectFiles,
      t,
    ],
  );

  const closeBatchAssignModal = useCallback(() => {
    setBatchAssignModal((prev) => ({ ...prev, open: false }));
  }, []);

  const handleCheckerRemove = useCallback(
    async (projectId, projectFileId) => {
      if (!window.confirm(t("enterprise.confirmRemoveChecker"))) return;
      try {
        const response = await updateProjectFileCheckerId(projectFileId, null);
        if (response?.status === "SUCCESS") {
          if (projectId) await fetchProjectFiles(projectId);
        } else alert(response?.message || t("enterprise.checkerRemoveFailed"));
      } catch (err) {
        alert(err.message || t("enterprise.checkerRemoveError"));
      }
    },
    [fetchProjectFiles],
  );

  const handleDeleteProjectFile = useCallback(
    async (projectId, projectFileId) => {
      if (!confirm(t("enterprise.confirmDeleteProjectFile"))) return;
      try {
        const response = await deleteProjectFile(projectFileId);
        if (response?.status === "SUCCESS") await fetchProjectFiles(projectId);
        else alert(response?.message || t("enterprise.deleteFailed"));
      } catch (err) {
        alert(err.message || t("enterprise.deleteError"));
      }
    },
    [fetchProjectFiles],
  );

  const updateProjectFileStatus = useCallback(
    (projectId, fileId, fromStatus, toStatus) => {
      setProjectFilesMap((prev) => {
        const entry = prev[projectId];
        if (!entry?.data) return prev;
        return {
          ...prev,
          [projectId]: {
            ...entry,
            data: entry.data.map((f) =>
              f.id === fileId && f.status === fromStatus
                ? { ...f, status: toStatus }
                : f,
            ),
          },
        };
      });
    },
    [],
  );

  const handleGoWork = useCallback(
    (project, pFile) => {
      const isWorkerBlocked =
        !isAdmin() &&
        pFile?.workerId === membId &&
        isWorkStartBlockedStatus(pFile?.status);

      const playTm = pFile.isSplit
        ? pFile.endSec - pFile.startSec
        : fileMap[pFile.fileNo]?.playTm || 0;
      const path = buildWorktoolPath({
        projectFileId: pFile.id,
        fileNo: pFile.fileNo,
        servCd,
        role: "START",
        isSplit: !!pFile.isSplit,
        startSec: pFile.startSec,
        endSec: pFile.endSec,
        playTm,
        readonly: isWorkerBlocked,
        popup: true,
        workCategory,
      });
      window.open(toAppUrl(path), `worktool_${pFile.id}`, "popup,width=1400,height=900");
      if (!isWorkerBlocked) {
        updateProjectFileStatus(project.id, pFile.id, "STANDBY", "WORKING");
        updateProjectFileStatus(
          project.id,
          pFile.id,
          "REVIEW_REJECT",
          "WORKING",
        );
      }
    },
    [isAdmin, membId, servCd, fileMap, updateProjectFileStatus, workCategory],
  );

  const handleGoReview = useCallback(
    (project, pFile) => {
      const playTm = pFile.isSplit
        ? pFile.endSec - pFile.startSec
        : fileMap[pFile.fileNo]?.playTm || 0;
      const path = buildWorktoolPath({
        projectFileId: pFile.id,
        fileNo: pFile.fileNo,
        servCd,
        role: "START_REVIEW",
        isSplit: !!pFile.isSplit,
        startSec: pFile.startSec,
        endSec: pFile.endSec,
        playTm,
        popup: true,
        workCategory,
      });
      window.open(toAppUrl(path), `worktool_${pFile.id}`, "popup,width=1400,height=900");
      updateProjectFileStatus(project.id, pFile.id, "WORK_DONE", "REVIEWING");
    },
    [servCd, fileMap, updateProjectFileStatus, workCategory],
  );

  const handleOpenWorkTimeEdit = useCallback(
    (project, pFile) => {
      if (!isAdmin()) return;
      const srcFile = fileMap[pFile.fileNo];
      setWorkTimeEditModal({
        open: true,
        projectId: project.id,
        projectFile: pFile,
        fileName: srcFile?.fileNm || `#${pFile.fileNo}`,
      });
    },
    [isAdmin, fileMap],
  );

  const handleCloseWorkTimeEdit = useCallback(() => {
    setWorkTimeEditModal({
      open: false,
      projectId: null,
      projectFile: null,
      fileName: "",
    });
  }, []);

  const handleWorkTimeSaved = useCallback((updatedPFile) => {
    if (!updatedPFile?.id) return;
    setProjectFilesMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((projectId) => {
        const slot = next[projectId];
        if (!slot?.data) return;
        const idx = slot.data.findIndex((f) => f.id === updatedPFile.id);
        if (idx >= 0) {
          const newData = slot.data.slice();
          newData[idx] = { ...newData[idx], ...updatedPFile };
          next[projectId] = { ...slot, data: newData };
        }
      });
      return next;
    });
  }, []);

  const handleSaveStenoMemo = useCallback(async () => {
    setSavingStenoMemo(true);
    try {
      const res = await updateStenoMemo(servCd, editStenoMemo);
      if (res.status === "SUCCESS" || res.status === 200) {
        alert(t("enterprise.alertMemoSaved"));
        setData((prev) =>
          prev
            ? {
                ...prev,
                commInfo: { ...prev.commInfo, stenoMemo: editStenoMemo },
              }
            : prev,
        );
      } else alert(res.message || t("enterprise.alertMemoSaveFailed"));
    } catch (err) {
      alert(err.message || t("enterprise.alertMemoSaveFailed"));
    } finally {
      setSavingStenoMemo(false);
    }
  }, [servCd, editStenoMemo, t]);

  const handleSaveAdminMemo = useCallback(async () => {
    setSavingAdminMemo(true);
    try {
      const res = await updateAdminMemo(servCd, editAdminMemo);
      if (res.status === "SUCCESS" || res.status === 200) {
        alert(t("enterprise.alertMemoSaved"));
        setData((prev) =>
          prev
            ? {
                ...prev,
                commInfo: { ...prev.commInfo, adminMemo: editAdminMemo },
              }
            : prev,
        );
      } else alert(res.message || t("enterprise.alertMemoSaveFailed"));
    } catch (err) {
      alert(err.message || t("enterprise.alertMemoSaveFailed"));
    } finally {
      setSavingAdminMemo(false);
    }
  }, [servCd, editAdminMemo, t]);

  const handleToggleShare = useCallback(async () => {
    if (selectedAttFileNos.size === 0) return;
    setSavingShare(true);
    try {
      const filesPayload = visibleAttachments
        .filter((a) => selectedAttFileNos.has(a.fileNo))
        .map((a) => ({
          fileNo: Number(a.fileNo),
          shareYn: a.shareYn === "Y" ? "N" : "Y",
        }));
      const res = await updateAttachmentShare(servCd, filesPayload);
      if (res.status === "SUCCESS" || res.status === 200) {
        await refreshAttachments();
        setSelectedAttFileNos(new Set());
      } else alert(res.message || t("enterprise.alertShareSaveFailed"));
    } catch (err) {
      alert(err.message || t("enterprise.alertShareSaveFailed"));
    } finally {
      setSavingShare(false);
    }
  }, [servCd, selectedAttFileNos, visibleAttachments, refreshAttachments, t]);

  const handleBulkAttachmentDownload = useCallback(async () => {
    const selected = visibleAttachments.filter((a) =>
      selectedAttFileNos.has(a.fileNo),
    );
    for (let i = 0; i < selected.length; i++) {
      const att = selected[i];
      try {
        const tp = String(att.fileTp);
        const apiFn =
          tp === "8" || tp === "9"
            ? getCustomerFileDownloadUrl
            : getSharedFileDownloadUrl;
        const res = await apiFn(att.fileNo);
        const d = res?.data ?? res;
        if (d?.downloadUrl) {
          triggerDownloadViaIframe(d.downloadUrl);
          if (i < selected.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
      } catch {
        /* silent */
      }
    }
  }, [selectedAttFileNos, visibleAttachments]);

  // ========== AG Grid 설정 (파일 섹션) ==========
  const gridRef = useRef(null);

  const fileColumnDefs = useMemo(
    () => [
      ...(isAdmin() || myAssignedFileNos?.size > 0
        ? [
            {
              headerCheckboxSelection: true,
              checkboxSelection: (params) => !params.data?._isSegmentRow,
              width: 50,
              sortable: false,
              resizable: false,
              suppressHeaderMenuButton: true,
            },
          ]
        : []),
      {
        field: "fileNo",
        headerName: t("enterprise.columnNo"),
        width: 100,
        cellClass: "ag-cell-center",
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          return params.data?.fileNo;
        },
      },
      {
        field: "fileNm",
        headerName: t("enterprise.columnFileName"),
        flex: 1,
        minWidth: 200,
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) {
            return (
              <span className="segment-cell-name">
                {t("enterprise.segmentRowLabel", {
                  seq: params.data.splitSeq,
                  start: params.data.splitTimeSt,
                  end: params.data.splitTimeEd,
                })}
              </span>
            );
          }
          return params.data?.fileNm || "";
        },
        tooltipValueGetter: (params) =>
          params.data?._isSegmentRow ? null : params.data?.fileNm,
      },
      {
        headerName: t("enterprise.columnFileSplit"),
        width: 120,
        cellClass: "ag-cell-center",
        sortable: false,
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          const isAssigned = assignedFileNos.has(params.data?.fileNo);
          if (isAssigned) {
            return (
              <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                {t("enterprise.fileAssigned")}
              </span>
            );
          }
          if (!isAdmin()) {
            return params.data?.splitTp === "1"
              ? t("enterprise.splitTpPartial")
              : "-";
          }
          return (
            <button
              className="file-split-btn"
              onClick={(e) => {
                e.stopPropagation();
                openFileSplitModal(params.data);
              }}
            >
              {t("enterprise.fileSplitButton")}
            </button>
          );
        },
      },
      {
        headerName: t("enterprise.columnSplitYn"),
        width: 120,
        cellClass: "ag-cell-center",
        sortable: false,
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          const isSplitFile =
            params.data?.splitTp === "1" &&
            params.data?.timeSegments?.length > 0;
          if (!isSplitFile) return t("enterprise.splitTpFull");
          const isExpanded = expandedFileNos.has(params.data.fileNo);
          return (
            <button
              className="segment-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleFileExpand(params.data.fileNo);
              }}
            >
              <span className="segment-toggle-arrow">
                {isExpanded ? "▼" : "▶"}
              </span>
              {t("enterprise.splitTpPartial")}
              <span className="segment-toggle-count">
                ({params.data.timeSegments.length})
              </span>
            </button>
          );
        },
      },
      {
        field: "fileDifficultId",
        headerName: t("enterprise.columnDifficulty"),
        width: 150,
        cellClass: "ag-cell-center",
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          if (!difficultyOptions.length || !isAdmin()) {
            const did = params.data?.fileDifficultId;
            const fdKey = did ? `common.difficulty_${did}` : "";
            const fdTranslated = fdKey ? t(fdKey) : "";
            return fdTranslated && fdTranslated !== fdKey
              ? fdTranslated
              : params.data?.fileDifficultName || "-";
          }
          return (
            <Select
              size="small"
              value={params.value || ""}
              onChange={(e) =>
                handleDifficultyChange(
                  params.data.fileNo,
                  Number(e.target.value),
                )
              }
              displayEmpty
              variant="standard"
              sx={{
                fontSize: "12px",
                minWidth: 100,
                "& .MuiSelect-select": { py: "2px" },
              }}
            >
              <MenuItem value="" disabled>
                <em>{t("enterprise.selectDifficulty")}</em>
              </MenuItem>
              {difficultyOptions.map((d) => {
                const dKey = `common.difficulty_${d.id}`;
                const dTranslated = t(dKey);
                return (
                  <MenuItem key={d.id} value={d.id} sx={{ fontSize: "12px" }}>
                    {dTranslated !== dKey ? dTranslated : d.name}
                  </MenuItem>
                );
              })}
            </Select>
          );
        },
      },
      {
        field: "playTm",
        headerName: t("enterprise.columnPlayTime"),
        width: 110,
        cellClass: "ag-cell-center",
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow)
            return formatSec(params.data.splitTime);
          const d = params.data;
          if (d?.splitTp === "1" && d?.timeSegments?.length > 0) {
            const total = d.timeSegments.reduce(
              (sum, seg) => sum + (seg.splitTime || 0),
              0,
            );
            return formatSec(total);
          }
          return formatSec(params.value);
        },
      },
      {
        field: "fileSize",
        headerName: t("enterprise.columnFileSize"),
        width: 120,
        cellClass: "ag-cell-center",
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          return formatFileSize(params.value);
        },
      },
      {
        field: "overallStatus",
        headerName: t("enterprise.columnStatus"),
        width: 180,
        cellClass: "ag-cell-center",
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) {
            const matches = params.data._projectMatches;
            if (!matches || matches.length === 0) {
              return (
                <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                  {t("enterprise.segmentUnassigned")}
                </span>
              );
            }
            return (
              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                {matches.map((m, idx) => (
                  <Chip
                    key={idx}
                    label={t(`common.status_${m.status || "STANDBY"}`)}
                    size="small"
                    variant="outlined"
                    sx={{
                      fontSize: "10px",
                      height: "20px",
                      fontWeight: 500,
                      ...getProjectStatusChipSx(m.status || "STANDBY"),
                    }}
                  />
                ))}
              </div>
            );
          }
          const info = FILE_STATUSES.find((s) => s.status === params.value);
          if (!info) return params.value || "-";
          return (
            <Chip
              label={t(`common.status_${info.status}`)}
              size="small"
              variant="outlined"
              sx={{
                ...getProjectStatusChipSx(info.status),
                fontWeight: 500,
                fontSize: "11px",
                height: "22px",
              }}
            />
          );
        },
      },
      {
        headerName: "재인코딩",
        width: 110,
        cellClass: "ag-cell-center",
        sortable: false,
        hide: !isAdmin(),
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          if (!isAdmin()) return null;
          const name = (params.data?.fileNm || "").toLowerCase();
          if (!name.endsWith(".mp3")) return null;
          return (
            <button
              className="pf-review-btn"
              title="VBR mp3 의 Chrome seek 어긋남을 CBR 재인코딩으로 해결합니다."
              onClick={(e) => {
                e.stopPropagation();
                setNormalizeMp3Modal({
                  open: true,
                  fileNo: params.data.fileNo,
                  fileNm: params.data.fileNm || "",
                });
              }}
            >
              재인코딩
            </button>
          );
        },
      },
      {
        headerName: t("enterprise.columnPlay"),
        width: 100,
        cellClass: "ag-cell-center",
        sortable: false,
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          return (
            <button
              className={`file-stream-btn ${playingFileNo === params.data?.fileNo ? "playing" : ""}`}
              onClick={() => handleTogglePlay(params.data.fileNo)}
            >
              {playingFileNo === params.data?.fileNo
                ? t("enterprise.buttonStop")
                : t("enterprise.buttonPlay")}
            </button>
          );
        },
      },
      {
        headerName: t("enterprise.splitFileReview"),
        width: 140,
        cellClass: "ag-cell-center",
        sortable: false,
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          if (!isFileSplitMergeReviewable(params.data)) return null;
          return (
            <button
              className="pf-review-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleSplitFileMergeReview(params.data);
              }}
            >
              {t("enterprise.splitFileReview")}
            </button>
          );
        },
      },
      {
        headerName: t("enterprise.columnDownload"),
        width: 160,
        cellClass: "ag-cell-center",
        sortable: false,
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          const st = params.data?.overallStatus;
          if (!["REVIEW_DONE", "WORK_DONE", "DONE"].includes(st)) return null;
          return (
            <div
              style={{ display: "flex", gap: "4px", justifyContent: "center" }}
            >
              <button
                className="pf-work-btn"
                onClick={() =>
                  setSubtitleViewModal({
                    open: true,
                    fileNo: params.data.fileNo,
                  })
                }
              >
                {t("enterprise.buttonView")}
              </button>
              {isAdmin() && (
                <button
                  className="pf-review-btn"
                  onClick={() =>
                    setDownloadMenu({
                      open: true,
                      fileNo: params.data.fileNo,
                      fileNm: params.data.fileNm || "",
                    })
                  }
                >
                  {t("enterprise.buttonDownload")}
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [
      difficultyOptions,
      handleDifficultyChange,
      t,
      isAdmin,
      expandedFileNos,
      toggleFileExpand,
      openFileSplitModal,
      assignedFileNos,
      playingFileNo,
      handleTogglePlay,
      myAssignedFileNos,
      isFileSplitMergeReviewable,
      handleSplitFileMergeReview,
    ],
  );

  const defaultColDef = useMemo(
    () => ({ sortable: true, resizable: true, suppressMovable: false }),
    [],
  );
  const getRowId = useCallback(
    (params) =>
      String(
        params.data._isSegmentRow ? params.data._rowId : params.data.fileNo,
      ),
    [],
  );
  const getRowStyle = useCallback((params) => {
    if (params.data?._isSegmentRow)
      return { background: "var(--bg-secondary, #fafafa)" };
    return undefined;
  }, []);

  const handleBack = () => navigate(-1);

  // ========== 의뢰 취소 ==========
  const [cancelling, setCancelling] = useState(false);

  const handleCancelServ = useCallback(async () => {
    if (!confirm(t("common.confirmCancelWork"))) return;
    if (!files.length) {
      toast.error(t("common.cancelWorkFailed"));
      return;
    }
    setCancelling(true);
    try {
      for (const file of files) {
        await cancelServ(servCd, file.fileNo);
      }
      toast.success(t("common.cancelWorkSuccess"));
      navigate(-1);
    } catch (err) {
      console.error("Cancel error:", err);
      toast.error(t("common.cancelWorkFailed"));
    } finally {
      setCancelling(false);
    }
  }, [files, servCd, t, navigate]);

  // ========== 렌더링 ==========
  if (loading) {
    return (
      <div className="notion-page translation-work-detail-page enterprise-work-detail-page">
        <div className="loading-container">
          <CircularProgress size={28} />
          <span>{t("common.loadingDetail")}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="notion-page translation-work-detail-page enterprise-work-detail-page">
        <div className="error-container">
          <span>{error}</span>
          <button className="btn-ghost" onClick={handleBack}>
            {t("common.backToList")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="notion-page translation-work-detail-page enterprise-work-detail-page">
      {/* 헤더 */}
      <div className="page-header">
        <div className="page-header-nav">
          <button className="btn-ghost" onClick={handleBack}>
            {resolvedBackLabel}
          </button>
          {isAdmin() && cnlYn === "Y" && (
            <Chip
              label={t("common.alreadyCanceled")}
              size="small"
              color="error"
              variant="outlined"
            />
          )}
          {isAdmin() && cnlYn !== "Y" && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={handleCancelServ}
              disabled={cancelling}
            >
              {cancelling ? t("common.cancellingWork") : t("common.cancelWork")}
            </Button>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <h1 className="page-title" style={{ margin: 0 }}>
            {comm?.servTitle || comm?.servCd || "-"}
          </h1>
          {(() => {
            const statusInfo = SERVICE_STATUSES.find(
              (s) => s.status === overallStatus,
            );
            return statusInfo ? (
              <Chip
                label={t(`common.status_${statusInfo.status}`)}
                size="small"
                variant="outlined"
                sx={{
                  ...getChipSxFromColor(statusInfo.color),
                  fontWeight: 500,
                  fontSize: "12px",
                  height: "24px",
                }}
              />
            ) : overallStatus ? (
              <span style={{ fontSize: "12px" }}>{overallStatus}</span>
            ) : null;
          })()}
        </div>
        <p className="page-description">
          {showVideoYn
            ? t("enterprise.descriptionWithVideo", {
                servCd: comm?.servCd,
                reqMembNm: isAdmin() ? comm?.reqMembNm || "-" : "-",
                videoType:
                  comm?.videoYn === "Y"
                    ? t("enterprise.videoTypeVideo")
                    : t("enterprise.videoTypeAudio"),
              })
            : t("enterprise.descriptionWithoutVideo", {
                servCd: comm?.servCd,
                reqMembNm: isAdmin() ? comm?.reqMembNm || "-" : "-",
              })}
        </p>
      </div>

      {/* 공통 정보 */}
      <section className="detail-section">
        <h2 className="detail-section-title">
          {t("enterprise.sectionCommonInfo")}
        </h2>
        <div className="info-card">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">
                {t("enterprise.labelServiceCode")}
              </span>
              <span className="info-value">{comm?.servCd || "-"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">{t("enterprise.labelTitle")}</span>
              <span className="info-value">{comm?.servTitle || "-"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">
                {t("enterprise.labelEnterprise", "의뢰 기업")}
              </span>
              <span className="info-value">{comm?.entNm || "-"}</span>
            </div>
            {isAdmin() && (
              <div className="info-item">
                <span className="info-label">
                  {t("enterprise.labelRequester")}
                </span>
                <span className="info-value">{comm?.reqMembNm || "-"}</span>
              </div>
            )}
            <div className="info-item">
              <span className="info-label">
                {t("enterprise.labelBssType", "의뢰 타입")}
              </span>
              <span className="info-value">
                {isAdmin() && bssTypeOptions.length > 0 ? (
                  <Select
                    size="small"
                    value={bssType || ""}
                    onChange={(e) => handleBssTypeChange(e.target.value)}
                    displayEmpty
                    sx={{ fontSize: "12px", minWidth: 140, height: 28 }}
                  >
                    <MenuItem value="" disabled>
                      <em>{t("enterprise.selectBssType", "의뢰 타입 선택")}</em>
                    </MenuItem>
                    {bssTypeOptions.map((opt) => (
                      <MenuItem
                        key={opt.dtlCd}
                        value={opt.dtlCd}
                        sx={{ fontSize: "12px" }}
                      >
                        {opt.dtlCdNm || opt.dtlCd}
                      </MenuItem>
                    ))}
                  </Select>
                ) : (
                  bssTypeOptions.find((o) => o.dtlCd === bssType)?.dtlCdNm ||
                  bssType ||
                  "-"
                )}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">
                {t("enterprise.labelRegistrationDateTime")}
              </span>
              <span className="info-value">{comm?.regDttm || "-"}</span>
            </div>
            {comm?.projectTitle && (
              <div className="info-item">
                <span className="info-label">
                  {t("enterprise.labelProject")}
                </span>
                <span className="info-value">{comm.projectTitle}</span>
              </div>
            )}
            {showRequesterContactPayment ? (
              <>
                <div className="info-item">
                  <span className="info-label">
                    {t("enterprise.labelRequesterTel")}
                  </span>
                  <span className="info-value">
                    {comm?.reqMblTelNo || "-"}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">
                    {t("enterprise.labelPayMethod")}
                  </span>
                  <span className="info-value">{comm?.payTpNm || "-"}</span>
                </div>
              </>
            ) : (
              <>
                <div className="info-item">
                  <span className="info-label">
                    {t("enterprise.labelTotalFiles")}
                  </span>
                  <span className="info-value">
                    {t("enterprise.fileCountUnit", {
                      count: comm?.totalFileCnt ?? "-",
                    })}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">
                    {t("enterprise.labelDoneFiles")}
                  </span>
                  <span className="info-value">
                    {t("enterprise.fileCountUnit", {
                      count: comm?.doneFileCnt ?? 0,
                    })}
                  </span>
                </div>
              </>
            )}
            {comm?.videoYn !== "Y" && (
              <div className="info-item">
                <span className="info-label">
                  {t("enterprise.labelRecDttm")}
                </span>
                <span className="info-value">
                  {formatRecDate(files[0]?.recDttm)}
                </span>
              </div>
            )}
            {comm?.videoYn !== "Y" && (
              <div className="info-item">
                <span className="info-label">
                  {t("enterprise.labelRecPlace")}
                </span>
                <span className="info-value">{files[0]?.recPlace || "-"}</span>
              </div>
            )}
          </div>
        </div>
        {!showRequestDetails &&
          (comm?.stenoMemo ||
            (isAdmin() && (comm?.adminMemo || comm?.remark))) && (
            <div className="memo-area">
              {comm?.stenoMemo && (
                <div className="memo-item">
                  <span className="memo-label">
                    {t("enterprise.labelStenoMemo")}
                  </span>
                  <p className="memo-content">{comm.stenoMemo}</p>
                </div>
              )}
              {isAdmin() && comm?.adminMemo && (
                <div className="memo-item">
                  <span className="memo-label">
                    {t("enterprise.labelAdminMemo")}
                  </span>
                  <p className="memo-content">{comm.adminMemo}</p>
                </div>
              )}
              {isAdmin() && comm?.remark && (
                <div className="memo-item">
                  <span className="memo-label">
                    {t("enterprise.labelRemark")}
                  </span>
                  <p className="memo-content">{comm.remark}</p>
                </div>
              )}
            </div>
          )}
      </section>

      {/* showRequestDetails: 메모 3컬럼 */}
      {showRequestDetails && (
        <section className="detail-section">
          <div
            className={`memo-row ${isAdmin() ? "memo-row-3col" : "memo-row-1col"}`}
          >
            {isAdmin() && (
              <div className="memo-row-col">
                <h3 className="memo-row-title">
                  {t("enterprise.sectionDetailRequest")}
                </h3>
                <div className="remark-readonly">
                  {comm?.remark ? (
                    <p className="remark-text">{comm.remark}</p>
                  ) : (
                    <p className="remark-empty">
                      {t("enterprise.noDetailRequest")}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="memo-row-col">
              <div className="memo-row-title-row">
                <h3 className="memo-row-title">
                  {t("enterprise.sectionStenoMemo")}
                </h3>
                {isAdmin() && (
                  <button
                    type="button"
                    className="memo-copy-btn"
                    onClick={() => setEditStenoMemo(comm.remark)}
                    disabled={!comm?.remark}
                  >
                    {t("enterprise.copyFromRequest")}
                  </button>
                )}
              </div>
              {isAdmin() ? (
                <div className="memo-card">
                  <textarea
                    className="memo-textarea"
                    value={editStenoMemo}
                    onChange={(e) => setEditStenoMemo(e.target.value)}
                    placeholder={t("enterprise.stenoMemoPlaceholder")}
                    rows={4}
                  />
                  <div className="memo-actions">
                    <button
                      className="memo-save-btn"
                      onClick={handleSaveStenoMemo}
                      disabled={savingStenoMemo}
                    >
                      {savingStenoMemo
                        ? t("common.saving")
                        : t("enterprise.buttonSaveMemo")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="remark-readonly">
                  {comm?.stenoMemo ? (
                    <p className="remark-text">{comm.stenoMemo}</p>
                  ) : (
                    <p className="remark-empty">-</p>
                  )}
                </div>
              )}
            </div>
            {isAdmin() && (
              <div className="memo-row-col">
                <h3 className="memo-row-title">
                  {t("enterprise.sectionAdminMemo")}
                </h3>
                <div className="memo-card">
                  <textarea
                    className="memo-textarea"
                    value={editAdminMemo}
                    onChange={(e) => setEditAdminMemo(e.target.value)}
                    placeholder={t("enterprise.adminMemoPlaceholder")}
                    rows={4}
                  />
                  <div className="memo-actions">
                    <button
                      className="memo-save-btn"
                      onClick={handleSaveAdminMemo}
                      disabled={savingAdminMemo}
                    >
                      {savingAdminMemo
                        ? t("common.saving")
                        : t("enterprise.buttonSaveMemo")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 파일 목록 */}
      {(isAdmin() || myAssignedFileNos?.size > 0) && (
        <section className="detail-section">
          <div
            className="detail-section-header"
            style={{
              justifyContent: "flex-start",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <h2 className="detail-section-title">
              {t("enterprise.sectionFileList")}
            </h2>
            {showAddRequestFile && isAdmin() && cnlYn !== "Y" && (
              <Button size="small" onClick={() => setRequestFileAddModal(true)}>
                {t("common.addRequestFile")}
              </Button>
            )}
            {isAdmin() && cnlYn !== "Y" && (
              <Button
                size="small"
                color="error"
                variant="outlined"
                disabled={selectedFileNos.size === 0 || deletingRequestFiles}
                onClick={handleDeleteRequestFiles}
              >
                {deletingRequestFiles
                  ? t("common.processing")
                  : t("enterprise.buttonDeleteRequestFile")}
                {selectedFileNos.size > 0 && ` (${selectedFileNos.size})`}
              </Button>
            )}
            {isDocumentType && isAnyChecker && (
              <Button
                size="small"
                variant={allFilesReviewDone ? "contained" : "outlined"}
                disabled={!allFilesReviewDone}
                onClick={handleMergeDownload}
                sx={
                  allFilesReviewDone
                    ? {
                        backgroundColor: "#1976d2",
                        color: "#fff",
                        "&:hover": { backgroundColor: "#1565c0" },
                      }
                    : undefined
                }
              >
                {t("enterprise.buttonMergeDownload", "병합파일 다운로드")}
              </Button>
            )}
            {isDocumentType && isAnyChecker && (
              <Button
                size="small"
                variant={allFilesReviewDone ? "contained" : "outlined"}
                disabled={!allFilesReviewDone}
                onClick={handleMergeReview}
                sx={
                  allFilesReviewDone
                    ? {
                        backgroundColor: "#2e7d32",
                        color: "#fff",
                        "&:hover": { backgroundColor: "#1b5e20" },
                      }
                    : undefined
                }
              >
                {t("enterprise.mergeReview", "병합 검수")}
              </Button>
            )}
            {isAdmin() && (
              <Button
                size="small"
                variant="outlined"
                disabled={selectedFileNos.size === 0}
                onClick={handleDownloadOriginal}
              >
                {t("enterprise.downloadOriginal")}
                {selectedFileNos.size > 0 && ` (${selectedFileNos.size})`}
              </Button>
            )}
            {isAdmin() && (
              <Button
                size="small"
                variant="outlined"
                disabled={reviewDoneSelectedFiles.length === 0}
                onClick={() => setBulkDownloadOpen(true)}
              >
                {t("enterprise.downloadOutput")}
                {reviewDoneSelectedFiles.length > 0 &&
                  ` (${reviewDoneSelectedFiles.length})`}
              </Button>
            )}
            {isAdmin() && difficultyOptions.length > 0 && (
              <>
                <Select
                  size="small"
                  value={bulkDifficultyId}
                  onChange={(e) => setBulkDifficultyId(e.target.value)}
                  displayEmpty
                  sx={{ fontSize: "12px", minWidth: 120, height: 30 }}
                >
                  <MenuItem value="" disabled>
                    <em>{t("enterprise.selectDifficulty")}</em>
                  </MenuItem>
                  {difficultyOptions.map((d) => {
                    const dKey = `common.difficulty_${d.id}`;
                    const dTranslated = t(dKey);
                    return (
                      <MenuItem
                        key={d.id}
                        value={d.id}
                        sx={{ fontSize: "12px" }}
                      >
                        {dTranslated !== dKey ? dTranslated : d.name}
                      </MenuItem>
                    );
                  })}
                </Select>
                <Button
                  size="small"
                  variant="contained"
                  disabled={
                    !bulkDifficultyId ||
                    selectedFileNos.size === 0 ||
                    applyingBulkDifficulty
                  }
                  onClick={handleBulkDifficultyApply}
                  sx={{ fontSize: "12px", height: 30 }}
                >
                  {applyingBulkDifficulty
                    ? t("common.processing")
                    : t("enterprise.applyBulkDifficulty", {
                        count: selectedFileNos.size,
                      })}
                </Button>
              </>
            )}
            {isDocumentType && isAdmin() && (
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <input
                  ref={estimateFileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleEnterpriseFileUpload(f, { isFinal: false });
                    e.target.value = "";
                  }}
                />
                <input
                  ref={finalOutputFileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  accept=".txt,.docx,.pdf,.zip,.hwp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleEnterpriseFileUpload(f, { isFinal: true });
                    e.target.value = "";
                  }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => estimateFileInputRef.current?.click()}
                >
                  {workCategory === "record"
                    ? t("recording.uploadNotarization", "공증파일 업로드")
                    : t("enterprise.uploadEstimate", "견적서 업로드")}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    handleEnterpriseFileDownload({ isFinal: false })
                  }
                >
                  {workCategory === "record"
                    ? t("recording.downloadNotarization", "공증파일 다운로드")
                    : t("enterprise.downloadEstimate", "견적서 다운로드")}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => finalOutputFileInputRef.current?.click()}
                >
                  {t("enterprise.uploadFinalOutput", "최종산출물 업로드")}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    handleEnterpriseFileDownload({ isFinal: true })
                  }
                >
                  {t("enterprise.downloadFinalOutput", "최종산출물 다운로드")}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  disabled={sendingNotification}
                  onClick={handleSendEnterpriseNotification}
                >
                  {t("enterprise.sendNotification", "알림 발송")}
                </Button>
              </div>
            )}
          </div>
          {filesLoading ? (
            <div className="files-loading">
              <CircularProgress size={24} />
              <span>{t("common.loadingFileList")}</span>
            </div>
          ) : files.length === 0 ? (
            <div className="files-empty">{t("common.noFiles")}</div>
          ) : (
            <div className="files-grid-container">
              <AgGridReact
                ref={gridRef}
                rowData={fileGridRows}
                columnDefs={fileColumnDefs}
                defaultColDef={defaultColDef}
                animateRows={true}
                getRowId={getRowId}
                getRowStyle={getRowStyle}
                headerHeight={40}
                rowHeight={40}
                domLayout="autoHeight"
                rowSelection={
                  isAdmin() || myAssignedFileNos?.size > 0
                    ? "multiple"
                    : undefined
                }
                onSelectionChanged={(e) => {
                  const selected = e.api
                    .getSelectedRows()
                    .filter((r) => !r._isSegmentRow);
                  setSelectedFileNos(new Set(selected.map((r) => r.fileNo)));
                }}
                overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t("common.noFiles")}</span>`}
              />
              {streamUrl && playingFileNo && (
                <div className="audio-player-bar">
                  <span className="audio-player-label">
                    {fileMap[playingFileNo]?.fileNm ||
                      t("enterprise.fileNumber", { fileNo: playingFileNo })}
                  </span>
                  <audio
                    ref={audioRef}
                    src={streamUrl}
                    controls
                    autoPlay
                    crossOrigin="anonymous"
                    onEnded={() => {
                      setPlayingFileNo(null);
                      setStreamUrl(null);
                    }}
                    onError={(e) => {
                      console.error("Audio error:", e.target.error);
                      alert(t("enterprise.audioPlayFailed"));
                      setPlayingFileNo(null);
                      setStreamUrl(null);
                    }}
                  />
                  <button
                    className="audio-player-close"
                    onClick={() => {
                      if (audioRef.current) {
                        audioRef.current.pause();
                        audioRef.current.src = "";
                      }
                      setPlayingFileNo(null);
                      setStreamUrl(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* showRequestDetails: 파일 세부정보 */}
      {showRequestDetails && files.length > 0 && (
        <section className="detail-section">
          <div
            className="detail-section-header"
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => setFileDetailOpen((prev) => !prev)}
          >
            <h2 className="detail-section-title">
              <span style={{ marginRight: 6, fontSize: 11 }}>
                {fileDetailOpen ? "▼" : "▶"}
              </span>
              {t("enterprise.sectionFileDetail")}
            </h2>
          </div>
          {fileDetailOpen && (
            <div className="file-detail-cards">
              {files.map((file) => {
                const fileSpeakers = speakersByFile[file.fileNo] || [];
                return (
                  <div key={file.fileNo} className="file-detail-card">
                    <div className="file-detail-card-header">{file.fileNm}</div>
                    <div className="file-detail-card-body">
                      <div className="file-expand-grid">
                        {!showVideoYn && (
                          <div className="file-expand-item">
                            <span className="file-expand-label">
                              {t("enterprise.labelRecDttm")}
                            </span>
                            <span className="file-expand-value">
                              {formatRecDate(file.recDttm)}
                            </span>
                          </div>
                        )}
                        {!showVideoYn && (
                          <div className="file-expand-item">
                            <span className="file-expand-label">
                              {t("enterprise.labelRecPlace")}
                            </span>
                            <span className="file-expand-value">
                              {file.recPlace || "-"}
                            </span>
                          </div>
                        )}
                        <div className="file-expand-item">
                          <span className="file-expand-label">
                            {t("enterprise.labelFileSplitTp")}
                          </span>
                          <span className="file-expand-value">
                            {file.splitTp === "1"
                              ? t("enterprise.splitTpPartial")
                              : t("enterprise.splitTpFull")}
                          </span>
                        </div>
                        {isAdmin() && !showVideoYn && (
                          <div className="file-expand-item">
                            <span className="file-expand-label">
                              {t("enterprise.labelFileFixPrice")}
                            </span>
                            <span className="file-expand-value">
                              {file.fixPrice != null
                                ? `${formatAmount(file.fixPrice)} ${t("common.wonUnit")}`
                                : "-"}
                            </span>
                          </div>
                        )}
                        <div className="file-expand-item">
                          <span className="file-expand-label">
                            {t("enterprise.labelOverallStatus")}
                          </span>
                          <span className="file-expand-value">
                            {file.overallStatus || "-"}
                          </span>
                        </div>
                        {isAdmin() && file.remark && (
                          <div className="file-expand-item file-expand-item-wide">
                            <span className="file-expand-label">
                              {t("enterprise.labelFileRemark")}
                            </span>
                            <span className="file-expand-value">
                              {file.remark}
                            </span>
                          </div>
                        )}
                      </div>
                      {isAdmin() && file.notaOrgApplyYn === "Y" && (
                        <div className="nota-info">
                          <h4 className="nota-info-title">
                            {t("enterprise.sectionNotaOrg")}
                          </h4>
                          <div className="file-expand-grid">
                            <div className="file-expand-item">
                              <span className="file-expand-label">
                                {t("enterprise.labelNotaOrgApplyPcs")}
                              </span>
                              <span className="file-expand-value">
                                {file.notaOrgApplyPcs ?? "-"}
                              </span>
                            </div>
                            <div className="file-expand-item">
                              <span className="file-expand-label">
                                {t("enterprise.labelNotaPrice")}
                              </span>
                              <span className="file-expand-value">
                                {file.notaPrice != null
                                  ? `${formatAmount(file.notaPrice)} ${t("common.wonUnit")}`
                                  : "-"}
                              </span>
                            </div>
                            <div className="file-expand-item">
                              <span className="file-expand-label">
                                {t("enterprise.labelNotaOrgPrice")}
                              </span>
                              <span className="file-expand-value">
                                {file.notaOrgPrice != null
                                  ? `${formatAmount(file.notaOrgPrice)} ${t("common.wonUnit")}`
                                  : "-"}
                              </span>
                            </div>
                          </div>
                          {file.recvName && (
                            <>
                              <h4
                                className="nota-info-title"
                                style={{ marginTop: 12 }}
                              >
                                {t("enterprise.sectionRecvInfo")}
                              </h4>
                              <div className="file-expand-grid">
                                <div className="file-expand-item">
                                  <span className="file-expand-label">
                                    {t("enterprise.labelRecvName")}
                                  </span>
                                  <span className="file-expand-value">
                                    {file.recvName}
                                  </span>
                                </div>
                                <div className="file-expand-item">
                                  <span className="file-expand-label">
                                    {t("enterprise.labelRecvTelNo")}
                                  </span>
                                  <span className="file-expand-value">
                                    {file.recvTelNo || "-"}
                                  </span>
                                </div>
                                <div className="file-expand-item file-expand-item-wide">
                                  <span className="file-expand-label">
                                    {t("enterprise.labelRecvAddr")}
                                  </span>
                                  <span className="file-expand-value">
                                    {[file.zipCd, file.baseAddr, file.dtlAddr]
                                      .filter(Boolean)
                                      .join(" ") || "-"}
                                  </span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {file.splitTp === "1" &&
                        file.timeSegments?.length > 0 && (
                          <div className="file-time-segments">
                            <h4 className="nota-info-title">
                              {t("enterprise.sectionTimeSegments")}
                            </h4>
                            <table className="speaker-table">
                              <thead>
                                <tr>
                                  <th>{t("enterprise.labelSegmentSeq")}</th>
                                  <th>{t("enterprise.labelSegmentStart")}</th>
                                  <th>{t("enterprise.labelSegmentEnd")}</th>
                                  <th>
                                    {t("enterprise.labelSegmentDuration")}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {file.timeSegments.map((seg) => (
                                  <tr key={seg.splitSeq}>
                                    <td className="text-center">
                                      {seg.splitSeq}
                                    </td>
                                    <td>{seg.splitTimeSt}</td>
                                    <td>{seg.splitTimeEd}</td>
                                    <td>{formatSec(seg.splitTime)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      {fileSpeakers.length > 0 && (
                        <div className="file-speakers">
                          <h4 className="nota-info-title">
                            {t("enterprise.sectionSpeakers")}
                          </h4>
                          <table className="speaker-table">
                            <thead>
                              <tr>
                                <th>{t("enterprise.labelSpkrSeq")}</th>
                                <th>{t("enterprise.labelSpkrNm")}</th>
                                <th>{t("enterprise.labelSpkrFeat")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fileSpeakers.map((s) => (
                                <tr key={s.spkrSeq}>
                                  <td className="text-center">{s.spkrSeq}</td>
                                  <td>{s.spkrNm || "-"}</td>
                                  <td>{s.spkrFeat || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 첨부파일 업로드 모달 */}
      {attachmentUploadModal && (
        <div
          className="notion-modal-overlay"
          onClick={closeAttachmentUploadModal}
        >
          <div
            className="notion-modal project-modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="notion-modal-header">
              <h3>{t("common.attachmentUpload")}</h3>
              <button
                className="notion-modal-close"
                onClick={closeAttachmentUploadModal}
              >
                ✕
              </button>
            </div>
            <div className="notion-modal-body">
              <div className="form-group">
                <label>{t("common.selectFile")}</label>
                <div
                  className="attachment-dropzone"
                  onClick={() => attachmentFileInputRef.current?.click()}
                >
                  <span className="attachment-dropzone-placeholder">
                    {t("common.clickToSelectFile")}
                  </span>
                </div>
                <input
                  type="file"
                  multiple
                  ref={attachmentFileInputRef}
                  onChange={handleAttachmentFileSelect}
                  style={{ display: "none" }}
                />
                {uploadSelectedFiles.length > 0 && (
                  <div className="attachment-file-list">
                    {uploadSelectedFiles.map((file, idx) => (
                      <div
                        key={`${file.name}_${idx}`}
                        className="attachment-file-item"
                      >
                        <span className="attachment-file-name">
                          {file.name}
                        </span>
                        <span className="attachment-file-size">
                          {formatFileSize(file.size)}
                        </span>
                        <button
                          type="button"
                          className="attachment-file-remove"
                          onClick={() => handleRemoveSelectedFile(idx)}
                          disabled={uploadingAttachment}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="notion-modal-footer">
                <button
                  className="btn-ghost"
                  onClick={closeAttachmentUploadModal}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleAttachmentUploadSubmit}
                  disabled={
                    uploadingAttachment || uploadSelectedFiles.length === 0
                  }
                >
                  {uploadingAttachment
                    ? t("common.uploading")
                    : t("common.upload")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 첨부파일 */}
      <section className="detail-section attachment-section">
        <div className="detail-section-header">
          <h2 className="detail-section-title">{t("common.attachment")}</h2>
          <div className="detail-section-header-actions">
            {showRequestDetails &&
              visibleAttachments.length > 0 &&
              isAdmin() &&
              selectedAttFileNos.size > 0 && (
                <button
                  className="btn-share-save"
                  onClick={handleToggleShare}
                  disabled={savingShare}
                >
                  {savingShare
                    ? t("common.saving")
                    : `공유 전환 (${selectedAttFileNos.size}건)`}
                </button>
              )}
            {selectedAttFileNos.size > 0 && (
              <button
                className="btn-ghost"
                onClick={handleBulkAttachmentDownload}
              >
                {`일괄 다운로드 (${selectedAttFileNos.size}건)`}
              </button>
            )}
            <button className="btn-primary" onClick={openAttachmentUploadModal}>
              {t("common.uploadFileButton")}
            </button>
          </div>
        </div>
        {attachmentsLoading ? (
          <div className="files-loading">
            <CircularProgress size={24} />
            <span>{t("common.loadingAttachments")}</span>
          </div>
        ) : visibleAttachments.length === 0 ? (
          <div className="files-empty">{t("common.noAttachments")}</div>
        ) : (
          <table className="attachment-table">
            <thead>
              <tr>
                {showRequestDetails && isAdmin() && (
                  <th className="att-center" style={{ width: 40 }}>
                    <Checkbox
                      size="small"
                      checked={
                        visibleAttachments.length > 0 &&
                        visibleAttachments.every((a) =>
                          selectedAttFileNos.has(a.fileNo),
                        )
                      }
                      indeterminate={
                        visibleAttachments.some((a) =>
                          selectedAttFileNos.has(a.fileNo),
                        ) &&
                        !visibleAttachments.every((a) =>
                          selectedAttFileNos.has(a.fileNo),
                        )
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAttFileNos(
                            new Set(visibleAttachments.map((a) => a.fileNo)),
                          );
                        } else {
                          setSelectedAttFileNos(new Set());
                        }
                      }}
                      sx={{ padding: 0 }}
                    />
                  </th>
                )}
                <th>{t("common.fileName")}</th>
                <th>{t("common.type")}</th>
                <th>{t("common.fileSize")}</th>
                <th>{t("common.registrationDate")}</th>
                {showRequestDetails && isAdmin() && (
                  <th>{t("enterprise.labelShareYn")}</th>
                )}
                <th>{t("common.action")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleAttachments.map((att) => {
                const chipProps = showRequestDetails
                  ? getAttachmentChipProps(att.fileTp, t)
                  : (() => {
                      const tp = String(att.fileTp);
                      const chipSx =
                        tp === "8" || tp === "9"
                          ? getChipSxFromColor("#ffb74d")
                          : getChipSxFromColor("#64b5f6");
                      return {
                        label:
                          tp === "8" || tp === "9"
                            ? t("common.customerAttachment")
                            : t("common.sharedFile"),
                        sx: {
                          fontSize: "11px",
                          height: "20px",
                          fontWeight: 500,
                          ...chipSx,
                        },
                      };
                    })();
                const isShared = att.shareYn === "Y";
                return (
                  <tr key={att.fileNo}>
                    {showRequestDetails && isAdmin() && (
                      <td className="att-center">
                        <Checkbox
                          size="small"
                          checked={selectedAttFileNos.has(att.fileNo)}
                          onChange={(e) => {
                            setSelectedAttFileNos((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(att.fileNo);
                              else next.delete(att.fileNo);
                              return next;
                            });
                          }}
                          sx={{ padding: 0 }}
                        />
                      </td>
                    )}
                    <td className="att-filename">{att.fileNm}</td>
                    <td className="att-center">
                      <Chip
                        label={chipProps.label}
                        size="small"
                        variant="outlined"
                        sx={chipProps.sx}
                      />
                    </td>
                    <td className="att-center">
                      {formatFileSize(att.fileSize)}
                    </td>
                    <td className="att-center">
                      {formatRegDttm(att.regDttm)}
                    </td>
                    {showRequestDetails && isAdmin() && (
                      <td className="att-center">
                        <Chip
                          label={
                            isShared
                              ? t("common.shared")
                              : t("common.notShared")
                          }
                          size="small"
                          variant="outlined"
                          sx={{
                            fontSize: "11px",
                            height: "20px",
                            fontWeight: 500,
                            ...(isShared
                              ? getChipSxFromColor("#81c784")
                              : getChipSxFromColor("#9e9e9e")),
                          }}
                        />
                      </td>
                    )}
                    <td className="att-center att-actions">
                      <button
                        className="att-download-btn"
                        onClick={() =>
                          handleAttachmentDownload(att.fileNo, att.fileTp)
                        }
                      >
                        {t("common.download")}
                      </button>
                      {isAdmin() && String(att.fileTp) === "10" && (
                        <button
                          className="att-delete-btn"
                          onClick={() => handleAttachmentDelete(att.fileNo)}
                        >
                          {t("common.delete")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 프로젝트 */}
      <section className="detail-section">
        <div className="detail-section-header">
          <h2 className="detail-section-title">
            {t("enterprise.sectionProject")}
          </h2>
          {isAdmin() && (
            <button className="btn-primary" onClick={openCreateProjectModal}>
              {t("enterprise.newProjectButton")}
            </button>
          )}
        </div>
        {projectsLoading ? (
          <div className="files-loading">
            <CircularProgress size={24} />
            <span>{t("enterprise.loadingProjects")}</span>
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="files-empty">{t("enterprise.noProjects")}</div>
        ) : (
          <div className="project-accordion-list">
            {visibleProjects.map((project) => {
              const isExpanded = expandedProjectIds.has(project.id);
              const pf = projectFilesMap[project.id] || {
                loading: false,
                data: [],
              };
              const wDetail = project.worksfyProjectKey
                ? worksfyDetailsMap[project.worksfyProjectKey]
                : null;
              const pStatus = resolveProjectStatus(project, pf, wDetail);
              return (
                <div
                  key={project.id}
                  className={`project-accordion ${isExpanded ? "expanded" : ""} pstatus-${pStatus.toLowerCase().replace("_", "-")}`}
                >
                  <div
                    className="project-accordion-header"
                    onClick={() => handleToggleProject(project.id)}
                  >
                    <span className="accordion-arrow">
                      {isExpanded ? "▼" : "▶"}
                    </span>
                    <span className="accordion-title">{project.title}</span>
                    {(() => {
                      const statusColor = PROJECT_STATUS_COLORS[pStatus];
                      return (
                        <Chip
                          label={t(`enterprise.projectStatus_${pStatus}`)}
                          size="small"
                          variant="outlined"
                          sx={{
                            ...getChipSxFromColor(statusColor || "#78909c"),
                            fontWeight: 600,
                            fontSize: "11px",
                            height: "20px",
                            marginLeft: "8px",
                          }}
                        />
                      );
                    })()}
                    {pf.data.length > 0 &&
                      (() => {
                        // 행별 작업시간 표시와 동일한 폴백 체인:
                        // workTime → split 구간 길이 → 원본 파일 playTm
                        const totalSec = pf.data.reduce((sum, f) => {
                          const sec =
                            f.workTime != null
                              ? f.workTime
                              : f.isSplit
                                ? (f.endSec || 0) - (f.startSec || 0)
                                : fileMap[f.fileNo]?.playTm || 0;
                          return sum + (Number(sec) || 0);
                        }, 0);
                        return (
                          <span
                            className="accordion-badge badge-total-time"
                            style={{ marginLeft: "8px" }}
                          >
                            {t("enterprise.badgeTotalWorkTime", {
                              time: formatSec(totalSec),
                            })}
                          </span>
                        );
                      })()}
                    {!hideProjectTypeSelect &&
                      project.type &&
                      (() => {
                        const typeColor =
                          PROJECT_TYPE_COLORS[project.type] || "#757575";
                        return (
                          <Chip
                            label={t(`common.projectType_${project.type}`)}
                            size="small"
                            sx={{
                              ...getChipSxFromColor(typeColor),
                              fontWeight: 500,
                              fontSize: "11px",
                              height: "20px",
                              marginLeft: "8px",
                            }}
                          />
                        );
                      })()}
                    {!hideProjectTypeSelect &&
                      project.lang &&
                      (() => {
                        const langInfo = LANGUAGES.find(
                          (lg) => lg.code === project.lang,
                        );
                        return (
                          <Chip
                            icon={
                              <span
                                className={`fi fi-${langInfo?.country?.toLowerCase() || ""}`}
                                style={{ fontSize: "12px", marginLeft: "8px" }}
                              />
                            }
                            label={
                              langInfo
                                ? getLanguageDisplayName(langInfo)
                                : project.lang
                            }
                            size="small"
                            variant="outlined"
                            sx={{
                              ...getChipSxFromColor("#c62828"),
                              fontWeight: 500,
                              fontSize: "11px",
                              height: "20px",
                              marginLeft: "4px",
                            }}
                          />
                        );
                      })()}
                    <div className="accordion-badges">
                      <span className="accordion-badge">
                        {t("enterprise.badgeWorkerCount", {
                          count: project.workerCnt,
                        })}
                      </span>
                      <span className="accordion-badge">
                        {t("enterprise.badgeUnitPrice", {
                          price: project.price ?? "-",
                        })}
                      </span>
                      <span className="accordion-badge badge-recruit">
                        {t("enterprise.badgeRecruitPeriod", {
                          start: formatISODateOnly(project.recruitStart),
                          end: formatISODateOnly(project.recruitEnd),
                        })}
                      </span>
                      <span className="accordion-badge badge-work">
                        {t("enterprise.badgeWorkPeriod", {
                          start: formatISODateOnly(project.workStart),
                          end: formatISODateOnly(project.workEnd),
                        })}
                      </span>
                      {project.isImportant && (
                        <Chip
                          label={t("enterprise.chipImportant")}
                          size="small"
                          sx={{
                            ...getChipSxFromColor("#f57c00"),
                            fontWeight: 500,
                            fontSize: "11px",
                            height: "20px",
                          }}
                          variant="outlined"
                        />
                      )}
                      {project.isAnyWorker && (
                        <Chip
                          label={t("enterprise.chipAnyoneCanApply")}
                          size="small"
                          sx={{
                            ...getChipSxFromColor("#388e3c"),
                            fontWeight: 500,
                            fontSize: "11px",
                            height: "20px",
                          }}
                          variant="outlined"
                        />
                      )}
                      {project.worksfyProjectKey &&
                        worksfyDetailsMap[project.worksfyProjectKey]
                          ?.isApplicable === false && (
                          <Chip
                            label={t("enterprise.worksfyClosed")}
                            size="small"
                            sx={{
                              ...getChipSxFromColor("#c62828"),
                              fontWeight: 500,
                              fontSize: "11px",
                              height: "20px",
                            }}
                            variant="outlined"
                          />
                        )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="project-accordion-body">
                      <div className="project-actions">
                        {isAdmin() && (
                          <button
                            className="btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditProjectModal(project);
                            }}
                          >
                            {t("common.edit")}
                          </button>
                        )}
                        {isAdmin() && (
                          <button
                            className="btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              openFileAddModal(project.id);
                            }}
                          >
                            {t("enterprise.addFileButton")}
                          </button>
                        )}
                        {isAdmin() &&
                          (project.worksfyProjectKey ? (
                            <button
                              className="btn-ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                alert(
                                  t(
                                    "enterprise.alertWorksfyDeleteNotImplemented",
                                  ),
                                );
                              }}
                              style={{ color: "var(--accent-secondary)" }}
                            >
                              {t("enterprise.worksfyDelete")}
                            </button>
                          ) : (
                            <button
                              className="btn-ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                openWorksfyRegisterModal(project);
                              }}
                            >
                              {t("enterprise.worksfyRegister")}
                            </button>
                          ))}
                        {isAdmin() && project.worksfyProjectKey && (
                          <button
                            className="btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              openWorksfyApplicantsModal(
                                project.worksfyProjectKey,
                              );
                            }}
                          >
                            {t("enterprise.worksfyApplicants")}
                          </button>
                        )}
                        {isAdmin() &&
                          project.worksfyProjectKey &&
                          (() => {
                            const wKey = project.worksfyProjectKey;
                            const isClosing = worksfyClosingKeys.has(wKey);
                            const isClosed =
                              worksfyDetailsMap[wKey]?.isApplicable === false;
                            if (isClosed) return null;
                            return (
                              <button
                                className="btn-ghost"
                                disabled={isClosing}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCloseWorksfyProject(project);
                                }}
                                style={{
                                  color: "var(--accent-secondary)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                {isClosing && <CircularProgress size={12} />}
                                {t("enterprise.worksfyClose")}
                              </button>
                            );
                          })()}
                        {isAdmin() && (
                          <button
                            className="btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProject(project.id);
                            }}
                            style={{
                              color: "var(--accent-secondary)",
                              marginLeft: "auto",
                            }}
                          >
                            {t("enterprise.deleteProject")}
                          </button>
                        )}
                      </div>
                      <div className="project-files-area">
                        {pf.loading ? (
                          <div
                            className="files-loading"
                            style={{ padding: "20px" }}
                          >
                            <CircularProgress size={20} />
                            <span>{t("enterprise.loadingProjectFiles")}</span>
                          </div>
                        ) : pf.data.length === 0 ? (
                          <div
                            className="files-empty"
                            style={{ padding: "20px" }}
                          >
                            {t("enterprise.noProjectFiles")}
                          </div>
                        ) : (
                          <table className="project-files-table">
                            <thead>
                              <tr>
                                <th>{t("enterprise.columnFileName")}</th>
                                <th>{t("enterprise.columnSplit")}</th>
                                <th>{t("enterprise.columnSection")}</th>
                                <th>{t("enterprise.columnPlayTime")}</th>
                                <th>{t("enterprise.columnStatus")}</th>
                                <th>{t("enterprise.columnWorker")}</th>
                                <th>{t("enterprise.columnChecker")}</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...pf.data]
                                .sort((a, b) => {
                                  const idxA = files.findIndex(
                                    (f) => f.fileNo === a.fileNo,
                                  );
                                  const idxB = files.findIndex(
                                    (f) => f.fileNo === b.fileNo,
                                  );
                                  if (idxA !== idxB) return idxA - idxB;
                                  return (a.startSec || 0) - (b.startSec || 0);
                                })
                                .map((pFile) => {
                                  const srcFile = fileMap[pFile.fileNo];
                                  const workerWorkStartBlocked =
                                    !isAdmin() &&
                                    pFile.workerId === membId &&
                                    isWorkStartBlockedStatus(pFile.status);
                                  return (
                                    <tr key={pFile.id}>
                                      <td className="pf-filename">
                                        {srcFile?.fileNm ||
                                          t("enterprise.fileNumber", {
                                            fileNo: pFile.fileNo,
                                          })}
                                      </td>
                                      <td className="pf-center">
                                        {pFile.isSplit ? (
                                          <Chip
                                            label={t("enterprise.chipSplit")}
                                            size="small"
                                            variant="outlined"
                                            sx={{
                                              ...getChipSxFromColor("#1976d2"),
                                              fontWeight: 500,
                                              fontSize: "11px",
                                              height: "20px",
                                            }}
                                          />
                                        ) : (
                                          "-"
                                        )}
                                      </td>
                                      <td className="pf-center">
                                        {pFile.isSplit
                                          ? `${formatSec(pFile.startSec)} ~ ${formatSec(pFile.endSec)}`
                                          : "-"}
                                      </td>
                                      <td className="pf-center">
                                        <span className="pf-work-time">
                                          {formatSec(
                                            pFile.workTime != null
                                              ? pFile.workTime
                                              : pFile.isSplit
                                                ? pFile.endSec - pFile.startSec
                                                : srcFile?.playTm,
                                          )}
                                          {isAdmin() && (
                                            <button
                                              type="button"
                                              className="pf-work-time-edit"
                                              title={t(
                                                "common:workTimeEdit.editTooltip",
                                              )}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenWorkTimeEdit(
                                                  project,
                                                  pFile,
                                                );
                                              }}
                                            >
                                              <Pencil size={12} />
                                            </button>
                                          )}
                                        </span>
                                      </td>
                                      <td className="pf-center">
                                        <Chip
                                          label={t(
                                            `common.status_${pFile.status || "STANDBY"}`,
                                          )}
                                          size="small"
                                          variant="outlined"
                                          sx={{
                                            fontSize: "11px",
                                            height: "22px",
                                            fontWeight: 500,
                                            ...getProjectStatusChipSx(
                                              pFile.status || "STANDBY",
                                            ),
                                          }}
                                        />
                                      </td>
                                      <td className="pf-center">
                                        {isAdmin() ? (
                                          pFile.workerId ? (
                                            <ProfileChip
                                              email={pFile.workerId}
                                              size="small"
                                              onClick={() =>
                                                openWorkerAssignModal(
                                                  project,
                                                  pFile,
                                                )
                                              }
                                              onDelete={() =>
                                                handleWorkerRemove(
                                                  project.id,
                                                  pFile.id,
                                                )
                                              }
                                              sx={{
                                                fontSize: "11px",
                                                maxWidth: "220px",
                                                cursor: "pointer",
                                              }}
                                            />
                                          ) : (
                                            <Chip
                                              label={t(
                                                "enterprise.chipAssignWorker",
                                              )}
                                              size="small"
                                              variant="outlined"
                                              onClick={() =>
                                                openWorkerAssignModal(
                                                  project,
                                                  pFile,
                                                )
                                              }
                                              sx={{
                                                fontSize: "11px",
                                                cursor: "pointer",
                                                borderStyle: "dashed",
                                              }}
                                            />
                                          )
                                        ) : pFile.workerId ? (
                                          <ProfileChip
                                            email={pFile.workerId}
                                            size="small"
                                            sx={{
                                              fontSize: "11px",
                                              maxWidth: "220px",
                                            }}
                                          />
                                        ) : (
                                          "-"
                                        )}
                                      </td>
                                      <td className="pf-center">
                                        {isAdmin() ? (
                                          pFile.checkerId ? (
                                            <ProfileChip
                                              email={pFile.checkerId}
                                              size="small"
                                              onClick={() =>
                                                openCheckerAssignModal(
                                                  project,
                                                  pFile,
                                                )
                                              }
                                              onDelete={() =>
                                                handleCheckerRemove(
                                                  project.id,
                                                  pFile.id,
                                                )
                                              }
                                              sx={{
                                                fontSize: "11px",
                                                maxWidth: "220px",
                                                cursor: "pointer",
                                              }}
                                            />
                                          ) : (
                                            <Chip
                                              label={t(
                                                "enterprise.chipAssignChecker",
                                              )}
                                              size="small"
                                              variant="outlined"
                                              onClick={() =>
                                                openCheckerAssignModal(
                                                  project,
                                                  pFile,
                                                )
                                              }
                                              sx={{
                                                fontSize: "11px",
                                                cursor: "pointer",
                                                borderStyle: "dashed",
                                              }}
                                            />
                                          )
                                        ) : pFile.checkerId === membId ? (
                                          <ProfileChip
                                            email={pFile.checkerId}
                                            size="small"
                                            sx={{
                                              fontSize: "11px",
                                              maxWidth: "220px",
                                            }}
                                          />
                                        ) : (
                                          "-"
                                        )}
                                      </td>
                                      <td className="pf-center">
                                        {(isAdmin() ||
                                          pFile.workerId === membId) && (
                                          <button
                                            className="pf-work-btn"
                                            onClick={() =>
                                              handleGoWork(project, pFile)
                                            }
                                          >
                                            {t("enterprise.buttonWork")}
                                          </button>
                                        )}
                                        {(isAdmin() ||
                                          pFile.checkerId === membId) && (
                                          <button
                                            className="pf-review-btn"
                                            onClick={() =>
                                              handleGoReview(project, pFile)
                                            }
                                            disabled={
                                              !isAdmin() &&
                                              isReviewStartBlockedStatus(
                                                pFile.status,
                                              )
                                            }
                                          >
                                            {t("enterprise.buttonReview")}
                                          </button>
                                        )}
                                        {isAdmin() && (
                                          <button
                                            className="pf-delete-btn"
                                            onClick={() =>
                                              handleDeleteProjectFile(
                                                project.id,
                                                pFile.id,
                                              )
                                            }
                                          >
                                            {t("common.delete")}
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        )}
                      </div>
                      <div className="project-messages">
                        <MessageEditor
                          projectId={project.id}
                          field="adminMessage"
                          label={t("enterprise.labelAdminMessage")}
                          value={project.adminMessage}
                          onSaved={fetchProjects}
                          readOnly={!isAdmin()}
                        />
                        <MessageEditor
                          projectId={project.id}
                          field="workerMessage"
                          label={t("enterprise.labelWorkerMessage")}
                          value={project.workerMessage}
                          onSaved={fetchProjects}
                          readOnly={isAdmin()}
                        />
                        <MessageEditor
                          projectId={project.id}
                          field="checkerMessage"
                          label={t("enterprise.labelCheckerMessage")}
                          value={project.checkerMessage}
                          onSaved={fetchProjects}
                          readOnly={!isProjectChecker(project.id)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 하단 */}
      <div className="page-footer">
        <button className="btn-ghost" onClick={handleBack}>
          {t("common.backToListFull")}
        </button>
      </div>

      {/* 모달 */}
      <ProjectModal
        open={projectModal.open}
        mode={projectModal.mode}
        initialData={projectModal.data}
        onClose={closeProjectModal}
        onSubmit={handleProjectSubmit}
        submitting={projectModalSubmitting}
        hideProjectTypeSelect={hideProjectTypeSelect}
        workCategory={workCategory}
      />
      <ProjectFileAddModal
        open={fileAddModal.open}
        files={files}
        existingProjectFiles={allProjectFiles}
        currentProjectFiles={
          projectFilesMap[fileAddModal.projectId]?.data || []
        }
        onClose={closeFileAddModal}
        onSubmit={handleFileAddSubmit}
        submitting={fileAddSubmitting}
      />
      <FileSplitModal
        open={fileSplitModal.open}
        file={fileSplitModal.file}
        servCd={servCd}
        onClose={closeFileSplitModal}
        onSaved={refreshFiles}
      />
      <WorksfyRegisterModal
        open={worksfyRegisterModal.open}
        project={worksfyRegisterModal.project}
        onClose={closeWorksfyRegisterModal}
        onSubmit={handleWorksfyRegisterSubmit}
        submitting={worksfyRegisterSubmitting}
      />
      <WorksfyApplicantsModal
        open={worksfyApplicantsModal.open}
        worksfyProjectKey={worksfyApplicantsModal.worksfyProjectKey}
        onClose={closeWorksfyApplicantsModal}
      />
      <WorkerAssignModal
        open={workerAssignModal.open}
        worksfyProjectKey={workerAssignModal.worksfyProjectKey}
        onClose={closeWorkerAssignModal}
        onAssign={handleWorkerAssign}
        onBatchAssign={handleWorkerBatchAssign}
        assigning={workerAssigning}
      />
      <WorkerAssignModal
        open={checkerAssignModal.open}
        worksfyProjectKey={checkerAssignModal.worksfyProjectKey}
        onClose={closeCheckerAssignModal}
        onAssign={handleCheckerAssign}
        onBatchAssign={handleCheckerBatchAssign}
        assigning={checkerAssigning}
      />
      <BatchAssignFileSelectModal
        open={batchAssignModal.open}
        projectFiles={batchAssignModal.projectFiles}
        fileMap={fileMap}
        files={files}
        assignType={batchAssignModal.type || "worker"}
        onConfirm={handleBatchAssignConfirm}
        onClose={closeBatchAssignModal}
        loading={batchAssignModal.loading}
        assigning={workerAssigning || checkerAssigning}
      />
      <SubtitleViewModal
        open={subtitleViewModal.open}
        onClose={() => setSubtitleViewModal({ open: false, fileNo: null })}
        servCd={servCd}
        fileNo={subtitleViewModal.fileNo}
        isTranslation={trnsYn === "Y"}
      />
      <FormatModal
        isOpen={downloadMenu.open}
        mode="export"
        onClose={() =>
          setDownloadMenu({ open: false, fileNo: null, fileNm: "" })
        }
        onSelect={handleFormatSelect}
        onHwpExport={() => {
          const { fileNo: dlFileNo, fileNm } = downloadMenu;
          setDownloadMenu({ open: false, fileNo: null, fileNm: "" });
          if (!dlFileNo) return;
          setHwpExportModal({ open: true, fileNo: dlFileNo, fileNm });
        }}
      />
      <FormatModal
        isOpen={bulkDownloadOpen}
        mode="export"
        onClose={() => setBulkDownloadOpen(false)}
        onSelect={handleBulkFormatSelect}
        onHwpExport={
          reviewDoneSelectedFiles.length > 0
            ? () => {
                setBulkDownloadOpen(false);
                setBulkHwpExportOpen(true);
              }
            : undefined
        }
      />

      <HwpExportModal
        open={hwpExportModal.open}
        onClose={() =>
          setHwpExportModal({ open: false, fileNo: null, fileNm: "" })
        }
        servCd={servCd}
        fileNo={hwpExportModal.fileNo}
        fileNm={hwpExportModal.fileNm}
        isTranslation={trnsYn === "Y"}
      />

      <HwpExportModal
        open={bulkHwpExportOpen}
        onClose={() => setBulkHwpExportOpen(false)}
        servCd={servCd}
        isTranslation={trnsYn === "Y"}
        files={reviewDoneSelectedFiles.map((f) => ({
          fileNo: f.fileNo,
          fileNm: f.fileNm,
        }))}
      />

      <NormalizeMp3Modal
        open={normalizeMp3Modal.open}
        onClose={() =>
          setNormalizeMp3Modal({ open: false, fileNo: null, fileNm: "" })
        }
        fileNo={normalizeMp3Modal.fileNo}
        fileNm={normalizeMp3Modal.fileNm}
      />

      <RequestFileAddModal
        open={requestFileAddModal}
        servCd={servCd}
        onClose={() => setRequestFileAddModal(false)}
        onSuccess={() => fetchDetail()}
      />

      <MergeExportModal
        open={mergeExportOpen}
        onClose={() => setMergeExportOpen(false)}
        onExport={handleMergeExport}
      />

      <WorkTimeEditModal
        open={workTimeEditModal.open}
        onClose={handleCloseWorkTimeEdit}
        onSaved={handleWorkTimeSaved}
        projectFileId={workTimeEditModal.projectFile?.id}
        fileName={workTimeEditModal.fileName}
        initialWorkTimeSec={
          workTimeEditModal.projectFile?.workTime != null
            ? workTimeEditModal.projectFile.workTime
            : workTimeEditModal.projectFile?.isSplit
              ? (workTimeEditModal.projectFile?.endSec || 0) -
                (workTimeEditModal.projectFile?.startSec || 0)
              : 0
        }
        hasRelatedSettlement={["REVIEW_DONE", "DONE"].includes(
          workTimeEditModal.projectFile?.status,
        )}
      />
    </div>
  );
}
