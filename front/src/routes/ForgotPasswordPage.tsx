import { Navigate, useLocation } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { localizedPath } from '../config/i18nRoutes';
import type { AuthCredentialsState } from '../state/authCredentialsState';

/** `/forgot-password` is retired — recovery is OTP from the unified connect
 * form at `/login`. Keep the route so old bookmarks still resolve. */
export function ForgotPasswordPage() {
  const { lang } = useLang();
  const location = useLocation();
  const incoming = location.state as AuthCredentialsState | null;

  return (
    <Navigate
      to={localizedPath('/login', lang)}
      replace
      state={
        incoming
          ? { email: incoming.email, password: incoming.password, returnTo: incoming.returnTo }
          : undefined
      }
    />
  );
}
