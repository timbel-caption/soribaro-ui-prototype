import { useState, useEffect, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import { fetchAllSubtitles } from '../../utils/subtitleFetchUtils';

const TAB_LABELS = {
  START: '출발어',
  MID: '중간어',
  FINAL: '도착어',
};

const TAB_LABELS_DEFAULT = {
  START: '원본',
};

function SubtitleTable({ subtitles }) {
  if (!subtitles.length) {
    return <div style={{ padding: '24px', textAlign: 'center', color: '#999' }}>자막 데이터가 없습니다.</div>;
  }
  return (
    <div style={{ maxHeight: 480, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e0e0e0', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap', width: 110 }}>시작</th>
            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap', width: 110 }}>종료</th>
            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap', width: 80 }}>화자</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>자막</th>
          </tr>
        </thead>
        <tbody>
          {subtitles.map((sub, i) => (
            <tr key={sub.id ?? i} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '6px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: '12px' }}>{sub.start || '-'}</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: '12px' }}>{sub.end || '-'}</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', fontSize: '12px' }}>{sub.speaker || '-'}</td>
              <td style={{ padding: '6px 12px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{sub.text || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubtitlePreview({ subtitles }) {
  if (!subtitles.length) {
    return <div style={{ padding: '24px', textAlign: 'center', color: '#999' }}>자막 데이터가 없습니다.</div>;
  }
  return (
    <div style={{ maxHeight: 480, overflow: 'auto', padding: '8px 4px' }}>
      {subtitles.map((sub, i) => (
        <div key={sub.id ?? i} style={{ padding: '6px 8px', borderBottom: '1px solid #f5f5f5' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', marginBottom: '2px' }}>
            <span style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>{sub.start}</span>
            {sub.speaker && <span style={{ fontSize: '11px', color: '#1976d2', fontWeight: 500 }}>{sub.speaker}</span>}
          </div>
          <div style={{ fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{sub.text || ''}</div>
        </div>
      ))}
    </div>
  );
}

export default function SubtitleViewModal({ open, onClose, servCd, fileNo, isTranslation = false }) {
  const [loading, setLoading] = useState(false);
  const [subtitleData, setSubtitleData] = useState({ START: [], MID: [], FINAL: [] });
  const [activeTab, setActiveTab] = useState('START');
  const [viewMode, setViewMode] = useState('table');

  const loadData = useCallback(async () => {
    if (!servCd || !fileNo) return;
    setLoading(true);
    setSubtitleData({ START: [], MID: [], FINAL: [] });
    setActiveTab('START');

    const data = await fetchAllSubtitles(servCd, fileNo, isTranslation);

    if (isTranslation && data.FINAL.length > 0) {
      setActiveTab('FINAL');
    }

    setSubtitleData(data);
    setLoading(false);
  }, [servCd, fileNo, isTranslation]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  const labels = isTranslation ? TAB_LABELS : TAB_LABELS_DEFAULT;
  const tabs = Object.keys(labels);
  const currentSubtitles = subtitleData[activeTab] || [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <span>자막 보기</span>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, v) => { if (v) setViewMode(v); }}
          size="small"
        >
          <ToggleButton value="table" sx={{ fontSize: '12px', py: '4px', px: '12px' }}>테이블</ToggleButton>
          <ToggleButton value="preview" sx={{ fontSize: '12px', py: '4px', px: '12px' }}>미리보기</ToggleButton>
        </ToggleButtonGroup>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, minHeight: 300 }}>
        {tabs.length > 1 && (
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{ borderBottom: '1px solid #e0e0e0', px: 2 }}
          >
            {tabs.map((type) => (
              <Tab key={type} value={type} label={`${labels[type]} (${subtitleData[type]?.length || 0})`} />
            ))}
          </Tabs>
        )}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px' }}>
            <CircularProgress size={32} />
          </div>
        ) : viewMode === 'table' ? (
          <SubtitleTable subtitles={currentSubtitles} />
        ) : (
          <SubtitlePreview subtitles={currentSubtitles} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
}
