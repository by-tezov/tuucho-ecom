import { Navigate, useLocation } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { localizedPath } from '../config/i18nRoutes';
import type { AuthCredentialsState } from '../state/authCredentialsState';

/** `/register` is retired — unified connect lives at `/login`. */
export function RegisterPage() {
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
