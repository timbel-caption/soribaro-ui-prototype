import { useTranslation } from 'react-i18next';
import RecordWorkList from './RecordWorkList';

export default function RecordingRequestPage() {
  const { t } = useTranslation('soribaro');
  return (
    <RecordWorkList
      mode="request"
      title={t('recording.requestPageTitle')}
      description={t('recording.requestPageDescription')}
    />
  );
}
