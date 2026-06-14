import { useTranslation } from 'react-i18next';
import EnterpriseWorkDetailPage from '../enterprise/EnterpriseWorkDetailPage';
import { getRecordWorkWorkDetail } from '../../../api/v9';

export default function RecordingWorkDetailPage() {
  const { t } = useTranslation('soribaro');
  return (
    <EnterpriseWorkDetailPage
      fetchDetailApi={getRecordWorkWorkDetail}
      backLabel={t('common.backToWorkList')}
      showVideoYn={false}
      hideProjectTypeSelect={true}
      showRequestDetails={true}
      showAddRequestFile={false}
      notificationSendType="11"
      showRequesterContactPayment={true}
    />
  );
}
