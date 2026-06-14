/**
 * V9 API 모듈 통합 export
 */

// API 클라이언트
export {
  get,
  post,
  put,
  patch,
  del,
  apiRequest,
  getToken,
  ApiError,
} from './client';

// Auth API
export {
  login,
  refresh,
  getAuthStatus,
  getMe,
  logout,
} from './auth/index';

// Prompts API
export {
  getPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
} from './prompts/index';

// Tags API
export {
  getTags,
  getAllTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
} from './tags/index';

// Subtitles API
export {
  createSubtitlesBatch,
  getSubtitleById,
  getSubtitles,
  getSubtitlesByProjectFileId,
  getSubtitlesByRevision,
  getSubtitlesByProjectFileIdAndWorkType,
  updateSubtitle,
  deleteSubtitle,
  deleteSubtitlesByProjectFileId,
} from './subtitles/index';

// Subtitle Revisions API
export {
  getRevisionsByProjectFileId,
  getRevisionsByWorkerId,
  getLatestRevisionByProjectFileId,
  getLatestRevisionByWorkType,
  checkRevision,
} from './subtitleRevisions/index';

// Training (연수) Files API
export {
  listTrainingFiles,
  getTrainingFile,
  uploadTrainingFile,
  deleteTrainingFile,
  getTrainingFilePlaybackUrl,
  getTrainingWaveformPresignedUrl,
  saveTrainingWaveformMeta,
  getTrainingWaveformMeta,
  getTrainingWaveformDownloadUrl,
} from './training/index';

// File API
export {
  getFilesByServCd,
  updateFileDifficultyByFileNo,
  getAttachmentsByServCd,
  uploadSharedFile,
  getSharedFileDownloadUrl,
  getCustomerFileDownloadUrl,
  deleteSharedFiles,
  getFileDownloadUrl,
  getFileStreamUrl,
  getWaveformDownloadUrl,
  addRequestFiles,
  deleteRequestFiles,
  updateFileSplitSegments,
  cancelFileSplit,
  uploadEnterpriseEstimateFile,
  uploadEnterpriseFinalFile,
  getLatestEnterpriseFile,
  sendEnterpriseNotification,
  ENTERPRISE_FILE_TP,
} from './file/index';

// Serv API
export {
  getServByServCd,
  updateServWorkStat,
  getServProjectFiles,
  cancelServ,
  updateServBssType,
} from './serv/index';

// Translate API
export {
  getTranslates,
  getTranslateReqDtl,
  getTranslateDetail,
} from './translate/index';

// WorksfyProjects API
export {
  getWorksfyProjects,
  getWorksfyProject,
  createWorksfyProject,
  updateWorksfyProject,
  closeWorksfyProject,
  deleteWorksfyProject,
  getWorksfyApplicants,
  approveWorksfyApplicants,
  unapproveWorksfyApplicants,
  getWorksfyWorkers,
} from './worksfyProjects/index';

// Projects API
export {
  createProject,
  getProjectById,
  getProjectsByServCd,
  updateProject,
  deleteProject,
  updateAdminMessage,
  updateWorkerMessage,
  updateCheckerMessage,
  getMyProjects,
  getWorkerProjectsByMembId,
} from './projects/index';

// Enterprise API
export {
  getEnterpriseList,
  getEnterpriseDetail,
  createEnterprise,
  updateEnterprise,
  deleteEnterprise,
  getImagePresignedUrl,
  getImageDownloadUrl,
} from './enterprise/index';

// Enterprise Customer API
export {
  getEnterpriseCustomerList,
  getEnterpriseCustomerDetail,
  updateEnterpriseCustomer,
  downloadEnterpriseCustomerExcel,
} from './enterpriseCustomer/index';

// Price Tables API
export {
  getPriceTables,
  getPriceTable,
  createPriceTable,
  updatePriceTable,
  deletePriceTable,
} from './priceTables/index';

// File Difficulties API
export {
  getFileDifficulties,
  getFileDifficulty,
  createFileDifficulty,
  updateFileDifficulty,
  deleteFileDifficulty,
} from './fileDifficulties/index';

// Price Items API
export {
  getPriceItems,
  getPriceItem,
  createPriceItem,
  updatePriceItem,
  deletePriceItem,
} from './priceItems/index';

// Depreciation Tables API
export {
  getDepreciationTables,
  getDepreciationTable,
  getDepreciationTableByBssType,
  createDepreciationTable,
  updateDepreciationTable,
  deleteDepreciationTable,
} from './depreciationTables/index';

// Depreciation Items API
export {
  getDepreciationItems,
  getDepreciationItem,
  createDepreciationItem,
  updateDepreciationItem,
  deleteDepreciationItem,
} from './depreciationItems/index';

// Worker Levels API
export {
  getWorkerLevels,
  getWorkerLevel,
  createWorkerLevel,
  updateWorkerLevel,
  deleteWorkerLevel,
} from './workerLevels/index';

// API Keys API
export {
  getApiKeys,
  getApiKey,
  searchApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
} from './apiKeys/index';

// Member API
export {
  getMemberList,
  getMember,
  updateMember,
  deleteMember,
  getCompanyOptions,
} from './member/index';

