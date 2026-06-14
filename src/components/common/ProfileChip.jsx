import { useState, useEffect } from 'react';
import Chip from '@mui/material/Chip';
import { getProfile } from '../../api/v9';

const ProfileChip = ({ email, ...chipProps }) => {
  const [label, setLabel] = useState(email || '');
  useEffect(() => {
    if (!email) return;
    getProfile(email).then((res) => {
      if (res?.status === 'SUCCESS' && res.data?.membNm) {
        setLabel(`${res.data.membNm}(${email})`);
      }
    }).catch(() => {});
  }, [email]);
  return <Chip label={label} {...chipProps} />;
};

export default ProfileChip;
