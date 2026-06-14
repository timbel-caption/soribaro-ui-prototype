import { useTranslation } from 'react-i18next';
import EnterpriseWorkList from './EnterpriseWorkList';

export default function EnterpriseVodPage() {
  const { t } = useTranslation('soribaro');
  return (
    <EnterpriseWorkList
      videoYn="Y"
      title={t('enterprise.vodPageTitle')}
      description={t('enterprise.vodPageDescription')}
    />
  );
}
