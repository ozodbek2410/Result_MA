import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import { Loading } from '../../components/ui/Loading';

export default function SsoCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const crmId = searchParams.get('crmId');
    const token = searchParams.get('token');
    const ts = searchParams.get('ts');

    if (!crmId || !token || !ts) {
      navigate('/login?error=sso_invalid', { replace: true });
      return;
    }

    api
      .post('/auth/sso', { crmId, token, ts })
      .then(({ data }) => {
        setAuth(data.user, data.token);
        navigate('/teacher/', { replace: true });
      })
      .catch(() => {
        navigate('/login?error=sso', { replace: true });
      });
  }, []);

  return <Loading />;
}
