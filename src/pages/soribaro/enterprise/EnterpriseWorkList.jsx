import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getVodSamples, getMeetingSamples, appendVodSample, appendMeetingSample } from './proto/protoStore';
import ProtoListDashboard from './proto/ProtoListDashboard';
import ProtoRegisterModal from './proto/ProtoRegisterModal';
import '../../../styles/notion-list.css';
import './EnterpriseWorkList.css';
import './proto/ProtoDetail.css';

export default function EnterpriseWorkList({ videoYn, title, description }) {
  const { t } = useTranslation('soribaro');
  const [showRegister, setShowRegister] = useState(false);
  const isVod = videoYn === 'Y';
  const [samples, setSamples] = useState(() => isVod ? getVodSamples() : getMeetingSamples());

  const refreshSamples = () => setSamples(isVod ? [...getVodSamples()] : [...getMeetingSamples()]);

  const handleRegister = (form, files) => {
    const today = new Date().toISOString().split('T')[0];
    const prefix = isVod ? 'PROTO-VOD' : 'PROTO-MTG';
    const newId = `${prefix}-${String(samples.length + 1).padStart(3, '0')}`;
    const newProject = {
      id: newId,
      servCd: newId,
      entNm: form.entNm,
      servTitle: form.servTitle,
      membNm: form.managerNm || '관리자',
      bssType: form.bssTypeName,
      bssTypeName: form.bssTypeName,
      totalPlayTm: '-',
      totalDuration: `${files.length > 0 ? files.length + '개 파일' : '-'}`,
      overallStatus: 'WORKING',
      regDttm: (form.regDate || today) + ' 09:00',
      dueDate: form.dueDate,
      actualDeliveryDate: '-',
      remark: form.specialNote || '',
      cnlYn: 'N',
      orgNm: form.orgNm || '-',
      managerNm: form.managerNm || '-',
      deliveryFormats: form.deliveryFormats || '-',
      specialNote: form.specialNote || '',
      internalMemo: form.internalMemo || '',
      contractType: form.contractType || '',
      subfileStatus: '미요청',
      round: 1,
      statusHistory: [{ date: form.regDate || today, label: '접수' }],
      protoPath: `/soribaro/enterprise/${isVod ? 'vod' : 'meeting'}-proto/${newId}`,
      files: files.map((f, i) => ({ fileNo: i + 1, fileName: f.name, duration: '-', size: f.size, uploadDttm: today })),
      assignments: [],
      manuals: [],
      workProgress: [],
      qcScore: null,
      qcResults: [],
      deliveries: form.dueDate
        ? [{ no: 1, dueDate: form.dueDate, deliveredDate: '-', format: form.deliveryFormats || '-', files: '전체', status: '납품예정' }]
        : [],
      settlement: { status: '정산전', items: [] },
      history: [{ dttm: (form.regDate || today) + ' 09:00', actor: '관리자', event: '프로젝트 등록', detail: form.servTitle }],
      memos: [],
    };

    if (isVod) {
      appendVodSample(newProject);
    } else {
      appendMeetingSample(newProject);
    }
    setSamples(isVod ? [...getVodSamples()] : [...getMeetingSamples()]);
  };

  return (
    <div className="notion-page enterprise-work-page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-description">{description}</p>
        </div>
        <button className="proto-register-page-btn" onClick={() => setShowRegister(true)}>
          + 새 프로젝트 등록
        </button>
      </div>

      <ProtoListDashboard samples={samples} onSamplesChange={refreshSamples} />

      {showRegister && (
        <ProtoRegisterModal isVod={isVod} onClose={() => setShowRegister(false)} onSubmit={handleRegister} />
      )}
    </div>
  );
}
