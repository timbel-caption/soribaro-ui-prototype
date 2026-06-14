import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  getServByServCd,
  getFilesByServCd,
  updateFileDifficultyByFileNo,
  getProjectsByServCd,
  createProject,
  updateProject,
  deleteProject,
  getProjectFilesByProjectId,
  createProjectFile,
  createProjectFiles,
  deleteProjectFile,
  updateProjectFile,
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
  updateAttachmentShare,
  updateFileSplitSegments,
  getProfile,
  getTranslateReqDtl,
  getTranslateDetail,
  updateStenoMemo,
  updateAdminMemo,
  cancelServ,
  updateServBssType,
} from "../../../api/v9";
import { getFileDifficulties } from "../../../api/v9/fileDifficulties";
import { getCommonCodes } from "../../../api/v9/member";
import { useCommonCodeStore } from "../../../stores/commonCodeStore";
import { useUserStore } from "../../../stores/userStore";
import WorksfyRegisterModal from "../../../components/common/WorksfyRegisterModal/WorksfyRegisterModal";
import WorksfyApplicantsModal from "../../../components/common/WorksfyApplicantsModal/WorksfyApplicantsModal";
import WorkerAssignModal from "../../../components/common/WorkerAssignModal/WorkerAssignModal";
import BatchAssignFileSelectModal from "../../../components/common/BatchAssignFileSelectModal/BatchAssignFileSelectModal";
import ProfileChip from "../../../components/common/ProfileChip";
import SubtitleViewModal from "../../../components/common/SubtitleViewModal";
import FileSplitModal from "../../../components/common/FileSplitModal/FileSplitModal";
import ProjectFileAddModal from "../../../components/common/ProjectFileAddModal/ProjectFileAddModal";
import RequestFileAddModal from "../../../components/common/RequestFileAddModal/RequestFileAddModal";
import WorkTimeEditModal from "../../../components/common/WorkTimeEditModal/WorkTimeEditModal";
import { Pencil } from "lucide-react";
import { fetchSubtitlesByType } from "../../../utils/subtitleFetchUtils";
import { normalizeSubtitles } from "../../../utils/subtitleExportUtils";
import { createEncodedBlob } from "../../../utils/encodingUtils";
import FormatModal from "../../../components/worktool/subtitle/FormatModal";
import { toast } from "../../../components/common/Toast";
import SplitWaveformPreview from "./SplitWaveformPreview";
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
import { buildWorktoolPath } from "../../../utils/worktoolRoute";
import { useTranslation } from "react-i18next";
import "flag-icons/css/flag-icons.min.css";
import "../../../styles/notion-list.css";
import "./TranslationWorkDetailPage.css";

// ag-grid 모듈 등록
ModuleRegistry.registerModules([AllCommunityModule]);

const OUTPUT_DOWNLOADABLE_STATUSES = ["REVIEW_DONE", "WORK_DONE", "DONE"];

