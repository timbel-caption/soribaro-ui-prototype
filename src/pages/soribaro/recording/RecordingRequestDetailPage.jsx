import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import { getChipSxFromColor } from "../../../utils/projectStatusUtils";
import Button from "@mui/material/Button";
import {
  getRecordWorkRequestDetail,
  confirmRecordWorkRequest,
  updateRecordWorkRequestPrice,
  getFilesByServCd,
  getFileDownloadUrl,
  getAttachmentsByServCd,
  uploadSharedFile,
  getSharedFileDownloadUrl,
  getCustomerFileDownloadUrl,
  deleteSharedFiles,
  updateStenoMemo,
  updateAdminMemo,
  updateAttachmentShare,
  cancelServ,
} from "../../../api/v9";
import { useUserStore } from "../../../stores/userStore";
import { useTranslation } from 'react-i18next';
import "../../../styles/notion-list.css";
import "../translation/TranslationWorkDetailPage.css";
import "./RecordingRequestDetailPage.css";

const formatFileSize = (bytes) => {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatSec = (sec) => {
  if (sec == null) return '-';
  const totalSec = Math.floor(Number(sec));
  if (isNaN(totalSec)) return sec;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatAmount = (value) => {
  if (value == null) return "-";
  return Number(value).toLocaleString();
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

const formatRecDate = (raw) => {
  if (!raw) return "-";
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
  }
  return raw;
};

const getAttachmentChipProps = (fileTp, t) => {
  const tp = String(fileTp);
  if (tp === "8") return {
    label: t('recording.customerAttachmentFront'),
    sx: { fontSize: "11px", height: "20px", fontWeight: 500, ...getChipSxFromColor("#c62828") },
  };
  if (tp === "9") return {
    label: t('recording.customerAttachmentAdmin'),
    sx: { fontSize: "11px", height: "20px", fontWeight: 500, ...getChipSxFromColor("#f57c00") },
  };
  return {
    label: t('common.sharedFile'),
    sx: { fontSize: "11px", height: "20px", fontWeight: 500, ...getChipSxFromColor("#1976d2") },
  };
};

export default function RecordingRequestDetailPage() {
  const { t } = useTranslation('soribaro');
  const { servCd } = useParams();
  const navigate = useNavigate();
  const attachmentFileInputRef = useRef(null);

  const isAdmin = useUserStore((s) => s.isAdmin);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [editWorkPrice, setEditWorkPrice] = useState(null);
  const [savingPrice, setSavingPrice] = useState(false);

  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [expandedFileNos, setExpandedFileNos] = useState(new Set());

  const [editStenoMemo, setEditStenoMemo] = useState('');
  const [savingStenoMemo, setSavingStenoMemo] = useState(false);
  const [editAdminMemo, setEditAdminMemo] = useState('');
  const [savingAdminMemo, setSavingAdminMemo] = useState(false);

  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [attachmentUploadModal, setAttachmentUploadModal] = useState(false);
  const [uploadSelectedFiles, setUploadSelectedFiles] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [shareEdits, setShareEdits] = useState({});
  const [savingShare, setSavingShare] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const speakersByFile = useMemo(() => {
    const speakers = data?.speakers || [];
    const map = {};
    speakers.forEach((s) => {
      if (!map[s.fileNo]) map[s.fileNo] = [];
      map[s.fileNo].push(s);
    });
    return map;
  }, [data?.speakers]);

  useEffect(() => {
    if (!servCd) return;
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getRecordWorkRequestDetail(servCd);
        if (res.status === "SUCCESS") {
          setData(res.data);
          setEditWorkPrice(res.data?.workPrice ?? 0);
          setEditStenoMemo(res.data?.stenoMemo || '');
          setEditAdminMemo(res.data?.adminMemo || '');
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
            const shareMap = {};
            res.data.attachments.forEach((a) => {
              shareMap[a.fileNo] = a.shareYn || 'N';
            });
            setShareEdits(shareMap);
          }
        } else {
          setError(res.message || t('common.loadDetailFailed'));
        }
      } catch (err) {
        setError(err.message || t('common.loadDetailFailed'));
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [servCd]);

  useEffect(() => {
    if (!servCd) return;
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
    fetchAttachments();
  }, [servCd]);

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

  const handlePriceConfirm = useCallback(async () => {
    if (editWorkPrice == null || editWorkPrice === "") {
      alert(t('recording.alertEnterWorkPrice'));
      return;
    }
    if (
      !window.confirm(
        t('recording.confirmPriceChange', { price: Number(editWorkPrice).toLocaleString() }),
      )
    )
      return;
    setSavingPrice(true);
    try {
      const res = await updateRecordWorkRequestPrice(
        servCd,
        Number(editWorkPrice),
      );
      if (res.status === "SUCCESS") {
        alert(t('recording.alertPriceUpdated'));
        setData((prev) =>
          prev ? { ...prev, fixPrice: Number(editWorkPrice) } : prev,
        );
      } else {
        alert(res.message || t('recording.alertPriceUpdateFailed'));
      }
    } catch (err) {
      alert(err.message || t('recording.alertPriceUpdateError'));
    } finally {
      setSavingPrice(false);
    }
  }, [servCd, editWorkPrice]);

  const handleFileDownload = useCallback(async (fileNo) => {
    try {
      const res = await getFileDownloadUrl(fileNo);
      const d = res?.data || res;
      if (d?.url) window.open(d.url, "_blank");
      else alert(res?.message || t('common.downloadUrlFailed'));
    } catch (err) {
      alert(err.message || t('common.downloadUrlFailed'));
    }
  }, [t]);

  const handleConfirm = useCallback(async () => {
    if (!window.confirm(t('recording.confirmRequest')))
      return;
    setConfirming(true);
    try {
      const title = confirmTitle.trim() || `${data?.servCd}-${data?.membNm || ''}`;
      const res = await confirmRecordWorkRequest(servCd, title);
      if (res.status === "SUCCESS") {
        alert(t('recording.alertRequestConfirmed'));
        navigate("/soribaro/recording/work");
      } else {
        alert(res.message || t('recording.alertRequestConfirmFailed'));
      }
    } catch (err) {
      alert(err.message || t('recording.alertRequestConfirmError'));
    } finally {
      setConfirming(false);
    }
  }, [servCd, navigate, confirmTitle, data]);

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
      const unique = newFiles.filter((f) => !existing.has(`${f.name}_${f.size}`));
      return [...prev, ...unique];
    });
    if (attachmentFileInputRef.current) attachmentFileInputRef.current.value = "";
  }, []);
  const handleRemoveSelectedFile = useCallback((index) => {
    setUploadSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAttachmentUploadSubmit = useCallback(async () => {
    if (uploadSelectedFiles.length === 0) {
      alert(t('common.alertSelectFileToUpload'));
      return;
    }
    setUploadingAttachment(true);
    try {
      for (const file of uploadSelectedFiles) {
        const res = await uploadSharedFile(file, servCd);
        if (res.status !== "SUCCESS" && !res.data) {
          alert(res.message || t('common.fileUploadFailed'));
          break;
        }
      }
      await refreshAttachments();
      closeAttachmentUploadModal();
    } catch (err) {
      alert(err.message || t('common.fileUploadFailed'));
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
      const apiFn = (tp === "8" || tp === "9")
        ? getCustomerFileDownloadUrl
        : getSharedFileDownloadUrl;
      const res = await apiFn(fileNo);
      const d = res?.data || res;
      if (d?.downloadUrl) window.open(d.downloadUrl, "_blank");
      else alert(res?.message || t('common.downloadUrlFailed'));
    } catch (err) {
      alert(err.message || t('common.downloadUrlFailed'));
    }
  }, [t]);

  const handleAttachmentDelete = useCallback(
    async (fileNo) => {
      if (!confirm(t('common.confirmDeleteAttachment'))) return;
      try {
        const res = await deleteSharedFiles([String(fileNo)]);
        if (res.status === "SUCCESS" || res.data) await refreshAttachments();
        else alert(res.message || t('common.fileDeleteFailed'));
      } catch (err) {
        alert(err.message || t('common.fileDeleteFailed'));
      }
    },
    [refreshAttachments],
  );

  const handleSaveStenoMemo = useCallback(async () => {
    setSavingStenoMemo(true);
    try {
      const res = await updateStenoMemo(servCd, editStenoMemo);
      if (res.status === "SUCCESS" || res.status === 200) {
        alert(t('recording.alertMemoSaved'));
        setData((prev) => prev ? { ...prev, stenoMemo: editStenoMemo } : prev);
      } else {
        alert(res.message || t('recording.alertMemoSaveFailed'));
      }
    } catch (err) {
      alert(err.message || t('recording.alertMemoSaveFailed'));
    } finally {
      setSavingStenoMemo(false);
    }
  }, [servCd, editStenoMemo, t]);

  const handleSaveAdminMemo = useCallback(async () => {
    setSavingAdminMemo(true);
    try {
      const res = await updateAdminMemo(servCd, editAdminMemo);
      if (res.status === "SUCCESS" || res.status === 200) {
        alert(t('recording.alertMemoSaved'));
        setData((prev) => prev ? { ...prev, adminMemo: editAdminMemo } : prev);
      } else {
        alert(res.message || t('recording.alertMemoSaveFailed'));
      }
    } catch (err) {
      alert(err.message || t('recording.alertMemoSaveFailed'));
    } finally {
      setSavingAdminMemo(false);
    }
  }, [servCd, editAdminMemo, t]);

  const handleSaveShare = useCallback(async () => {
    setSavingShare(true);
    try {
      const filesPayload = Object.entries(shareEdits).map(([fileNo, shareYn]) => ({
        fileNo: Number(fileNo),
        shareYn,
      }));
      const res = await updateAttachmentShare(servCd, filesPayload);
      if (res.status === "SUCCESS" || res.status === 200) {
        alert(t('recording.alertShareSaved'));
      } else {
        alert(res.message || t('recording.alertShareSaveFailed'));
      }
    } catch (err) {
      alert(err.message || t('recording.alertShareSaveFailed'));
    } finally {
      setSavingShare(false);
    }
  }, [servCd, shareEdits, t]);

  const toggleFileExpand = useCallback((fileNo) => {
    setExpandedFileNos((prev) => {
      const next = new Set(prev);
      if (next.has(fileNo)) next.delete(fileNo);
      else next.add(fileNo);
      return next;
    });
  }, []);

  const handleBack = () => navigate(-1);

  const handleCancelServ = useCallback(async () => {
    if (!confirm(t("common.confirmCancelWork"))) return;
    if (!files.length) {
      alert(t("common.cancelWorkFailed"));
      return;
    }
    setCancelling(true);
    try {
      for (const file of files) {
        await cancelServ(servCd, file.fileNo);
      }
      alert(t("common.cancelWorkSuccess"));
      navigate(-1);
    } catch (err) {
      console.error("Cancel error:", err);
      alert(t("common.cancelWorkFailed"));
    } finally {
      setCancelling(false);
    }
  }, [files, servCd, t, navigate]);

  const isCanceled = data?.cnlYn === "Y";

  if (loading) {
    return (
      <div className="notion-page translation-work-detail-page record-request-detail-page">
        <div className="loading-container">
          <CircularProgress size={28} />
          <span>{t('common.loadingDetail')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="notion-page translation-work-detail-page record-request-detail-page">
        <div className="error-container">
          <span>{error}</span>
          <button className="btn-ghost" onClick={handleBack}>
            {t('common.backToList')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="notion-page translation-work-detail-page record-request-detail-page">
      {/* 헤더 */}
      <div className="page-header">
        <div className="page-header-nav">
          <button className="btn-ghost" onClick={handleBack}>
            {t('recording.backToRequestList')}
          </button>
          {isAdmin() && isCanceled && (
            <Chip
              label={t("common.alreadyCanceled")}
              size="small"
              color="error"
              variant="outlined"
            />
          )}
          {isAdmin() && !isCanceled && (
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
        <h1 className="page-title">{t('recording.requestDetailTitle')}</h1>
        <p className="page-description">
          {t('recording.requestDetailDescription', { servCd: data?.servCd, membNm: data?.membNm || '-', fileTp: data?.fileTp || '-' })}
        </p>
      </div>

      {/* 공통 정보 */}
      <section className="detail-section">
        <h2 className="detail-section-title">{t('recording.sectionRequestInfo')}</h2>
        <div className="info-card">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">{t('recording.labelServiceCode')}</span>
              <span className="info-value">{data?.servCd || "-"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('recording.labelRequester')}</span>
              <span className="info-value">{data?.membNm || "-"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('recording.labelContact')}</span>
              <span className="info-value">{data?.mblTelNo || "-"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('recording.labelRegistrationDateTime')}</span>
              <span className="info-value">{data?.regDttm || "-"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('recording.labelFileType')}</span>
              <span className="info-value">{data?.fileTp || "-"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('recording.labelStatus')}</span>
              <span className="info-value">{data?.workStatNm || "-"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('recording.labelCancelStatus')}</span>
              <span className="info-value">
                {isCanceled ? t('common.canceledStatus') : t('common.normalLabel')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 메모 3컬럼 */}
      <section className="detail-section">
        <div className={`memo-row ${isAdmin() ? 'memo-row-3col' : 'memo-row-2col'}`}>
          <div className="memo-row-col">
            <h3 className="memo-row-title">{t('recording.sectionDetailRequest')}</h3>
            <div className="remark-readonly">
              {data?.remark ? (
                <p className="remark-text">{data.remark}</p>
              ) : (
                <p className="remark-empty">{t('recording.noDetailRequest')}</p>
              )}
            </div>
          </div>
          <div className="memo-row-col">
            <h3 className="memo-row-title">{t('recording.sectionStenoMemo')}</h3>
            <div className="memo-card">
              <textarea className="memo-textarea" value={editStenoMemo} onChange={(e) => setEditStenoMemo(e.target.value)} placeholder={t('recording.stenoMemoPlaceholder')} rows={4} />
              <div className="memo-actions">
                <button className="memo-save-btn" onClick={handleSaveStenoMemo} disabled={savingStenoMemo}>
                  {savingStenoMemo ? t('common.saving') : t('recording.buttonSaveMemo')}
                </button>
              </div>
            </div>
          </div>
          {isAdmin() && (
            <div className="memo-row-col">
              <h3 className="memo-row-title">{t('recording.sectionAdminMemo')}</h3>
              <div className="memo-card">
                <textarea className="memo-textarea" value={editAdminMemo} onChange={(e) => setEditAdminMemo(e.target.value)} placeholder={t('recording.adminMemoPlaceholder')} rows={4} />
                <div className="memo-actions">
                  <button className="memo-save-btn" onClick={handleSaveAdminMemo} disabled={savingAdminMemo}>
                    {savingAdminMemo ? t('common.saving') : t('recording.buttonSaveMemo')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 결제 정보 */}
      <section className="detail-section">
        <h2 className="detail-section-title">{t('recording.sectionPaymentInfo')}</h2>
        <div className="info-card">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">{t('recording.labelPaymentType')}</span>
              <span className="info-value">
                {data?.payTpNm || data?.payTp || "-"}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('recording.labelPaymentTid')}</span>
              <span className="info-value">{data?.payTid || "-"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('recording.labelPayer')}</span>
              <span className="info-value">{data?.payerNm || "-"}</span>
            </div>
            <div className="info-item info-item-wide">
              <span className="info-label">{t('recording.labelWorkPriceEdit')}</span>
              <span className="info-value">
                <div className="price-edit-group">
                  <input
                    type="number"
                    className="price-edit-input"
                    value={editWorkPrice ?? ""}
                    onChange={(e) =>
                      setEditWorkPrice(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    min="0"
                    step="10"
                  />
                  <span className="price-edit-unit">{t('common.wonUnit')}</span>
                  <button
                    className="btn-price-confirm"
                    onClick={handlePriceConfirm}
                    disabled={savingPrice || isCanceled}
                  >
                    {savingPrice ? t('common.saving') : t('recording.buttonPriceConfirm')}
                  </button>
                </div>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 금액 정보 */}
      <section className="detail-section">
        <h2 className="detail-section-title">{t('recording.sectionAmountInfo')}</h2>
        <div className="price-card">
          <div className="price-item">
            <span className="price-label">{t('recording.labelWorkPrice')}</span>
            <span className="price-value">
              {t('recording.amountWithWon', { amount: formatAmount(editWorkPrice ?? data?.workPrice) })}
            </span>
          </div>
          <div className="price-item">
            <span className="price-label">{t('recording.labelUsedPoints')}</span>
            <span className="price-value">{formatAmount(data?.usePoint)}P</span>
          </div>
          <div className="price-item">
            <span className="price-label">{t('recording.labelConfirmedPrice')}</span>
            <span className="price-value highlight">
              {t('recording.amountWithWon', { amount: formatAmount(data?.fixPrice) })}
            </span>
          </div>
        </div>
      </section>

      {/* 파일 목록 */}
      <section className="detail-section">
        <h2 className="detail-section-title">{t('recording.sectionFileList')}</h2>
        {filesLoading ? (
          <div className="files-loading">
            <CircularProgress size={24} />
            <span>{t('common.loadingFileList')}</span>
          </div>
        ) : files.length === 0 ? (
          <div className="files-empty">{t('common.noFiles')}</div>
        ) : (
          <div className="detail-table-wrap">
            <table className="detail-table file-table">
              <thead>
                <tr>
                  <th>{t('common.no')}</th>
                  <th>{t('common.fileName')}</th>
                  <th>{t('recording.columnSplitTp')}</th>
                  <th>{t('common.playTime')}</th>
                  <th>{t('common.fileSize')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, idx) => (
                  <tr key={file.fileNo}>
                    <td className="text-center">{idx + 1}</td>
                    <td className="td-filename">{file.fileNm}</td>
                    <td className="text-center">
                      {file.splitTp === "1" ? (
                        <Chip label={t('recording.splitTpPartial')} size="small" variant="outlined"
                          sx={{ backgroundColor: '#e3f2fd', color: '#1976d2', borderColor: '#90caf9', fontWeight: 500, fontSize: '11px', height: '20px' }}
                        />
                      ) : (
                        <Chip label={t('recording.splitTpFull')} size="small" variant="outlined"
                          sx={{ backgroundColor: '#f5f5f5', color: '#757575', borderColor: '#bdbdbd', fontWeight: 500, fontSize: '11px', height: '20px' }}
                        />
                      )}
                    </td>
                    <td className="text-center">{formatSec(file.playTm)}</td>
                    <td className="text-center">{formatFileSize(file.fileSize)}</td>
                    <td className="text-center">
                      <button className="file-action-btn" onClick={() => handleFileDownload(file.fileNo)}>
                        {t('common.download')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 파일 세부정보 */}
      {files.length > 0 && (
        <section className="detail-section">
          <h2 className="detail-section-title">{t('recording.sectionFileDetail')}</h2>
          <div className="file-detail-cards">
            {files.map((file) => {
              const fileSpeakers = speakersByFile[file.fileNo] || [];
              return (
                <div key={file.fileNo} className="file-detail-card">
                  <div className="file-detail-card-header">{file.fileNm}</div>
                  <div className="file-detail-card-body">
                    <div className="file-expand-grid">
                      <div className="file-expand-item">
                        <span className="file-expand-label">{t('recording.labelRecDttm')}</span>
                        <span className="file-expand-value">{formatRecDate(file.recDttm)}</span>
                      </div>
                      <div className="file-expand-item">
                        <span className="file-expand-label">{t('recording.labelRecPlace')}</span>
                        <span className="file-expand-value">{file.recPlace || "-"}</span>
                      </div>
                      <div className="file-expand-item">
                        <span className="file-expand-label">{t('recording.labelFileSplitTp')}</span>
                        <span className="file-expand-value">
                          {file.splitTp === "1" ? t('recording.splitTpPartial') : t('recording.splitTpFull')}
                        </span>
                      </div>
                      <div className="file-expand-item">
                        <span className="file-expand-label">{t('recording.labelFileFixPrice')}</span>
                        <span className="file-expand-value">{file.fixPrice != null ? `${formatAmount(file.fixPrice)}원` : "-"}</span>
                      </div>
                      <div className="file-expand-item">
                        <span className="file-expand-label">{t('recording.labelOverallStatus')}</span>
                        <span className="file-expand-value">{file.overallStatus || "-"}</span>
                      </div>
                      {file.remark && (
                        <div className="file-expand-item file-expand-item-wide">
                          <span className="file-expand-label">{t('recording.labelFileRemark')}</span>
                          <span className="file-expand-value">{file.remark}</span>
                        </div>
                      )}
                    </div>

                    {file.notaOrgApplyYn === "Y" && (
                      <div className="nota-info">
                        <h4 className="nota-info-title">{t('recording.sectionNotaOrg')}</h4>
                        <div className="file-expand-grid">
                          <div className="file-expand-item">
                            <span className="file-expand-label">{t('recording.labelNotaOrgApplyPcs')}</span>
                            <span className="file-expand-value">{file.notaOrgApplyPcs ?? "-"}</span>
                          </div>
                          <div className="file-expand-item">
                            <span className="file-expand-label">{t('recording.labelNotaPrice')}</span>
                            <span className="file-expand-value">{file.notaPrice != null ? `${formatAmount(file.notaPrice)}원` : "-"}</span>
                          </div>
                          <div className="file-expand-item">
                            <span className="file-expand-label">{t('recording.labelNotaOrgPrice')}</span>
                            <span className="file-expand-value">{file.notaOrgPrice != null ? `${formatAmount(file.notaOrgPrice)}원` : "-"}</span>
                          </div>
                        </div>
                        {file.recvName && (
                          <>
                            <h4 className="nota-info-title" style={{ marginTop: 12 }}>{t('recording.sectionRecvInfo')}</h4>
                            <div className="file-expand-grid">
                              <div className="file-expand-item">
                                <span className="file-expand-label">{t('recording.labelRecvName')}</span>
                                <span className="file-expand-value">{file.recvName}</span>
                              </div>
                              <div className="file-expand-item">
                                <span className="file-expand-label">{t('recording.labelRecvTelNo')}</span>
                                <span className="file-expand-value">{file.recvTelNo || "-"}</span>
                              </div>
                              <div className="file-expand-item file-expand-item-wide">
                                <span className="file-expand-label">{t('recording.labelRecvAddr')}</span>
                                <span className="file-expand-value">{[file.zipCd, file.baseAddr, file.dtlAddr].filter(Boolean).join(' ') || "-"}</span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {file.splitTp === "1" && file.timeSegments?.length > 0 && (
                      <div className="file-time-segments">
                        <h4 className="nota-info-title">{t('recording.sectionTimeSegments')}</h4>
                        <table className="speaker-table">
                          <thead>
                            <tr>
                              <th>{t('recording.labelSegmentSeq')}</th>
                              <th>{t('recording.labelSegmentStart')}</th>
                              <th>{t('recording.labelSegmentEnd')}</th>
                              <th>{t('recording.labelSegmentDuration')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {file.timeSegments.map((seg) => (
                              <tr key={seg.splitSeq}>
                                <td className="text-center">{seg.splitSeq}</td>
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
                        <h4 className="nota-info-title">{t('recording.sectionSpeakers')}</h4>
                        <table className="speaker-table">
                          <thead>
                            <tr>
                              <th>{t('recording.labelSpkrSeq')}</th>
                              <th>{t('recording.labelSpkrNm')}</th>
                              <th>{t('recording.labelSpkrFeat')}</th>
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
              <h3>{t('common.attachmentUpload')}</h3>
              <button
                className="notion-modal-close"
                onClick={closeAttachmentUploadModal}
              >
                ✕
              </button>
            </div>
            <div className="notion-modal-body">
              <div className="form-group">
                <label>{t('common.selectFile')}</label>
                <div
                  className="attachment-dropzone"
                  onClick={() => attachmentFileInputRef.current?.click()}
                >
                  <span className="attachment-dropzone-placeholder">
                    {t('common.clickToSelectFile')}
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
                      <div key={`${file.name}_${idx}`} className="attachment-file-item">
                        <span className="attachment-file-name">{file.name}</span>
                        <span className="attachment-file-size">{formatFileSize(file.size)}</span>
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
                  {t('common.cancel')}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleAttachmentUploadSubmit}
                  disabled={uploadingAttachment || uploadSelectedFiles.length === 0}
                >
                  {uploadingAttachment ? t('common.uploading') : t('common.upload')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 첨부파일 */}
      <section className="detail-section attachment-section">
        <div className="detail-section-header">
          <h2 className="detail-section-title">{t('common.attachment')}</h2>
          <div className="detail-section-header-actions">
            {attachments.length > 0 && (
              <button
                className="btn-share-save"
                onClick={handleSaveShare}
                disabled={savingShare}
              >
                {savingShare ? t('common.saving') : t('recording.buttonSaveShare')}
              </button>
            )}
            <button className="btn-primary" onClick={openAttachmentUploadModal}>
              {t('common.uploadFileButton')}
            </button>
          </div>
        </div>
        {attachmentsLoading ? (
          <div className="files-loading">
            <CircularProgress size={24} />
            <span>{t('common.loadingAttachments')}</span>
          </div>
        ) : attachments.length === 0 ? (
          <div className="files-empty">{t('common.noAttachments')}</div>
        ) : (
          <table className="attachment-table">
            <thead>
              <tr>
                <th>{t('common.fileName')}</th>
                <th>{t('common.type')}</th>
                <th>{t('common.fileSize')}</th>
                <th>{t('common.registrationDate')}</th>
                <th>{t('recording.labelShareYn')}</th>
                <th>{t('common.action')}</th>
              </tr>
            </thead>
            <tbody>
              {attachments.map((att) => {
                const chipProps = getAttachmentChipProps(att.fileTp, t);
                return (
                  <tr key={att.fileNo}>
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
                      {att.regDttm
                        ? formatISODateOnly(
                            att.regDttm.length === 14
                              ? `${att.regDttm.slice(0, 4)}-${att.regDttm.slice(4, 6)}-${att.regDttm.slice(6, 8)}`
                              : att.regDttm,
                          )
                        : "-"}
                    </td>
                    <td className="att-center">
                      <input
                        type="checkbox"
                        className="share-checkbox"
                        checked={(shareEdits[att.fileNo] || att.shareYn) === "Y"}
                        onChange={(e) =>
                          setShareEdits((prev) => ({
                            ...prev,
                            [att.fileNo]: e.target.checked ? "Y" : "N",
                          }))
                        }
                      />
                    </td>
                    <td className="att-center att-actions">
                      <button
                        className="att-download-btn"
                        onClick={() =>
                          handleAttachmentDownload(att.fileNo, att.fileTp)
                        }
                      >
                        {t('common.download')}
                      </button>
                      {isAdmin() && String(att.fileTp) === "10" && (
                        <button
                          className="att-delete-btn"
                          onClick={() =>
                            handleAttachmentDelete(att.fileNo)
                          }
                        >
                          {t('common.delete')}
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

      {/* 의뢰 확정 */}
      {!isCanceled && (
        <section className="detail-section">
          <h2 className="detail-section-title">{t('recording.sectionRequestConfirm')}</h2>
          <div className="confirm-section">
            <div className="confirm-title-group">
              <label className="confirm-title-label">{t('recording.labelRequestTitle')}</label>
              <input
                type="text"
                className="confirm-title-input"
                value={confirmTitle}
                onChange={(e) => setConfirmTitle(e.target.value)}
                placeholder={`${data?.servCd || ''}-${data?.membNm || ''}`}
              />
              <span className="confirm-title-hint">{t('recording.requestTitleAutoHint', { servCd: data?.servCd || '', membNm: data?.membNm || '' })}</span>
            </div>
            <div className="confirm-action-row">
              <span className="confirm-hint">
                {t('recording.requestConfirmHint')}
              </span>
              <button
                className="btn-confirm"
                onClick={handleConfirm}
                disabled={confirming}
              >
                {confirming ? t('common.confirming') : t('recording.buttonRequestConfirm')}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 하단 */}
      <div className="page-footer">
        <button className="btn-ghost" onClick={handleBack}>
          {t('common.backToListFull')}
        </button>
      </div>
    </div>
  );
}
