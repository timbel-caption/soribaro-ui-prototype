import { useTranslation } from 'react-i18next';
import RecordWorkList from './RecordWorkList';

export default function RecordingWorkPage() {
  const { t } = useTranslation('soribaro');
  return (
    <RecordWorkList
      mode="work"
      title={t('recording.workPageTitle')}
      description={t('recording.workPageDescription')}
    />
  );
}
