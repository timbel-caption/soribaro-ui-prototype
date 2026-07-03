import { useState } from 'react';
import { getRecordingSamples, appendRecordingSample } from '../enterprise/proto/protoStore';
import MeetingListDashboard from '../meeting/MeetingListDashboard';
import MeetingRegisterModal from '../meeting/MeetingRegisterModal';
import '../../../styles/notion-list.css';
import '../enterprise/EnterpriseWorkList.css';
import '../enterprise/proto/ProtoDetail.css';

export default function RecordingWorkManagePage() {
  const [samples, setSamples] = useState(() => getRecordingSamples());
  const [showRegister, setShowRegister] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const refreshSamples = () => setSamples([...getRecordingSamples()]);

  const handleRegister = (form, files) => {
    const today = new Date().toISOString().split('T')[0];
    const newId = `PROTO-REC-${String(samples.length + 1).padStart(3, '0')}`;
    appendRecordingSample({
      id: newId,
      servCd: newId,
      entNm: form.entNm,
      servTitle: `${form.entNm} 녹취록`,
      membNm: form.managerNm || '-',
      bssType: '녹취록',
      bssTypeName: '녹취록',
      totalPlayTm: form.totalPlayTm || '-',
      totalDuration: '-',
      overallStatus: 'WORKING',
      subfileStatus: '미요청',
      contractType: form.contractType || '',
      round: form.round ? parseInt(form.round, 10) || form.round : '-',
      regDttm: (form.regDate || today) + ' 09:00',
      dueDate: form.dueDate || today,
      actualDeliveryDate: '-',
      remark: form.specialNote || '',
      cnlYn: 'N',
      orgNm: form.entNm,
      managerNm: form.managerNm || '-',
      staffNm: form.staff?.name || '',
      staffPhone: form.staff?.tel || '',
      staffEmail: form.staff?.email || '',
      deliveryFormats: '-',
      specialNote: form.specialNote || '',
      internalMemo: '',
      clientRequest: form.internalMemo || '',
      statusHistory: [{ date: form.regDate || today, label: '접수' }],
      protoPath: `/soribaro/recording/detail/${newId}`,
      files: files.map((f, i) => ({ fileNo: i + 1, fileName: f.name, duration: form.fileDurations?.[i] || '-', size: f.size, uploadDttm: today, splits: form.fileSplits?.[i] || [] })),
      assignments: [],
      manuals: [],
      workProgress: [],
      qcScore: null,
      qcResults: [],
      deliveries: form.dueDate
        ? [{ no: 1, dueDate: form.dueDate, deliveredDate: '-', format: '-', files: '전체', status: '납품예정' }]
        : [],
      settlement: { status: '정산전', items: [] },
      history: [{ dttm: (form.regDate || today) + ' 09:00', actor: '관리자', event: '프로젝트 등록', detail: form.entNm }],
      memos: [],
    });
    setSamples([...getRecordingSamples()]);
  };

  return (
    <div className="notion-page enterprise-work-page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">녹취록 작업관리</h1>
          <p className="page-description">녹취록 작업을 관리합니다</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="btn-ghost"
            style={{ fontSize: '13px' }}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? '진행중만 보기' : '전체 보기'}
          </button>
          <button className="proto-register-page-btn" onClick={() => setShowRegister(true)}>
            + 새 의뢰 등록
          </button>
        </div>
      </div>

      <MeetingListDashboard samples={samples} onSamplesChange={refreshSamples} showAll={showAll} workType="recording" />

      {showRegister && (
        <MeetingRegisterModal workType="recording" onClose={() => { setShowRegister(false); refreshSamples(); }} onSubmit={handleRegister} />
      )}
    </div>
  );
}
