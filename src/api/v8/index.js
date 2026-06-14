/**
 * V8 API 모듈 통합 export
 */

// API 클라이언트
export {
  get,
  post,
  put,
  del,
  patch,
  apiRequest,
  getToken,
  ApiError,
} from './client';

// WorkMng API
export {
  getPresignedDownloadUrl,
} from './workMng/index';

// Common Code API
export {
  getCommonCode,
} from './common/index';

// CommCode 관리 API
export {
  getCodeDetails,
  upsertCodeDetail,
  deleteCodeDetail,
} from './commcode/index';

// Notice API
export {
  getNoticeList,
  getNoticeDetail,
  createNotice,
  updateNotice,
  deleteNotice,
  updateNoticeUseYn,
} from './notice/index';

// 기본 export (모듈별 객체)
import client from './client';
import workMng from './workMng/index';
import common from './common/index';
import commcode from './commcode/index';
import notice from './notice/index';

export default {
  client,
  workMng,
  common,
  commcode,
  notice,
};
