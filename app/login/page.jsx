import LoginForm from '../../components/LoginForm';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, googleEnabled, passwordEnabled } from '../../lib/gate';

export const dynamic = 'force-dynamic';

export default function Login() {
  const google = googleEnabled();
  return (
    <LoginForm
      google={google ? { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY } : null}
      password={passwordEnabled()}
    />
  );
}
