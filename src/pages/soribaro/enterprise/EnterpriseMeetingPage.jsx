import { useTranslation } from 'react-i18next';
import EnterpriseWorkList from './EnterpriseWorkList';

export default function EnterpriseMeetingPage() {
  const { t } = useTranslation('soribaro');
  return (
    <EnterpriseWorkList
      videoYn="N"
      title={t('enterprise.meetingPageTitle')}
      description={t('enterprise.meetingPageDescription')}
    />
  );
}
