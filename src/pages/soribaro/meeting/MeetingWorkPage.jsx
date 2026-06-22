import { useState } from 'react';
import { getMeetingSamples, appendMeetingSample } from '../enterprise/proto/protoStore';
import MeetingListDashboard from './MeetingListDashboard';
import MeetingRegisterModal from './MeetingRegisterModal';
import '../../../styles/notion-list.css';
import '../enterprise/EnterpriseWorkList.css';
import '../enterprise/proto/ProtoDetail.css';

export default function MeetingWorkPage() {
  const [samples, setSamples] = useState(() => getMeetingSamples());
  const [showRegister, setShowRegister] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const refreshSamples = () => setSamples([...getMeetingSamples()]);

  const handleRegister = (form, files) => {
    const today = new Date().toISOString().split('T')[0];
    const newId = `PROTO-MTG-${String(samples.length + 1).padStart(3, '0')}`;
    appendMeetingSample({
      id: newId,
      servCd: newId,
      entNm: form.entNm,
      servTitle: `${form.entNm} 회의록`,
      membNm: form.managerNm || '-',
      bssType: '회의록',
      bssTypeName: '회의록',
      totalPlayTm: '-',
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
      deliveryFormats: '-',
      specialNote: form.specialNote || '',
      internalMemo: '',
      statusHistory: [{ date: form.regDate || today, label: '접수' }],
      protoPath: `/soribaro/enterprise/meeting-proto/${newId}`,
      files: files.map((f, i) => ({ fileNo: i + 1, fileName: f.name, duration: '-', size: f.size, uploadDttm: today })),
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
    setSamples([...getMeetingSamples()]);
  };

  return (
    <div className="notion-page enterprise-work-page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">회의록 작업관리</h1>
          <p className="page-description">회의록 작업을 관리합니다</p>
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

      <MeetingListDashboard samples={samples} onSamplesChange={refreshSamples} showAll={showAll} />

      {showRegister && (
        <MeetingRegisterModal onClose={() => { setShowRegister(false); refreshSamples(); }} onSubmit={handleRegister} />
      )}
    </div>
  );
}