// 프로젝트 유형별 Chip 색상
const PROJECT_TYPE_COLORS = {
  START: { bg: "#e3f2fd", color: "#1565c0", border: "#90caf9" },
  MID: { bg: "#fff8e1", color: "#f57c00", border: "#ffcc80" },
  FINAL: { bg: "#e8f5e9", color: "#2e7d32", border: "#a5d6a7" },
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

const formatAmount = (value) => {
  if (value == null) return "-";
  return Number(value).toLocaleString("ko-KR");
};

const formatFileSize = (bytes) => {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// 초 -> HH:MM:SS 포맷
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

// ISO 날짜 -> 표시용 포맷 (날짜+시간)
const formatISODate = (iso) => {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

// ISO 날짜 -> 날짜만 (YYYY.MM.DD)
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

// ISO -> datetime-local input value
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

// 프로젝트 등록/수정 모달 기본값
const getEmptyProjectForm = () => {
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

  return {
    type: "START",
    lang: "",
    title: "번역 프로젝트",
    workerCnt: 1,
    price: "추후협의",
    recruitStart: fmt(recruitStart),
    recruitEnd: fmt(recruitEnd),
    workStart: fmt(workStart),
    workEnd: fmt(workEnd),
    isImportant: false,
    isAnyWorker: true,
    adminMessage: "",
    workerMessage: "",
  };
};

// ============================================================
// 프로젝트 모달 (등록/수정)
// ============================================================
const ProjectModal = ({
  open,
  mode,
  initialData,
  onClose,
  onSubmit,
  submitting,
  reqDtlData = [],
}) => {
  const { t } = useTranslation("soribaro");
  const [form, setForm] = useState(getEmptyProjectForm);

  const descriptionEditor = useEditor({
    extensions: [StarterKit],
    content: "",
    editable: true,
  });

  const hasMidLang = useMemo(
    () => reqDtlData.some((d) => d.midLangYn === "Y"),
    [reqDtlData],
  );

  const availableTypes = useMemo(
    () =>
      hasMidLang
        ? PROJECT_TYPES
        : PROJECT_TYPES.filter((pt) => pt.type !== "MID"),
    [hasMidLang],
  );

  const availableLangs = useMemo(() => {
    if (!form.type) return [];
    switch (form.type) {
      case "START":
        return reqDtlData.filter((d) => d.startLangYn === "Y");
      case "MID":
        return reqDtlData.filter((d) => d.midLangYn === "Y");
      case "FINAL":
        return reqDtlData.filter(
          (d) => d.startLangYn !== "Y" && d.midLangYn !== "Y",
        );
      default:
        return [];
    }
  }, [form.type, reqDtlData]);

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
          adminMessage: initialData.adminMessage || "",
          workerMessage: initialData.workerMessage || "",
        });
        if (descriptionEditor && !descriptionEditor.isDestroyed) {
          descriptionEditor.commands.setContent(initialData.description || "");
        }
      } else {
        setForm(getEmptyProjectForm());
        if (descriptionEditor && !descriptionEditor.isDestroyed) {
          descriptionEditor.commands.setContent("<p>번역 프로젝트</p>");
        }
      }
    }
  }, [open, mode, initialData, descriptionEditor]);

  const handleChange = (field, value) => {
    if (field === "type") {
      setForm((prev) => ({ ...prev, type: value, lang: "" }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert(t("translation.workDetail.projectModal.alertProjectNameRequired"));
      return;
    }
    if (!form.lang) {
      alert(t("translation.workDetail.projectModal.alertLanguageRequired"));
      return;
    }
    const descHtml = descriptionEditor ? descriptionEditor.getHTML() : "";
    const description = !descHtml || descHtml === "<p></p>" ? null : descHtml;
    if (!description) {
      alert(t("translation.workDetail.projectModal.alertDescriptionRequired"));
      return;
    }
    if (!Number(form.workerCnt) || Number(form.workerCnt) < 1) {
      alert(t("translation.workDetail.projectModal.alertWorkerCountRequired"));
      return;
    }
    if (!form.price || !String(form.price).trim()) {
      alert(t("translation.workDetail.projectModal.alertUnitPriceRequired"));
      return;
    }
    if (!form.recruitStart || !form.recruitEnd) {
      alert(
        t("translation.workDetail.projectModal.alertRecruitPeriodRequired"),
      );
      return;
    }
    if (!form.workStart || !form.workEnd) {
      alert(t("translation.workDetail.projectModal.alertWorkPeriodRequired"));
      return;
    }
    const payload = {
      ...form,
      description,
      workerCnt: Number(form.workerCnt) || 1,
      price: form.price,
      recruitStart: form.recruitStart || null,
      recruitEnd: form.recruitEnd || null,
      workStart: form.workStart || null,
      workEnd: form.workEnd || null,
    };
    onSubmit(payload);
  };

  if (!open) return null;

  return (
    <div className="notion-modal-overlay">
      <div className="notion-modal notion-modal-lg">
        <div className="notion-modal-header">
          <h3>
            {mode === "edit"
              ? t("translation.workDetail.projectModal.editTitle")
              : t("translation.workDetail.projectModal.createTitle")}
          </h3>
          <button className="notion-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="notion-modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              {t("translation.workDetail.projectModal.labelProjectName")}
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder={t(
                "translation.workDetail.projectModal.placeholderProjectName",
              )}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>
                {t("translation.workDetail.projectModal.labelProjectType")}
              </label>
              <select
                value={form.type}
                onChange={(e) => handleChange("type", e.target.value)}
              >
                <option value="">
                  {t("translation.workDetail.projectModal.selectPlaceholder")}
                </option>
                {availableTypes.map((pt) => (
                  <option key={pt.type} value={pt.type}>
                    {t(`common.projectType_${pt.type}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>
                {t("translation.workDetail.projectModal.labelLanguage")}
              </label>
              <select
                value={form.lang}
                onChange={(e) => handleChange("lang", e.target.value)}
                disabled={!form.type}
              >
                <option value="">
                  {t("translation.workDetail.projectModal.selectPlaceholder")}
                </option>
                {availableLangs.map((dtl) => {
                  const mapped = LANGUAGES.find(
                    (l) => l.legacyCode === dtl.trnsLangCd,
                  );
                  const isoCode = mapped?.code || dtl.trnsLangCd;
                  return (
                    <option key={dtl.trnsLangCd} value={isoCode}>
                      {mapped?.flag ? `${mapped.flag} ` : ""}
                      {mapped ? getLanguageDisplayName(mapped) : dtl.trnsLangNm}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>
              {t("translation.workDetail.projectModal.labelDescription")}
            </label>
            <div className="tiptap-editor-wrapper">
              <TiptapToolbar editor={descriptionEditor} />
              <EditorContent editor={descriptionEditor} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>
                {t("translation.workDetail.projectModal.labelWorkerCount")}
              </label>
              <input
                type="number"
                min="1"
                value={form.workerCnt}
                onChange={(e) => handleChange("workerCnt", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>
                {t("translation.workDetail.projectModal.labelUnitPrice")}
              </label>
              <input
                type="text"
                value={form.price}
                onChange={(e) => handleChange("price", e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>
                {t("translation.workDetail.projectModal.labelRecruitStart")}
              </label>
              <input
                type="datetime-local"
                value={form.recruitStart}
                onChange={(e) => handleChange("recruitStart", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>
                {t("translation.workDetail.projectModal.labelRecruitEnd")}
              </label>
              <input
                type="datetime-local"
                value={form.recruitEnd}
                onChange={(e) => handleChange("recruitEnd", e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>
                {t("translation.workDetail.projectModal.labelWorkStart")}
              </label>
              <input
                type="datetime-local"
                value={form.workStart}
                onChange={(e) => handleChange("workStart", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>
                {t("translation.workDetail.projectModal.labelWorkEnd")}
              </label>
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
                {t("translation.workDetail.projectModal.importantProject")}
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
                {t("translation.workDetail.projectModal.anyWorkerCanApply")}
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
// Tiptap 툴바 컴포넌트
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
        title={t("translation.workDetail.tiptapToolbar.bold")}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive("italic") ? "active" : ""}
        title={t("translation.workDetail.tiptapToolbar.italic")}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive("strike") ? "active" : ""}
        title={t("translation.workDetail.tiptapToolbar.strikethrough")}
      >
        <s>S</s>
      </button>
      <span className="toolbar-divider" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={editor.isActive("heading", { level: 2 }) ? "active" : ""}
        title={t("translation.workDetail.tiptapToolbar.heading2")}
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={editor.isActive("heading", { level: 3 }) ? "active" : ""}
        title={t("translation.workDetail.tiptapToolbar.heading3")}
      >
        H3
      </button>
      <span className="toolbar-divider" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive("bulletList") ? "active" : ""}
        title={t("translation.workDetail.tiptapToolbar.bulletList")}
      >
        {t("translation.workDetail.tiptapToolbarLabels.bulletList")}
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive("orderedList") ? "active" : ""}
        title={t("translation.workDetail.tiptapToolbar.numberedList")}
      >
        {t("translation.workDetail.tiptapToolbarLabels.numberedList")}
      </button>
      <span className="toolbar-divider" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={editor.isActive("blockquote") ? "active" : ""}
        title={t("translation.workDetail.tiptapToolbar.blockquote")}
      >
        {t("translation.workDetail.tiptapToolbarLabels.blockquote")}
      </button>
    </div>
  );
};

// ============================================================
// 메시지 인라인 편집 컴포넌트 (Tiptap)
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
      if (currentHtml !== (value || "")) {
        editor.commands.setContent(value || "");
      }
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
      } else {
        alert(response?.message || t("translation.workDetail.alertSaveFailed"));
      }
    } catch (err) {
      alert(err.message || t("translation.workDetail.alertSaveError"));
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
              {t("translation.workDetail.noContent")}
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
export default function TranslationWorkDetailPage() {
  const { t } = useTranslation("soribaro");
  const { servCd } = useParams();
  const navigate = useNavigate();
  const gridRef = useRef(null);
  const attachmentFileInputRef = useRef(null);

  // userStore
  const isAdmin = useUserStore((s) => s.isAdmin);
  const membId = useUserStore((s) => s.user?.membId);

  // commonCodeStore
  const getCodeLabel = useCommonCodeStore((s) => s.getCodeLabel);

  // ========== 상태 관리 ==========
  const [serv, setServ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [difficultyOptions, setDifficultyOptions] = useState([]);
  const [bssType, setBssType] = useState(null);
  const [bssTypeOptions, setBssTypeOptions] = useState([]);

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [expandedProjectIds, setExpandedProjectIds] = useState(new Set());

  const [reqDtlData, setReqDtlData] = useState([]);

  // 프로젝트별 파일 목록 캐시: { [projectId]: { loading, data } }
  const [projectFilesMap, setProjectFilesMap] = useState({});

  // 모달 상태
  const [projectModal, setProjectModal] = useState({
    open: false,
    mode: "create",
    data: null,
  });
  const [projectModalSubmitting, setProjectModalSubmitting] = useState(false);
  const [fileAddModal, setFileAddModal] = useState({
    open: false,
    projectId: null,
    projectType: null,
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
  const [subtitleViewModal, setSubtitleViewModal] = useState({
    open: false,
    fileNo: null,
  });
  const [fileSplitModal, setFileSplitModal] = useState({
    open: false,
    file: null,
  });
  const [downloadMenu, setDownloadMenu] = useState({
    open: false,
    fileNo: null,
    fileNm: "",
  });
  const [requestFileAddModal, setRequestFileAddModal] = useState(false);
  const [workTimeEditModal, setWorkTimeEditModal] = useState({
    open: false,
    projectFile: null,
    fileName: "",
  });
  const [selectedFileNos, setSelectedFileNos] = useState(new Set());
  const [expandedFileNos, setExpandedFileNos] = useState(new Set());
  const [bulkDifficultyId, setBulkDifficultyId] = useState("");
  const [applyingBulkDifficulty, setApplyingBulkDifficulty] = useState(false);

  const handleDownloadOriginal = useCallback(async () => {
    if (selectedFileNos.size === 0) return;
    toast.info(t("translation.workDetail.downloadPreparing"));
    for (const fileNo of selectedFileNos) {
      try {
        const res = await getFileDownloadUrl(fileNo);
        const data = res?.data || res;
        if (data?.url || data?.downloadUrl) {
          window.open(data.url || data.downloadUrl, "_blank");
        }
      } catch (err) {
        toast.error(
          `${fileNo}: ${err.message || t("translation.workDetail.alertDownloadUrlFailed")}`,
        );
      }
    }
  }, [selectedFileNos, t]);

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
      const types = ["FINAL", "MID", "START"];
      let subtitles = [];
      for (const type of types) {
        subtitles = await fetchSubtitlesByType(servCd, dlFileNo, type);
        if (subtitles.length > 0) break;
      }
      if (!subtitles.length) {
        toast.warning(
          `${fileNm || dlFileNo}: ${t("translation.workDetail.noSubtitleData")}`,
        );
        return;
      }
      // startTime/endTime 정규화 (API 응답이 start/end 문자열만 포함할 수 있음)
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
          content = JSON.stringify(subtitles, null, 2);
          break;
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
    [servCd, t],
  );

  const handleFormatSelect = useCallback(
    async (format, targetField = "text", encoding = "utf-8", options = {}) => {
      const { fileNo: dlFileNo, fileNm } = downloadMenu;
      setDownloadMenu({ open: false, fileNo: null, fileNm: "" });
      if (!dlFileNo) return;
      toast.info(t("translation.workDetail.downloadPreparing"));
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

  // 산출물 일괄 다운로드: 선택된 파일 중 검수완료만
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
      toast.info(t("translation.workDetail.downloadPreparing"));
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

  // 일괄 배정 파일 선택 모달
  const [batchAssignModal, setBatchAssignModal] = useState({
    open: false,
    projectId: null,
    assigneeId: null,
    type: null, // 'worker' | 'checker'
    projectFiles: [],
    loading: false,
  });

  // 웍스파이 상세 정보 캐시 { [worksfyProjectKey]: WorksfyProjectDto }
  const [worksfyDetailsMap, setWorksfyDetailsMap] = useState({});
  const [worksfyClosingKeys, setWorksfyClosingKeys] = useState(new Set());

  // 첨부파일 상태
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [selectedAttFileNos, setSelectedAttFileNos] = useState(new Set());
  const [savingShare, setSavingShare] = useState(false);

  const visibleAttachments = useMemo(() => {
    if (isAdmin()) return attachments;
    return attachments.filter((a) => a.shareYn === "Y");
  }, [attachments, isAdmin]);

  // 메모 상태
  const [editStenoMemo, setEditStenoMemo] = useState("");
  const [savingStenoMemo, setSavingStenoMemo] = useState(false);
  const [editAdminMemo, setEditAdminMemo] = useState("");
  const [savingAdminMemo, setSavingAdminMemo] = useState(false);

  // 화자 정보
  const [speakers, setSpeakers] = useState([]);

  // 첨부파일 업로드 모달 상태
  const [attachmentUploadModal, setAttachmentUploadModal] = useState(false);
  const [uploadSelectedFiles, setUploadSelectedFiles] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // ========== 파일 맵 (fileNo -> FileDto) ==========
  const fileMap = useMemo(() => {
    const map = {};
    files.forEach((f) => {
      map[f.fileNo] = f;
    });
    return map;
  }, [files]);

  // ========== 화자 맵 (fileNo -> speakers[]) ==========
  const speakersByFile = useMemo(() => {
    const map = {};
    speakers.forEach((s) => {
      if (!map[s.fileNo]) map[s.fileNo] = [];
      map[s.fileNo].push(s);
    });
    return map;
  }, [speakers]);

  // ========== 파일 그리드: 분할 구간 펼침/접힘 ==========
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

  const handleOpenWorkTimeEdit = useCallback(
    (pFile) => {
      if (!isAdmin()) return;
      const srcFile = fileMap[pFile.fileNo];
      setWorkTimeEditModal({
        open: true,
        projectFile: pFile,
        fileName: srcFile?.fileNm || `#${pFile.fileNo}`,
      });
    },
    [isAdmin, fileMap],
  );

  const handleCloseWorkTimeEdit = useCallback(() => {
    setWorkTimeEditModal({ open: false, projectFile: null, fileName: "" });
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

  // 프로젝트에 배정된 파일 번호 셋 (분할 설정 보호용)
  const assignedFileNos = useMemo(() => {
    const nos = new Set();
    Object.values(projectFilesMap).forEach((pf) => {
      (pf?.data || []).forEach((f) => nos.add(f.fileNo));
    });
    return nos;
  }, [projectFilesMap]);

  // 같은 타입 프로젝트의 파일 병합 (중복 할당 방지용)
  const sameTypeProjectFiles = useMemo(() => {
    if (!fileAddModal.projectType) return [];
    const sameTypeProjectIds = projects
      .filter((p) => p.type === fileAddModal.projectType)
      .map((p) => p.id);
    return sameTypeProjectIds.flatMap((id) => projectFilesMap[id]?.data || []);
  }, [fileAddModal.projectType, projects, projectFilesMap]);

  // 분할 구간 → 프로젝트 배정 상태 매핑
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

  // 파일 + 펼쳐진 구간을 플랫 리스트로 변환
  const fileGridRows = useMemo(() => {
    const rows = [];
    files.forEach((file) => {
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
  }, [files, expandedFileNos, segmentProjectMap]);

  // ========== API 호출 ==========

  // 의뢰 정보
  useEffect(() => {
    const fetchServ = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getServByServCd(servCd);
        if (response.status === "SUCCESS") {
          setServ(response.data);
          setEditStenoMemo(response.data?.stenoMemo || "");
          setEditAdminMemo(response.data?.adminMemo || "");
          const currentBssType = response.data?.bssType || null;
          setBssType(currentBssType);
          if (currentBssType) {
            try {
              const fdRes = await getFileDifficulties({
                bssTypeCd: currentBssType,
              });
              if (fdRes.status === "SUCCESS")
                setDifficultyOptions(fdRes.data || []);
            } catch (fdErr) {
              console.error("FileDifficulties fetch error:", fdErr);
            }
          } else {
            setDifficultyOptions([]);
          }
        } else {
          setError(
            response.message || t("translation.workDetail.alertServInfoFailed"),
          );
        }
      } catch (err) {
        setError(
          err.message || t("translation.workDetail.alertServInfoFailed"),
        );
      } finally {
        setLoading(false);
      }
    };
    if (servCd) fetchServ();
  }, [servCd]);

  // BSS_TYPE 공통코드 옵션 로드 (ADMIN 셀렉터 용도)
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
          try {
            const fdRes = await getFileDifficulties({ bssTypeCd: nextBssType });
            setDifficultyOptions(
              fdRes.status === "SUCCESS" ? fdRes.data || [] : [],
            );
          } catch {
            setDifficultyOptions([]);
          }
          toast.success(
            t(
              "translation.workDetail.bssTypeChanged",
              "의뢰 유형이 변경되었습니다.",
            ),
          );
        } else {
          toast.error(res?.message || "의뢰 유형 변경에 실패했습니다.");
        }
      } catch (err) {
        toast.error(err?.message || "의뢰 유형 변경 중 오류가 발생했습니다.");
      }
    },
    [servCd, bssType, t],
  );

  // 번역 요청 상세 (req-dtl)
  useEffect(() => {
    const fetchReqDtl = async () => {
      try {
        const response = await getTranslateReqDtl(servCd);
        if (response.status === "SUCCESS") {
          setReqDtlData(response.data || []);
        }
      } catch (err) {
        console.error("ReqDtl fetch error:", err);
      }
    };
    if (servCd) fetchReqDtl();
  }, [servCd]);

  // 화자 정보 (번역 상세 API)
  useEffect(() => {
    const fetchTranslateDetail = async () => {
      try {
        const response = await getTranslateDetail(servCd);
        if (response.status === "SUCCESS") {
          setSpeakers(response.data?.speakers || []);
        }
      } catch (err) {
        console.error("TranslateDetail fetch error:", err);
      }
    };
    if (servCd) fetchTranslateDetail();
  }, [servCd]);

  // 파일 목록
  useEffect(() => {
    const fetchFiles = async () => {
      setFilesLoading(true);
      try {
        const response = await getFilesByServCd(servCd);
        if (Array.isArray(response)) {
          setFiles(response);
        } else if (response?.status === "SUCCESS") {
          setFiles(response.data || []);
        } else if (Array.isArray(response?.data)) {
          setFiles(response.data);
        } else {
          setFiles([]);
        }
      } catch {
        setFiles([]);
      } finally {
        setFilesLoading(false);
      }
    };
    if (servCd) fetchFiles();
  }, [servCd]);

  // 파일 목록 갱신 (난이도 변경 후 등)
  const refreshFiles = useCallback(async () => {
    try {
      const response = await getFilesByServCd(servCd);
      if (Array.isArray(response)) {
        setFiles(response);
      } else if (response?.status === "SUCCESS") {
        setFiles(response.data || []);
      } else if (Array.isArray(response?.data)) {
        setFiles(response.data);
      }
    } catch {
      // silent
    }
  }, [servCd]);

  // 첨부파일 목록
  useEffect(() => {
    const fetchAttachments = async () => {
      setAttachmentsLoading(true);
      try {
        const response = await getAttachmentsByServCd(servCd);
        if (Array.isArray(response)) {
          setAttachments(response);
        } else if (response?.status === "SUCCESS") {
          setAttachments(response.data || []);
        } else if (Array.isArray(response?.data)) {
          setAttachments(response.data);
        } else {
          setAttachments([]);
        }
      } catch {
        setAttachments([]);
      } finally {
        setAttachmentsLoading(false);
      }
    };
    if (servCd) fetchAttachments();
  }, [servCd]);

  const refreshAttachments = useCallback(async () => {
    try {
      const response = await getAttachmentsByServCd(servCd);
      if (Array.isArray(response)) {
        setAttachments(response);
      } else if (response?.status === "SUCCESS") {
        setAttachments(response.data || []);
      } else if (Array.isArray(response?.data)) {
        setAttachments(response.data);
      }
    } catch {
      // silent
    }
  }, [servCd]);

  // 파일 난이도 변경 핸들러
  const handleDifficultyChange = useCallback(
    async (fileNo, fileDifficultId) => {
      try {
        const res = await updateFileDifficultyByFileNo(fileNo, fileDifficultId);
        if (res.status === "SUCCESS") {
          refreshFiles();
        } else {
          alert(
            res.message ||
              t("translation.workDetail.alertDifficultyChangeFailed"),
          );
        }
      } catch (err) {
        alert(
          err.message ||
            t("translation.workDetail.alertDifficultyChangeFailed"),
        );
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
        t("translation.workDetail.bulkDifficultySuccess", {
          count: targets.length,
        }),
      );
      refreshFiles();
      setBulkDifficultyId("");
    } catch (err) {
      toast.error(
        err.message || t("translation.workDetail.alertDifficultyChangeFailed"),
      );
    } finally {
      setApplyingBulkDifficulty(false);
    }
  }, [bulkDifficultyId, selectedFileNos, refreshFiles, t]);

  // ========== 첨부파일 핸들러 ==========

  const openAttachmentUploadModal = useCallback(() => {
    setUploadSelectedFiles([]);
    setAttachmentUploadModal(true);
  }, []);

  const closeAttachmentUploadModal = useCallback(() => {
    setAttachmentUploadModal(false);
    setUploadSelectedFiles([]);
    if (attachmentFileInputRef.current) {
      attachmentFileInputRef.current.value = "";
    }
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

  const handleSaveStenoMemo = useCallback(async () => {
    setSavingStenoMemo(true);
    try {
      const res = await updateStenoMemo(servCd, editStenoMemo);
      if (res.status === "SUCCESS" || res.status === 200) {
        alert(t("translation.workDetail.alertMemoSaved"));
        setServ((prev) =>
          prev ? { ...prev, stenoMemo: editStenoMemo } : prev,
        );
      } else
        alert(res.message || t("translation.workDetail.alertMemoSaveFailed"));
    } catch (err) {
      alert(err.message || t("translation.workDetail.alertMemoSaveFailed"));
    } finally {
      setSavingStenoMemo(false);
    }
  }, [servCd, editStenoMemo, t]);

  const handleSaveAdminMemo = useCallback(async () => {
    setSavingAdminMemo(true);
    try {
      const res = await updateAdminMemo(servCd, editAdminMemo);
      if (res.status === "SUCCESS" || res.status === 200) {
        alert(t("translation.workDetail.alertMemoSaved"));
        setServ((prev) =>
          prev ? { ...prev, adminMemo: editAdminMemo } : prev,
        );
      } else
        alert(res.message || t("translation.workDetail.alertMemoSaveFailed"));
    } catch (err) {
      alert(err.message || t("translation.workDetail.alertMemoSaveFailed"));
    } finally {
      setSavingAdminMemo(false);
    }
  }, [servCd, editAdminMemo, t]);

  const handleAttachmentUploadSubmit = useCallback(async () => {
    if (uploadSelectedFiles.length === 0) {
      alert(t("translation.workDetail.uploadModal.alertSelectUploadFile"));
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
          alert(
            res.message ||
              t("translation.workDetail.uploadModal.alertUploadFailed"),
          );
          break;
        }
      }
      await refreshAttachments();
      closeAttachmentUploadModal();
    } catch (err) {
      alert(
        err.message ||
          t("translation.workDetail.uploadModal.alertUploadFailed"),
      );
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
      const apiFn =
        String(fileTp) === "9"
          ? getCustomerFileDownloadUrl
          : getSharedFileDownloadUrl;
      const res = await apiFn(fileNo);
      const data = res?.data || res;
      if (data?.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
      } else {
        alert(
          res?.message || t("translation.workDetail.alertDownloadUrlFailed"),
        );
      }
    } catch (err) {
      alert(err.message || t("translation.workDetail.alertDownloadUrlFailed"));
    }
  }, []);

  const handleAttachmentDelete = useCallback(
    async (fileNo) => {
      if (!confirm(t("translation.workDetail.confirmAttachmentDelete"))) return;
      try {
        const res = await deleteSharedFiles([String(fileNo)]);
        if (res.status === "SUCCESS" || res.data) {
          await refreshAttachments();
        } else {
          alert(
            res.message ||
              t("translation.workDetail.alertAttachmentDeleteFailed"),
          );
        }
      } catch (err) {
        alert(
          err.message ||
            t("translation.workDetail.alertAttachmentDeleteFailed"),
        );
      }
    },
    [refreshFiles],
  );

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
      } else
        alert(res.message || t("translation.workDetail.alertShareSaveFailed"));
    } catch (err) {
      alert(err.message || t("translation.workDetail.alertShareSaveFailed"));
    } finally {
      setSavingShare(false);
    }
  }, [servCd, selectedAttFileNos, visibleAttachments, refreshAttachments, t]);

  const handleBulkAttachmentDownload = useCallback(async () => {
    const selected = visibleAttachments.filter((a) =>
      selectedAttFileNos.has(a.fileNo),
    );
    for (const att of selected) {
      try {
        const tp = String(att.fileTp);
        const apiFn =
          tp === "9" ? getCustomerFileDownloadUrl : getSharedFileDownloadUrl;
        const res = await apiFn(att.fileNo);
        const d = res?.data ?? res;
        if (d?.downloadUrl) {
          const a = document.createElement("a");
          a.href = d.downloadUrl;
          a.download = att.fileNm || "";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } catch {
        /* silent */
      }
    }
  }, [selectedAttFileNos, visibleAttachments]);

  // 프로젝트 파일 목록 조회
  const fetchProjectFiles = useCallback(async (projectId) => {
    setProjectFilesMap((prev) => ({
      ...prev,
      [projectId]: { loading: true, data: prev[projectId]?.data || [] },
    }));
    try {
      const response = await getProjectFilesByProjectId(projectId);
      const data = response?.status === "SUCCESS" ? response.data || [] : [];
      setProjectFilesMap((prev) => ({
        ...prev,
        [projectId]: { loading: false, data },
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

  // 프로젝트 목록
  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const response = await getProjectsByServCd(servCd);
      if (response?.status === "SUCCESS") {
        const list = response.data || [];
        setProjects(list);
        if (isAdmin()) {
          setExpandedProjectIds(new Set(list.map((p) => p.id)));
        }
        list.forEach((p) => fetchProjectFiles(p.id));
        fetchWorksfyDetails(list);
      } else {
        setProjects([]);
      }
    } catch {
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, [servCd, fetchProjectFiles, fetchWorksfyDetails]);

  useEffect(() => {
    if (servCd) fetchProjects();
  }, [servCd, fetchProjects]);

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
    const typeOrder = { START: 0, MID: 1, FINAL: 2 };
    const sortByType = (list) =>
      [...list].sort(
        (a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99),
      );

    if (isAdmin()) return sortByType(projects);
    return sortByType(
      projects.filter((project) => {
        const pf = projectFilesMap[project.id];
        return pf?.data?.some(
          (f) => f.workerId === membId || f.checkerId === membId,
        );
      }),
    );
  }, [projects, projectFilesMap, membId, isAdmin]);

  const isProjectChecker = useCallback(
    (projectId) => {
      if (isAdmin()) return true;
      const pf = projectFilesMap[projectId];
      return pf?.data?.some((f) => f.checkerId === membId);
    },
    [projectFilesMap, membId, isAdmin],
  );

  // ========== 핸들러 ==========

  // 아코디언 토글
  const handleToggleProject = useCallback(
    (projectId) => {
      setExpandedProjectIds((prev) => {
        const next = new Set(prev);
        if (next.has(projectId)) {
          next.delete(projectId);
        } else {
          next.add(projectId);
          if (!projectFilesMap[projectId]?.data?.length) {
            fetchProjectFiles(projectId);
          }
        }
        return next;
      });
    },
    [projectFilesMap, fetchProjectFiles],
  );

  // 프로젝트 등록/수정 모달
  const openCreateProjectModal = useCallback(() => {
    if (files.some((f) => !f.fileDifficultId)) {
      toast.warning(t("translation.workDetail.toastDifficultyRequired"));
      return;
    }
    setProjectModal({ open: true, mode: "create", data: null });
  }, [files, t]);

  const openEditProjectModal = useCallback((project) => {
    setProjectModal({ open: true, mode: "edit", data: project });
  }, []);

  const closeProjectModal = useCallback(() => {
    setProjectModal({ open: false, mode: "create", data: null });
  }, []);

  const handleProjectSubmit = useCallback(
    async (formData) => {
      setProjectModalSubmitting(true);
      try {
        if (projectModal.mode === "create") {
          const response = await createProject({ servCd, ...formData });
          if (response?.status === "SUCCESS") {
            closeProjectModal();
            await fetchProjects();
          } else {
            alert(
              response?.message ||
                t("translation.workDetail.alertProjectCreateFailed"),
            );
          }
        } else {
          const response = await updateProject(projectModal.data.id, formData);
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
          } else {
            alert(
              response?.message ||
                t("translation.workDetail.alertProjectUpdateFailed"),
            );
          }
        }
      } catch (err) {
        alert(err.message || t("translation.workDetail.alertProcessError"));
      } finally {
        setProjectModalSubmitting(false);
      }
    },
    [projectModal, servCd, closeProjectModal, fetchProjects],
  );

  // 프로젝트 삭제
  const handleDeleteProject = useCallback(
    async (projectId) => {
      if (!confirm(t("translation.workDetail.confirmProjectDelete"))) return;
      try {
        const response = await deleteProject(projectId);
        if (response?.status === "SUCCESS") {
          await fetchProjects();
        } else {
          alert(
            response?.message ||
              t("translation.workDetail.alertProjectDeleteFailed"),
          );
        }
      } catch (err) {
        alert(
          err.message || t("translation.workDetail.alertProjectDeleteError"),
        );
      }
    },
    [fetchProjects],
  );

  // 파일 추가 모달
  const openFileAddModal = useCallback((projectId, projectType) => {
    setFileAddModal({ open: true, projectId, projectType });
  }, []);

  const closeFileAddModal = useCallback(() => {
    setFileAddModal({ open: false, projectId: null, projectType: null });
  }, []);

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
          } else {
            throw batchErr;
          }
        }
        if (response?.status === "SUCCESS") {
          closeFileAddModal();
          await fetchProjectFiles(projectId);
        } else {
          alert(
            response?.message || t("translation.workDetail.alertFileAddFailed"),
          );
        }
      } catch (err) {
        alert(err.message || t("translation.workDetail.alertFileAddError"));
      } finally {
        setFileAddSubmitting(false);
      }
    },
    [fileAddModal, closeFileAddModal, fetchProjectFiles],
  );

  // 웍스파이 등록 모달
  const openWorksfyRegisterModal = useCallback((project) => {
    setWorksfyRegisterModal({ open: true, project });
  }, []);

  const closeWorksfyRegisterModal = useCallback(() => {
    setWorksfyRegisterModal({ open: false, project: null });
  }, []);

  const handleWorksfyRegisterSubmit = useCallback(
    async (worksfyData) => {
      setWorksfyRegisterSubmitting(true);
      try {
        const response = await createWorksfyProject(worksfyData);
        if (response?.status === "SUCCESS") {
          const worksfyId = response.data?.id;
          if (worksfyId && worksfyRegisterModal.project?.id) {
            await updateProject(worksfyRegisterModal.project.id, {
              worksfyProjectKey: worksfyId,
            });
          }
          closeWorksfyRegisterModal();
          await fetchProjects();
        } else {
          alert(
            response?.message ||
              t("translation.workDetail.alertWorksfyRegisterFailed"),
          );
        }
      } catch (err) {
        alert(
          err.message || t("translation.workDetail.alertWorksfyRegisterError"),
        );
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
    if (!window.confirm(t("translation.workDetail.worksfyCloseConfirm")))
      return;

    setWorksfyClosingKeys((prev) => new Set(prev).add(key));
    try {
      const closeRes = await closeWorksfyProject(key);
      if (closeRes?.status === "SUCCESS") {
        const detailRes = await getWorksfyProject(key);
        if (detailRes?.status === "SUCCESS") {
          setWorksfyDetailsMap((prev) => ({ ...prev, [key]: detailRes.data }));
        }
      } else {
        alert(
          closeRes?.message || t("translation.workDetail.worksfyCloseFailed"),
        );
      }
    } catch (err) {
      alert(err.message || t("translation.workDetail.worksfyCloseError"));
    } finally {
      setWorksfyClosingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  // 웍스파이 모집인원 조회 모달
  const openWorksfyApplicantsModal = useCallback((worksfyProjectKey) => {
    if (!worksfyProjectKey) {
      alert(t("translation.workDetail.alertWorksfyRegisterFirst"));
      return;
    }
    setWorksfyApplicantsModal({ open: true, worksfyProjectKey });
  }, []);

  const closeWorksfyApplicantsModal = useCallback(() => {
    setWorksfyApplicantsModal({ open: false, worksfyProjectKey: null });
  }, []);

  // 작업자 배정 모달
  const openWorkerAssignModal = useCallback((project, pFile) => {
    setWorkerAssignModal({
      open: true,
      projectId: project.id,
      projectFileId: pFile.id,
      worksfyProjectKey: project.worksfyProjectKey || null,
    });
  }, []);

  const closeWorkerAssignModal = useCallback(() => {
    setWorkerAssignModal({
      open: false,
      projectId: null,
      projectFileId: null,
      worksfyProjectKey: null,
    });
  }, []);

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
          if (projectId) {
            await fetchProjectFiles(projectId);
          }
        } else {
          alert(
            response?.message ||
              t("translation.workDetail.alertWorkerAssignFailed"),
          );
        }
      } catch (err) {
        alert(
          err.message || t("translation.workDetail.alertWorkerAssignError"),
        );
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
          alert(t("translation.workDetail.alertWorkerAssignFailed"));
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
        alert(
          err.message || t("translation.workDetail.alertWorkerAssignError"),
        );
        setBatchAssignModal((prev) => ({ ...prev, loading: false }));
      }
    },
    [workerAssignModal, t],
  );

  // 작업자 해제
  const handleWorkerRemove = useCallback(
    async (projectId, projectFileId) => {
      if (!window.confirm(t("translation.workDetail.confirmWorkerRemove")))
        return;
      try {
        const response = await updateProjectFileWorkerId(projectFileId, null);
        if (response?.status === "SUCCESS") {
          if (projectId) await fetchProjectFiles(projectId);
        } else {
          alert(
            response?.message ||
              t("translation.workDetail.alertWorkerRemoveFailed"),
          );
        }
      } catch (err) {
        alert(
          err.message || t("translation.workDetail.alertWorkerRemoveError"),
        );
      }
    },
    [fetchProjectFiles],
  );

  // 검수자 배정 모달
  const openCheckerAssignModal = useCallback((project, pFile) => {
    setCheckerAssignModal({
      open: true,
      projectId: project.id,
      projectFileId: pFile.id,
      worksfyProjectKey: project.worksfyProjectKey || null,
    });
  }, []);

  const closeCheckerAssignModal = useCallback(() => {
    setCheckerAssignModal({
      open: false,
      projectId: null,
      projectFileId: null,
      worksfyProjectKey: null,
    });
  }, []);

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
          if (projectId) {
            await fetchProjectFiles(projectId);
          }
        } else {
          alert(
            response?.message ||
              t("translation.workDetail.alertCheckerAssignFailed"),
          );
        }
      } catch (err) {
        alert(
          err.message || t("translation.workDetail.alertCheckerAssignError"),
        );
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
          alert(t("translation.workDetail.alertCheckerAssignFailed"));
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
        alert(
          err.message || t("translation.workDetail.alertCheckerAssignError"),
        );
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
        alert(
          err.message || t("translation.workDetail.alertWorkerAssignError"),
        );
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

  // 검수자 해제
  const handleCheckerRemove = useCallback(
    async (projectId, projectFileId) => {
      if (!window.confirm(t("translation.workDetail.confirmCheckerRemove")))
        return;
      try {
        const response = await updateProjectFileCheckerId(projectFileId, null);
        if (response?.status === "SUCCESS") {
          if (projectId) await fetchProjectFiles(projectId);
        } else {
          alert(
            response?.message ||
              t("translation.workDetail.alertCheckerRemoveFailed"),
          );
        }
      } catch (err) {
        alert(
          err.message || t("translation.workDetail.alertCheckerRemoveError"),
        );
      }
    },
    [fetchProjectFiles],
  );

  // 프로젝트 파일 삭제
  const handleDeleteProjectFile = useCallback(
    async (projectId, projectFileId) => {
      if (!confirm(t("translation.workDetail.confirmProjectFileDelete")))
        return;
      try {
        const response = await deleteProjectFile(projectFileId);
        if (response?.status === "SUCCESS") {
          await fetchProjectFiles(projectId);
        } else {
          alert(
            response?.message ||
              t("translation.workDetail.alertProjectFileDeleteFailed"),
          );
        }
      } catch (err) {
        alert(
          err.message ||
            t("translation.workDetail.alertProjectFileDeleteError"),
        );
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

  // 작업 버튼 클릭 핸들러
  const handleGoWork = useCallback(
    (project, pFile) => {
      const isWorkerBlocked =
        !isAdmin() &&
        pFile?.workerId === membId &&
        isWorkStartBlockedStatus(pFile?.status);

      const role = project.type; // START / MID / FINAL
      const playTm = pFile.isSplit
        ? pFile.endSec - pFile.startSec
        : fileMap[pFile.fileNo]?.playTm || 0;
      const path = buildWorktoolPath({
        projectFileId: pFile.id,
        fileNo: pFile.fileNo,
        servCd,
        role,
        isSplit: !!pFile.isSplit,
        startSec: pFile.startSec,
        endSec: pFile.endSec,
        playTm,
        readonly: isWorkerBlocked,
        popup: true,
        workCategory: "translation",
      });
      window.open(path, `worktool_${pFile.id}`, "popup,width=1400,height=900");
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
    [isAdmin, membId, servCd, fileMap, updateProjectFileStatus],
  );

  // 검수 버튼 클릭 핸들러
  const handleGoReview = useCallback(
    (project, pFile) => {
      const role = `${project.type}_REVIEW`; // START_REVIEW / MID_REVIEW / FINAL_REVIEW
      const playTm = pFile.isSplit
        ? pFile.endSec - pFile.startSec
        : fileMap[pFile.fileNo]?.playTm || 0;
      const path = buildWorktoolPath({
        projectFileId: pFile.id,
        fileNo: pFile.fileNo,
        servCd,
        role,
        isSplit: !!pFile.isSplit,
        startSec: pFile.startSec,
        endSec: pFile.endSec,
        playTm,
        popup: true,
        workCategory: "translation",
      });
      window.open(path, `worktool_${pFile.id}`, "popup,width=1400,height=900");
      updateProjectFileStatus(project.id, pFile.id, "WORK_DONE", "REVIEWING");
    },
    [servCd, fileMap, updateProjectFileStatus],
  );

  // ========== AG Grid 설정 (파일 섹션) ==========
  const fileColumnDefs = useMemo(
    () => [
      ...(isAdmin()
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
        headerName: t("translation.workDetail.fileColumns.fileNo"),
        width: 100,
        cellClass: "ag-cell-center",
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          return params.data?.fileNo;
        },
      },
      {
        field: "fileNm",
        headerName: t("translation.workDetail.fileColumns.fileNm"),
        flex: 1,
        minWidth: 200,
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) {
            return (
              <span className="segment-cell-name">
                {t("translation.workDetail.segmentRowLabel", {
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
        headerName: t("translation.workDetail.fileColumns.fileSplit"),
        width: 120,
        cellClass: "ag-cell-center",
        sortable: false,
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          const isAssigned = assignedFileNos.has(params.data?.fileNo);
          if (isAssigned) {
            return (
              <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                {t("translation.workDetail.fileAssigned")}
              </span>
            );
          }
          if (!isAdmin()) {
            return params.data?.splitTp === "1"
              ? t("translation.workDetail.splitTpPartial")
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
              {t("translation.workDetail.fileSplitButton")}
            </button>
          );
        },
      },
      {
        headerName: t("translation.workDetail.fileColumns.splitYn"),
        width: 120,
        cellClass: "ag-cell-center",
        sortable: false,
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          const isSplitFile =
            params.data?.splitTp === "1" &&
            params.data?.timeSegments?.length > 0;
          if (!isSplitFile) {
            return t("translation.workDetail.splitTpFull");
          }
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
              {t("translation.workDetail.splitTpPartial")}
              <span className="segment-toggle-count">
                ({params.data.timeSegments.length})
              </span>
            </button>
          );
        },
      },
      {
        field: "fileDifficultId",
        headerName: t("translation.workDetail.fileColumns.difficulty"),
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
                <em>{t("translation.workDetail.selectDifficulty")}</em>
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
        headerName: t("translation.workDetail.fileColumns.playTm"),
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
        headerName: t("translation.workDetail.fileColumns.fileSize"),
        width: 120,
        cellClass: "ag-cell-center",
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) return null;
          return formatFileSize(params.value);
        },
      },
      {
        field: "overallStatus",
        headerName: t("translation.workDetail.fileColumns.status"),
        width: 180,
        cellClass: "ag-cell-center",
        cellRenderer: (params) => {
          if (params.data?._isSegmentRow) {
            const matches = params.data._projectMatches;
            if (!matches || matches.length === 0) {
              return (
                <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                  {t("translation.workDetail.segmentUnassigned")}
                </span>
              );
            }
            // 여러 프로젝트 상태를 종합: 가장 낮은(하위) 상태 하나만 표시
            const STATUS_RANK = {
              STANDBY: 0,
              WORKING: 1,
              WORK_DONE: 2,
              REVIEW_REJECT: 3,
              REVIEWING: 4,
              REVIEW_DONE: 5,
              READONLY: 5,
            };
            const lowestStatus = matches.reduce((lowest, m) => {
              const s = m.status || "STANDBY";
              return (STATUS_RANK[s] ?? 0) < (STATUS_RANK[lowest] ?? 0)
                ? s
                : lowest;
            }, matches[0]?.status || "STANDBY");
            return (
              <Chip
                label={t(`common.status_${lowestStatus}`)}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: "10px",
                  height: "20px",
                  fontWeight: 500,
                  ...getProjectStatusChipSx(lowestStatus),
                }}
              />
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
        headerName: t("translation.workDetail.fileColumns.download"),
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
                {t("translation.workDetail.buttonView")}
              </button>
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
                {t("translation.workDetail.buttonDownload")}
              </button>
            </div>
          );
        },
      },
    ],
    [
      getCodeLabel,
      difficultyOptions,
      handleDifficultyChange,
      t,
      isAdmin,
      expandedFileNos,
      toggleFileExpand,
      openFileSplitModal,
      assignedFileNos,
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
    if (params.data?._isSegmentRow) {
      return { background: "var(--bg-secondary, #fafafa)" };
    }
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
      navigate("/soribaro/translation/work");
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
      <div className="notion-page translation-work-detail-page">
        <div className="loading-container">
          <CircularProgress size={32} />
          <span>{t("common.loadingData")}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="notion-page translation-work-detail-page">
        <div className="error-container">
          <p>⚠️ {error}</p>
          <button className="btn-ghost" onClick={handleBack}>
            {t("translation.workDetail.backToListBottom")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="notion-page translation-work-detail-page">
      {/* 페이지 헤더 */}
      <div className="page-header">
        <div className="page-header-nav">
          <button className="btn-ghost" onClick={handleBack}>
            {t("translation.workDetail.backToList")}
          </button>
          {isAdmin() && serv?.cnlYn === "Y" && (
            <Chip
              label={t("common.alreadyCanceled")}
              size="small"
              color="error"
              variant="outlined"
            />
          )}
          {isAdmin() && serv?.cnlYn !== "Y" && (
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
            {serv?.servTitle || "-"}
          </h1>
          {(() => {
            const statusInfo = SERVICE_STATUSES.find(
              (s) => s.status === serv?.overallStatus,
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
            ) : serv?.overallStatus ? (
              <span style={{ fontSize: "12px" }}>{serv.overallStatus}</span>
            ) : null;
          })()}
        </div>
        <p className="page-description">
          {t("translation.workDetail.serviceCode", { code: serv?.servCd })}
          {isAdmin() && (
            <>
              {" "}
              ·{" "}
              {t("translation.workDetail.requester", {
                name: serv?.membNm || "-",
              })}
            </>
          )}{" "}
          ·{" "}
          {t("translation.workDetail.enterprise", { name: serv?.entNm || "-" })}
        </p>
      </div>

      {/* 기본 정보 */}
      <section className="detail-section">
        <h2 className="detail-section-title">
          {t("translation.workDetail.basicInfo")}
        </h2>
        <div className="info-card">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">
                {t("translation.workDetail.labelServCd")}
              </span>
              <span className="info-value">{serv?.servCd || "-"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">
                {t("translation.workDetail.labelTitle")}
              </span>
              <span className="info-value">{serv?.servTitle || "-"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">
                {t("translation.workDetail.labelEnterprise")}
              </span>
              <span className="info-value">{serv?.entNm || "-"}</span>
            </div>
            {isAdmin() && (
              <div className="info-item">
                <span className="info-label">
                  {t("translation.workDetail.labelRequesterName")}
                </span>
                <span className="info-value">{serv?.membNm || "-"}</span>
              </div>
            )}
            <div className="info-item">
              <span className="info-label">
                {t("translation.workDetail.labelBssType", "의뢰 타입")}
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
                      <em>
                        {t(
                          "translation.workDetail.selectBssType",
                          "의뢰 타입 선택",
                        )}
                      </em>
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
                {t("translation.workDetail.labelStartLang")}
              </span>
              <span className="info-value">
                {(() => {
                  const langs = [
                    ...new Map(
                      reqDtlData
                        .filter((d) => d.startLangYn === "Y")
                        .map((d) => [d.trnsLangCd, d]),
                    ).values(),
                  ];
                  if (langs.length === 0) return "-";
                  return langs
                    .map((d) => {
                      const mapped = LANGUAGES.find(
                        (l) => l.legacyCode === d.trnsLangCd,
                      );
                      return mapped
                        ? `${mapped.flag} ${d.trnsLangNm}`
                        : d.trnsLangNm;
                    })
                    .join(", ");
                })()}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">
                {t("translation.workDetail.labelMidLang")}
              </span>
              <span className="info-value">
                {(() => {
                  const langs = [
                    ...new Map(
                      reqDtlData
                        .filter((d) => d.midLangYn === "Y")
                        .map((d) => [d.trnsLangCd, d]),
                    ).values(),
                  ];
                  if (langs.length === 0) return "-";
                  return langs
                    .map((d) => {
                      const mapped = LANGUAGES.find(
                        (l) => l.legacyCode === d.trnsLangCd,
                      );
                      return mapped
                        ? `${mapped.flag} ${d.trnsLangNm}`
                        : d.trnsLangNm;
                    })
                    .join(", ");
                })()}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">
                {t("translation.workDetail.labelTargetLang")}
              </span>
              <span className="info-value">
                {(() => {
                  const langs = reqDtlData.filter(
                    (d) => d.startLangYn !== "Y" && d.midLangYn !== "Y",
                  );
                  if (langs.length === 0) return "-";
                  const unique = [
                    ...new Map(langs.map((d) => [d.trnsLangCd, d])).values(),
                  ];
                  return unique
                    .map((d) => {
                      const mapped = LANGUAGES.find(
                        (l) => l.legacyCode === d.trnsLangCd,
                      );
                      return mapped
                        ? `${mapped.flag} ${d.trnsLangNm}`
                        : d.trnsLangNm;
                    })
                    .join(", ");
                })()}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 세부 요청사항 메모 3컬럼 */}
      <section className="detail-section">
        <div
          className={`memo-row ${isAdmin() ? "memo-row-3col" : "memo-row-1col"}`}
        >
          {isAdmin() && (
            <div className="memo-row-col">
              <h3 className="memo-row-title">
                {t("translation.workDetail.sectionDetailRequest")}
              </h3>
              <div className="remark-readonly">
                {serv?.remark ? (
                  <p className="remark-text">{serv.remark}</p>
                ) : (
                  <p className="remark-empty">
                    {t("translation.workDetail.noDetailRequest")}
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="memo-row-col">
            <div className="memo-row-title-row">
              <h3 className="memo-row-title">
                {t("translation.workDetail.sectionStenoMemo")}
              </h3>
              {isAdmin() && (
                <button
                  type="button"
                  className="memo-copy-btn"
                  onClick={() => setEditStenoMemo(serv.remark)}
                  disabled={!serv?.remark}
                >
                  {t("translation.workDetail.copyFromRequest")}
                </button>
              )}
            </div>
            {isAdmin() ? (
              <div className="memo-card">
                <textarea
                  className="memo-textarea"
                  value={editStenoMemo}
                  onChange={(e) => setEditStenoMemo(e.target.value)}
                  placeholder={t("translation.workDetail.stenoMemoPlaceholder")}
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
                      : t("translation.workDetail.buttonSaveMemo")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="remark-readonly">
                {serv?.stenoMemo ? (
                  <p className="remark-text">{serv.stenoMemo}</p>
                ) : (
                  <p className="remark-empty">-</p>
                )}
              </div>
            )}
          </div>
          {isAdmin() && (
            <div className="memo-row-col">
              <h3 className="memo-row-title">
                {t("translation.workDetail.sectionAdminMemo")}
              </h3>
              <div className="memo-card">
                <textarea
                  className="memo-textarea"
                  value={editAdminMemo}
                  onChange={(e) => setEditAdminMemo(e.target.value)}
                  placeholder={t("translation.workDetail.adminMemoPlaceholder")}
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
                      : t("translation.workDetail.buttonSaveMemo")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 파일 목록 (관리자만 노출) */}
      {isAdmin() && (
        <section className="detail-section">
          <div
            className="detail-section-header"
            style={{
              justifyContent: "flex-start",
              gap: "12px",
              alignItems: "baseline",
            }}
          >
            <h2 className="detail-section-title">
              {t("translation.workDetail.filesSection")}
            </h2>
            {serv?.cnlYn !== "Y" && (
              <Button size="small" onClick={() => setRequestFileAddModal(true)}>
                {t("common.addRequestFile")}
              </Button>
            )}
          </div>
          {isAdmin() && files.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
                flexWrap: "wrap",
              }}
            >
              <Button
                size="small"
                variant="outlined"
                disabled={selectedFileNos.size === 0}
                onClick={handleDownloadOriginal}
              >
                {t("translation.workDetail.downloadOriginal")}
                {selectedFileNos.size > 0 && ` (${selectedFileNos.size})`}
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={reviewDoneSelectedFiles.length === 0}
                onClick={() => setBulkDownloadOpen(true)}
              >
                {t("translation.workDetail.downloadOutput")}
                {reviewDoneSelectedFiles.length > 0 &&
                  ` (${reviewDoneSelectedFiles.length})`}
              </Button>
              {difficultyOptions.length > 0 && (
                <>
                  <Select
                    size="small"
                    value={bulkDifficultyId}
                    onChange={(e) => setBulkDifficultyId(e.target.value)}
                    displayEmpty
                    sx={{ fontSize: "12px", minWidth: 120, height: 30 }}
                  >
                    <MenuItem value="" disabled>
                      <em>{t("translation.workDetail.selectDifficulty")}</em>
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
                      : t("translation.workDetail.applyBulkDifficulty", {
                          count: selectedFileNos.size,
                        })}
                  </Button>
                </>
              )}
            </div>
          )}
          <div className="files-grid-container">
            {filesLoading ? (
              <div className="files-loading">
                <CircularProgress size={24} />
                <span>{t("translation.workDetail.filesLoading")}</span>
              </div>
            ) : files.length === 0 ? (
              <div className="files-empty">
                {t("translation.workDetail.noFiles")}
              </div>
            ) : (
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
                rowSelection={isAdmin() ? "multiple" : undefined}
                onSelectionChanged={(e) => {
                  const selected = e.api
                    .getSelectedRows()
                    .filter((r) => !r._isSegmentRow);
                  setSelectedFileNos(new Set(selected.map((r) => r.fileNo)));
                }}
                overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${t("translation.workDetail.noFiles")}</span>`}
              />
            )}
          </div>
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
              <h3>{t("translation.workDetail.uploadModal.title")}</h3>
              <button
                className="notion-modal-close"
                onClick={closeAttachmentUploadModal}
              >
                ✕
              </button>
            </div>
            <div className="notion-modal-body">
              <div className="form-group">
                <label>
                  {t("translation.workDetail.uploadModal.labelFileSelect")}
                </label>
                <div
                  className="attachment-dropzone"
                  onClick={() => attachmentFileInputRef.current?.click()}
                >
                  <span className="attachment-dropzone-placeholder">
                    {t("translation.workDetail.uploadModal.clickToSelect")}
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
                    ? t("translation.workDetail.uploadModal.uploading")
                    : t("translation.workDetail.uploadModal.upload")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 첨부파일 */}
      <section className="detail-section attachment-section">
        <div className="detail-section-header">
          <h2 className="detail-section-title">
            {t("translation.workDetail.attachmentSection")}
          </h2>
          <div className="detail-section-header-actions">
            {visibleAttachments.length > 0 &&
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
              {t("translation.workDetail.uploadFile")}
            </button>
          </div>
        </div>

        {attachmentsLoading ? (
          <div className="files-loading">
            <CircularProgress size={24} />
            <span>{t("translation.workDetail.attachmentsLoading")}</span>
          </div>
        ) : visibleAttachments.length === 0 ? (
          <div className="files-empty">
            {t("translation.workDetail.noAttachments")}
          </div>
        ) : (
          <table className="attachment-table">
            <thead>
              <tr>
                {isAdmin() && (
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
                <th>
                  {t("translation.workDetail.attachmentColumns.fileName")}
                </th>
                <th>{t("translation.workDetail.attachmentColumns.type")}</th>
                <th>
                  {t("translation.workDetail.attachmentColumns.fileSize")}
                </th>
                <th>{t("translation.workDetail.attachmentColumns.regDate")}</th>
                {isAdmin() && (
                  <th>
                    {t("translation.workDetail.attachmentColumns.shareYn")}
                  </th>
                )}
                <th>{t("translation.workDetail.attachmentColumns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleAttachments.map((att) => {
                const isShared = att.shareYn === "Y";
                return (
                  <tr key={att.fileNo}>
                    {isAdmin() && (
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
                        label={
                          String(att.fileTp) === "9"
                            ? t("translation.workDetail.customerAttachment")
                            : t("translation.workDetail.sharedFile")
                        }
                        size="small"
                        variant="outlined"
                        sx={{
                          fontSize: "11px",
                          height: "20px",
                          fontWeight: 500,
                          ...(String(att.fileTp) === "9"
                            ? getChipSxFromColor("#f57c00")
                            : getChipSxFromColor("#1976d2")),
                        }}
                      />
                    </td>
                    <td className="att-center">
                      {formatFileSize(att.fileSize)}
                    </td>
                    <td className="att-center">
                      {formatRegDttm(att.regDttm)}
                    </td>
                    {isAdmin() && (
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
                              ? getChipSxFromColor("#2e7d32")
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
                        {t("translation.workDetail.download")}
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
            {t("translation.workDetail.projectSection")}
          </h2>
          {isAdmin() && (
            <button className="btn-primary" onClick={openCreateProjectModal}>
              {t("translation.workDetail.newProject")}
            </button>
          )}
        </div>

        {projectsLoading ? (
          <div className="files-loading">
            <CircularProgress size={24} />
            <span>{t("translation.workDetail.projectsLoading")}</span>
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="files-empty">
            {t("translation.workDetail.noProjects")}
          </div>
        ) : (
          <div className="project-accordion-list">
            {visibleProjects.map((project) => {
              const isExpanded = expandedProjectIds.has(project.id);
              const pf = projectFilesMap[project.id] || {
                loading: false,
                data: [],
              };

              return (
                <div
                  key={project.id}
                  className={`project-accordion ${isExpanded ? "expanded" : ""}`}
                >
                  {/* 아코디언 헤더 */}
                  <div
                    className="project-accordion-header"
                    onClick={() => handleToggleProject(project.id)}
                  >
                    <span className="accordion-arrow">
                      {isExpanded ? "▼" : "▶"}
                    </span>
                    <span className="accordion-title">{project.title}</span>
                    {project.type &&
                      (() => {
                        const typeColors = PROJECT_TYPE_COLORS[
                          project.type
                        ] || {
                          bg: "#f5f5f5",
                          color: "#757575",
                          border: "#bdbdbd",
                        };
                        return (
                          <Chip
                            label={t(`common.projectType_${project.type}`)}
                            size="small"
                            variant="outlined"
                            sx={{
                              backgroundColor: typeColors.bg,
                              color: typeColors.color,
                              borderColor: typeColors.border,
                              fontWeight: 500,
                              fontSize: "11px",
                              height: "20px",
                              marginLeft: "8px",
                            }}
                          />
                        );
                      })()}
                    {project.lang &&
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
                        {t("translation.workDetail.workerCount", {
                          count: project.workerCnt,
                        })}
                      </span>
                      <span className="accordion-badge">
                        {t("translation.workDetail.unitPrice", {
                          price: project.price ?? "-",
                        })}
                      </span>
                      <span className="accordion-badge badge-recruit">
                        {t("translation.workDetail.recruitPeriod", {
                          start: formatISODateOnly(project.recruitStart),
                          end: formatISODateOnly(project.recruitEnd),
                        })}
                      </span>
                      <span className="accordion-badge badge-work">
                        {t("translation.workDetail.workPeriod", {
                          start: formatISODateOnly(project.workStart),
                          end: formatISODateOnly(project.workEnd),
                        })}
                      </span>
                      {project.isImportant && (
                        <Chip
                          label={t("translation.workDetail.important")}
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
                          label={t("translation.workDetail.anyWorkerApply")}
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
                            label={t("translation.workDetail.worksfyClosed")}
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

                  {/* 아코디언 바디 */}
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
                              openFileAddModal(project.id, project.type);
                            }}
                          >
                            {t("translation.workDetail.addFile")}
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
                                    "translation.workDetail.worksfyDeleteNotice",
                                  ),
                                );
                              }}
                              style={{ color: "var(--accent-secondary)" }}
                            >
                              {t("translation.workDetail.worksfyDelete")}
                            </button>
                          ) : (
                            <button
                              className="btn-ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                openWorksfyRegisterModal(project);
                              }}
                            >
                              {t("translation.workDetail.worksfyRegister")}
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
                            {t("translation.workDetail.viewApplicants")}
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
                                {t("translation.workDetail.worksfyClose")}
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
                            {t("translation.workDetail.deleteProject")}
                          </button>
                        )}
                      </div>

                      {/* 프로젝트 파일 목록 */}
                      <div className="project-files-area">
                        {pf.loading ? (
                          <div
                            className="files-loading"
                            style={{ padding: "20px" }}
                          >
                            <CircularProgress size={20} />
                            <span>
                              {t("translation.workDetail.filesLoadingShort")}
                            </span>
                          </div>
                        ) : pf.data.length === 0 ? (
                          <div
                            className="files-empty"
                            style={{ padding: "20px" }}
                          >
                            {t("translation.workDetail.noProjectFiles")}
                          </div>
                        ) : (
                          <table className="project-files-table">
                            <thead>
                              <tr>
                                <th>
                                  {t(
                                    "translation.workDetail.projectFileColumns.fileName",
                                  )}
                                </th>
                                <th>
                                  {t(
                                    "translation.workDetail.projectFileColumns.split",
                                  )}
                                </th>
                                <th>
                                  {t(
                                    "translation.workDetail.projectFileColumns.range",
                                  )}
                                </th>
                                <th>
                                  {t(
                                    "translation.workDetail.projectFileColumns.playTime",
                                  )}
                                </th>
                                <th>
                                  {t(
                                    "translation.workDetail.projectFileColumns.status",
                                  )}
                                </th>
                                <th>
                                  {t(
                                    "translation.workDetail.projectFileColumns.worker",
                                  )}
                                </th>
                                <th>
                                  {t(
                                    "translation.workDetail.projectFileColumns.checker",
                                  )}
                                </th>
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
                                        {srcFile?.fileNm || `#${pFile.fileNo}`}
                                      </td>
                                      <td className="pf-center">
                                        {pFile.isSplit ? (
                                          <Chip
                                            label={t(
                                              "translation.workDetail.splitLabel",
                                            )}
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
                                                handleOpenWorkTimeEdit(pFile);
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
                                                "translation.workDetail.assignWorker",
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
                                                "translation.workDetail.assignChecker",
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
                                            {t("translation.workDetail.work")}
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
                                            {t("translation.workDetail.review")}
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
                          label={t("translation.workDetail.adminMessage")}
                          value={project.adminMessage}
                          onSaved={fetchProjects}
                          readOnly={!isAdmin()}
                        />
                        <MessageEditor
                          projectId={project.id}
                          field="workerMessage"
                          label={t("translation.workDetail.workerMessage")}
                          value={project.workerMessage}
                          onSaved={fetchProjects}
                          readOnly={isAdmin()}
                        />
                        <MessageEditor
                          projectId={project.id}
                          field="checkerMessage"
                          label={t("translation.workDetail.checkerMessage")}
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

      {/* 하단 버튼 */}
      <div className="page-footer">
        <button className="btn-ghost" onClick={handleBack}>
          {t("translation.workDetail.backToListBottom")}
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
        reqDtlData={reqDtlData}
      />
      <ProjectFileAddModal
        open={fileAddModal.open}
        files={files}
        existingProjectFiles={sameTypeProjectFiles}
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
        isTranslation={true}
      />
      <FormatModal
        isOpen={downloadMenu.open}
        mode="export"
        onClose={() =>
          setDownloadMenu({ open: false, fileNo: null, fileNm: "" })
        }
        onSelect={handleFormatSelect}
      />
      <FormatModal
        isOpen={bulkDownloadOpen}
        mode="export"
        onClose={() => setBulkDownloadOpen(false)}
        onSelect={handleBulkFormatSelect}
      />

      <RequestFileAddModal
        open={requestFileAddModal}
        servCd={servCd}
        onClose={() => setRequestFileAddModal(false)}
        onSuccess={refreshFiles}
      />
    </div>
  );
}