// Project Files API
export {
  createProjectFile,
  createProjectFiles,
  getProjectFileById,
  getProjectFilesByProjectId,
  updateProjectFile,
  deleteProjectFile,
  updateProjectFileWorkerId,
  updateProjectFileCheckerId,
  updateProjectFileWorkTime,
  getProjectFileInfo,
  getMyTaskFiles,
  getTaskFilesByMembId,
} from './projectFiles/index';

// Subtitle Works API
export {
  createSubtitleWork,
  getSubtitleWorkByRevision,
  getLatestSubtitleWork,
  getLatestMergedSubtitleWork,
  getSubtitleWorksByWorkType,
  deleteSubtitleWork,
} from './subtitleWorks/index';

// Settlement API
export {
  createSettlement,
  previewSettlementPay,
  updateSettlement,
  updateSettlementWorker,
  deleteSettlement,
  executeSettlement,
  rejectSettlement,
  confirmSettlement,
  paidSettlement,
  revertPaymentSettlement,
  getSettlement,
  getSettlements,
  getPendingSettlements,
  getSettlementsByStatus,
  getSettlementAggregation,
  getMySettlementMonthlySummary,
} from './settlement/index';

// Price Calculation API
export {
  calculatePrice,
} from './priceCalculation/index';

// Enterprise Work API
export {
  getEnterpriseWorkList,
  getEnterpriseWorkDetail,
} from './enterpriseWork/index';

// Record Work API
export {
  getRecordWorkRequests,
  getRecordWorkWorks,
  getRecordWorkRequestDetail,
  confirmRecordWorkRequest,
  updateRecordWorkRequestPrice,
  updateRecordWorkFilesPrices,
  getRecordWorkWorkDetail,
  updateStenoMemo,
  updateAdminMemo,
  updateAttachmentShare,
} from './recordWork/index';

// Review Tags API
export {
  getReviewTags,
  getAllReviewTags,
  getReviewTagById,
  createReviewTag,
  updateReviewTag,
  deleteReviewTag,
} from './reviewTags/index';

// Review Tag Groups API
export {
  getReviewTagGroups,
  getAllReviewTagGroups,
  getReviewTagGroupById,
  createReviewTagGroup,
  updateReviewTagGroup,
  deleteReviewTagGroup,
} from './reviewTagGroups/index';

// Subtitle Comments API
export {
  getSubtitleComments,
  createSubtitleComment,
  updateSubtitleComment,
  deleteSubtitleComment,
} from './subtitleComments/index';

// Subtitle Review Tags API
export {
  getSubtitleReviewTags,
  createSubtitleReviewTag,
  deleteSubtitleReviewTag,
} from './subtitleReviewTags/index';

// Profile API
export {
  getProfile,
  clearProfileCache,
} from './profile/index';

// Promotion Schedules API
export {
  createPromotionSchedule,
  cancelPromotionSchedule,
  deletePromotionSchedule,
  searchPromotionSchedules,
  getWorkerStatistics,
  applyPromotionSchedule,
  autoApplyPromotionSchedules,
} from './promotionSchedules/index';

// Order API
export {
  getPresignedUrl,
  getWaveformPresignedUrl,
  saveWaveformMeta,
  getWaveformByFileNo,
  uploadToMinIO,
  createRecordingService,
  createEnterpriseService,
  createTranslationService,
} from './order/index';

// 기본 export (모듈별 객체)
import client from './client';
import auth from './auth/index';
import prompts from './prompts/index';
import tags from './tags/index';
import subtitles from './subtitles/index';
import subtitleRevisions from './subtitleRevisions/index';
import file from './file/index';
import serv from './serv/index';
import translate from './translate/index';
import worksfyProjects from './worksfyProjects/index';
import enterprise from './enterprise/index';
import enterpriseCustomer from './enterpriseCustomer/index';
import enterpriseWork from './enterpriseWork/index';
import recordWork from './recordWork/index';
import priceTables from './priceTables/index';
import fileDifficulties from './fileDifficulties/index';
import priceItems from './priceItems/index';
import depreciationTables from './depreciationTables/index';
import depreciationItems from './depreciationItems/index';
import workerLevels from './workerLevels/index';
import apiKeys from './apiKeys/index';
import member from './member/index';
import projects from './projects/index';
import projectFiles from './projectFiles/index';
import subtitleWorks from './subtitleWorks/index';
import settlement from './settlement/index';
import priceCalculation from './priceCalculation/index';
import reviewTags from './reviewTags/index';
import reviewTagGroups from './reviewTagGroups/index';
import subtitleComments from './subtitleComments/index';
import subtitleReviewTags from './subtitleReviewTags/index';
import profile from './profile/index';
import promotionSchedules from './promotionSchedules/index';
import order from './order/index';

export default {
  client,
  auth,
  prompts,
  tags,
  subtitles,
  subtitleRevisions,
  file,
  serv,
  translate,
  enterprise,
  enterpriseCustomer,
  enterpriseWork,
  recordWork,
  worksfyProjects,
  apiKeys,
  member,
  priceTables,
  fileDifficulties,
  priceItems,
  depreciationTables,
  depreciationItems,
  workerLevels,
  projects,
  projectFiles,
  subtitleWorks,
  settlement,
  priceCalculation,
  reviewTags,
  reviewTagGroups,
  subtitleComments,
  subtitleReviewTags,
  profile,
  promotionSchedules,
  order,
};
