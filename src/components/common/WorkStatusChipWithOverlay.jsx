import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Chip from '@mui/material/Chip';
import Popper from '@mui/material/Popper';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import { getServProjectFiles } from '../../api/v9';
import ProfileChip from './ProfileChip';
import SERVICE_STATUSES from '../../constants/serviceStatus.json';
import PROJECT_STATUSES from '../../constants/projectStatus.json';
import { getChipSxFromColor } from '../../utils/projectStatusUtils';

const cache = new Map();

export default function WorkStatusChipWithOverlay({ overallStatus, servCd }) {
  const { t } = useTranslation('soribaro');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState(null);
  const anchorRef = useRef(null);
  const timerRef = useRef(null);
  const leaveTimerRef = useRef(null);

  const fetchFiles = useCallback(async () => {
    if (!servCd) return;
    if (cache.has(servCd)) {
      setFiles(cache.get(servCd));
      return;
    }
    setLoading(true);
    try {
      const res = await getServProjectFiles(servCd);
      const data = res?.status === 'SUCCESS' ? (res.data || []) : [];
      cache.set(servCd, data);
      setFiles(data);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [servCd]);

  const cancelClose = useCallback(() => {
    clearTimeout(leaveTimerRef.current);
  }, []);

  const handleMouseEnter = useCallback(() => {
    cancelClose();
    timerRef.current = setTimeout(() => {
      setOpen(true);
      fetchFiles();
    }, 300);
  }, [fetchFiles, cancelClose]);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(timerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, 200);
  }, []);

  const statusInfo = SERVICE_STATUSES.find(s => s.status === overallStatus);

  if (!statusInfo) {
    return <span>{overallStatus || '-'}</span>;
  }

  return (
    <span
      ref={anchorRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ display: 'inline-flex', cursor: 'pointer' }}
    >
      <Chip
        label={t(`common.status_${statusInfo.status}`)}
        size="small"
        variant="outlined"
        sx={{
          ...getChipSxFromColor(statusInfo.color),
          fontWeight: 500,
          fontSize: '11px',
          height: '22px',
        }}
      />
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-end"
        style={{ zIndex: 1300 }}
        modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
      >
        <Paper
          elevation={4}
          sx={{ p: 1.5, minWidth: 700, maxWidth: 900, maxHeight: 300, overflow: 'auto' }}
          onMouseEnter={cancelClose}
          onMouseLeave={handleMouseLeave}
        >
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
              <CircularProgress size={24} />
            </div>
          )}
          {!loading && files && files.length === 0 && (
            <div style={{ padding: '8px', color: '#999', textAlign: 'center', fontSize: '12px' }}>
              {t('common.noData')}
            </div>
          )}
          {!loading && files && files.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{t('common.overlayProject')}</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{t('common.overlayFileName')}</th>
                  <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>{t('common.overlayWorkStatus')}</th>
                  <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>{t('common.overlayWorker')}</th>
                  <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>{t('common.overlayChecker')}</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => {
                  const pStatus = PROJECT_STATUSES.find(s => s.status === f.status);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.title || '-'}</td>
                      <td style={{ padding: '4px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.fileNm}>{f.fileNm || '-'}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        {pStatus ? (
                          <Chip
                            label={t(`common.status_${pStatus.status}`)}
                            size="small"
                            variant="outlined"
                            sx={{
                              ...getChipSxFromColor(pStatus.color),
                              fontWeight: 500,
                              fontSize: '10px',
                              height: '20px',
                            }}
                          />
                        ) : (f.status || '-')}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        {f.workerId ? (
                          <ProfileChip email={f.workerId} size="small" sx={{ fontSize: '10px', height: '20px', maxWidth: '200px' }} />
                        ) : '-'}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        {f.checkerId ? (
                          <ProfileChip email={f.checkerId} size="small" sx={{ fontSize: '10px', height: '20px', maxWidth: '200px' }} />
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Paper>
      </Popper>
    </span>
  );
}
