import { useState, useEffect, useCallback, useRef } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import { RotateCcw, RefreshCw } from 'lucide-react';
import { toast } from '../Toast';
import ffmpegService from '../../../services/audio/ffmpegService';
import {
  getFileStreamUrl,
  getMp3NormalizationStatus,
  replaceMp3WithNormalized,
  rollbackMp3Normalization,
} from '../../../api/v9/file';
import './NormalizeMp3Modal.css';

/**
 * mp3 정규화(CBR 재인코딩) 모달.
 *
 * Chrome 의 mp3 demuxer 가 VBR 파일에서 seek 시 byte 위치를 추정으로 계산해
 * 일부 파일에서 위치별로 어긋남이 발생. 관리자가 문제 파일을 지정하면
 * 브라우저에서 ffmpeg.wasm 으로 CBR 재인코딩 후 백엔드에 업로드 → minIO 원본 교체.
 * TB_FILE 메타데이터는 변경하지 않음. 원본은 *.vbr.bak 으로 백업되어 rollback 가능.
 */
export default function NormalizeMp3Modal({ open, onClose, fileNo, fileNm }) {
  const [phase, setPhase] = useState('idle'); // idle | loadingStatus | downloading | encoding | uploading | done | error | rollingBack | rolledBack
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusInfo, setStatusInfo] = useState(null); // { backupExists, backupSizeBytes, backupPath, objectPath, bucket }
  const [resultInfo, setResultInfo] = useState(null); // replace 응답
  const abortRef = useRef({ aborted: false });

  const resetState = useCallback(() => {
    setPhase('idle');
    setProgress(0);
    setErrorMessage('');
    setResultInfo(null);
    abortRef.current = { aborted: false };
  }, []);

  const loadStatus = useCallback(async () => {
    if (!fileNo) return;
    setPhase('loadingStatus');
    setErrorMessage('');
    try {
      const res = await getMp3NormalizationStatus(fileNo);
      setStatusInfo(res?.data || null);
      setPhase('idle');
    } catch (err) {
      console.error('mp3 정규화 상태 조회 실패', err);
      setStatusInfo(null);
      setErrorMessage(err?.message || '상태 조회 실패');
      setPhase('error');
    }
  }, [fileNo]);

  useEffect(() => {
    if (open) {
      resetState();
      loadStatus();
    }
    return () => {
      abortRef.current.aborted = true;
    };
  }, [open, fileNo, loadStatus, resetState]);

  const handleClose = useCallback(() => {
    const inProgress = ['downloading', 'encoding', 'uploading', 'rollingBack'].includes(phase);
    if (inProgress) {
      const ok = window.confirm('처리 중입니다. 정말 닫으시겠습니까? 진행 상태가 손실될 수 있습니다.');
      if (!ok) return;
      abortRef.current.aborted = true;
    }
    onClose?.();
  }, [phase, onClose]);

  const handleNormalize = useCallback(async () => {
    if (!fileNo) return;
    abortRef.current = { aborted: false };
    setProgress(0);
    setErrorMessage('');
    setResultInfo(null);

    try {
      // 1. 스트리밍 URL 조회
      setPhase('downloading');
      const streamRes = await getFileStreamUrl(fileNo);
      const streamUrl = streamRes?.data?.url;
      if (!streamUrl) throw new Error('스트리밍 URL 조회 실패');

      if (abortRef.current.aborted) return;

      // 2. 파일 다운로드 (Blob)
      const downloadRes = await fetch(streamUrl);
      if (!downloadRes.ok) throw new Error(`파일 다운로드 실패 (HTTP ${downloadRes.status})`);
      const total = Number(downloadRes.headers.get('content-length')) || 0;

      const reader = downloadRes.body.getReader();
      const chunks = [];
      let received = 0;
      while (true) {
        if (abortRef.current.aborted) {
          reader.cancel();
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) setProgress(Math.round((received / total) * 100));
      }
      const inputBlob = new Blob(chunks, { type: 'audio/mpeg' });

      if (abortRef.current.aborted) return;

      // 3. ffmpeg.wasm 으로 CBR 재인코딩
      setPhase('encoding');
      setProgress(0);
      const inputName = (fileNm && fileNm.toLowerCase().endsWith('.mp3')) ? 'input.mp3' : 'input.mp3';
      const normalizedBlob = await ffmpegService.normalizeMp3(inputBlob, inputName, (p) => {
        setProgress(Math.min(100, Math.max(0, Math.round(p))));
      });

      if (abortRef.current.aborted) return;

      // 4. 업로드
      setPhase('uploading');
      setProgress(0);
      const replaceRes = await replaceMp3WithNormalized(
        fileNo,
        normalizedBlob,
        fileNm || `${fileNo}.mp3`,
      );
      setResultInfo(replaceRes?.data || null);
      setPhase('done');
      toast.success('mp3 정규화 완료');
      // 상태 갱신 (백업 표시)
      loadStatus();
    } catch (err) {
      if (abortRef.current.aborted) return;
      console.error('mp3 정규화 실패', err);
      setErrorMessage(err?.message || '재인코딩 중 알 수 없는 오류');
      setPhase('error');
      toast.error('mp3 정규화 실패');
    }
  }, [fileNo, fileNm, loadStatus]);

  const handleRollback = useCallback(async () => {
    if (!fileNo) return;
    const ok = window.confirm(
      'mp3 정규화를 롤백하면 minIO 의 원본이 백업본(.vbr.bak)으로 복구됩니다. 진행할까요?',
    );
    if (!ok) return;
    setPhase('rollingBack');
    setErrorMessage('');
    try {
      await rollbackMp3Normalization(fileNo);
      setPhase('rolledBack');
      setResultInfo(null);
      toast.success('mp3 정규화 롤백 완료');
      loadStatus();
    } catch (err) {
      console.error('mp3 정규화 롤백 실패', err);
      setErrorMessage(err?.message || '롤백 중 알 수 없는 오류');
      setPhase('error');
      toast.error('mp3 정규화 롤백 실패');
    }
  }, [fileNo, loadStatus]);

  const isRunning = ['downloading', 'encoding', 'uploading', 'rollingBack', 'loadingStatus'].includes(phase);

  const phaseLabel = (() => {
    switch (phase) {
      case 'loadingStatus': return '상태 조회 중...';
      case 'downloading': return '미디어 다운로드 중...';
      case 'encoding': return 'CBR 재인코딩 중 (ffmpeg.wasm)';
      case 'uploading': return '업로드 중...';
      case 'rollingBack': return '롤백 중...';
      case 'done': return '재인코딩 완료';
      case 'rolledBack': return '롤백 완료';
      case 'error': return '오류 발생';
      default: return '대기 중';
    }
  })();

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>mp3 정규화 (CBR 재인코딩)</DialogTitle>
      <DialogContent>
        <div className="normalize-mp3-modal__info">
          <div><strong>파일 번호:</strong> {fileNo}</div>
          {fileNm && <div><strong>파일명:</strong> {fileNm}</div>}
        </div>

        <Alert severity="info" sx={{ mt: 2 }}>
          Chrome 에서 VBR mp3 파일을 seek 할 때 위치별로 음성이 어긋나는 경우 사용합니다.
          브라우저에서 CBR 로 재인코딩한 뒤 minIO 의 원본을 교체합니다.
          원본은 자동 백업되어 롤백 가능합니다. TB_FILE 메타데이터는 변경되지 않습니다.
        </Alert>

        {statusInfo && (
          <div className="normalize-mp3-modal__status">
            <div>
              <strong>백업 존재:</strong>{' '}
              {statusInfo.backupExists ? (
                <span style={{ color: '#2e7d32' }}>예 ({(statusInfo.backupSizeBytes / 1024 / 1024).toFixed(2)} MB)</span>
              ) : (
                <span style={{ color: '#888' }}>아니오</span>
              )}
            </div>
            {statusInfo.objectPath && (
              <div className="normalize-mp3-modal__path">
                <strong>경로:</strong> {statusInfo.bucket} / {statusInfo.objectPath}
              </div>
            )}
          </div>
        )}

        <div className="normalize-mp3-modal__phase">
          <strong>상태:</strong> {phaseLabel}
        </div>

        {isRunning && (
          <div className="normalize-mp3-modal__progress">
            <LinearProgress variant="determinate" value={progress} />
            <div className="normalize-mp3-modal__progress-text">{progress}%</div>
          </div>
        )}

        {phase === 'done' && resultInfo && (
          <Alert severity="success" sx={{ mt: 2 }}>
            교체 완료. {resultInfo.backupAlreadyExisted ? '(백업은 기존 것을 보존)' : '(원본 백업 생성됨)'} <br />
            원본 크기: {(resultInfo.originalSizeBytes / 1024 / 1024).toFixed(2)} MB → 신규 크기: {(resultInfo.newSizeBytes / 1024 / 1024).toFixed(2)} MB
          </Alert>
        )}

        {phase === 'rolledBack' && (
          <Alert severity="success" sx={{ mt: 2 }}>
            백업으로 복구 완료. (백업 객체는 보존됨)
          </Alert>
        )}

        {phase === 'error' && errorMessage && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {statusInfo?.backupExists && (
          <Button
            startIcon={<RotateCcw size={16} />}
            color="warning"
            disabled={isRunning}
            onClick={handleRollback}
          >
            롤백
          </Button>
        )}
        <Button onClick={handleClose} disabled={isRunning}>닫기</Button>
        <Button
          startIcon={<RefreshCw size={16} />}
          variant="contained"
          disabled={isRunning || phase === 'done'}
          onClick={handleNormalize}
        >
          재인코딩 실행
        </Button>
      </DialogActions>
    </Dialog>
  );
}
