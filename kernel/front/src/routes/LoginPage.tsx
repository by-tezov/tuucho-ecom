import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { Seo } from '../components/seo/Seo';
import { LoginForm } from '../components/auth/LoginForm';
import { AuthWelcome } from '../components/auth/AuthWelcome';
import { authReturnTo, type AuthCredentialsState } from '../state/authCredentialsState';
import { adminPath, isStaffRole } from '../utils/adminRoute';
import { loadAuthConsentDraft } from '../state/authConsentDraft';
import styles from './AuthPage.module.css';

function initialConsentStepActive(): boolean {
  const draft = loadAuthConsentDraft();
  return (
    Boolean(draft.googleSignupToken || draft.appleSignupToken || draft.facebookSignupToken) ||
    draft.step === 'password' ||
    draft.step === 'otp' ||
    draft.socialChoiceStep === 'consent'
  );
}

/** Standalone /login page — unified “Se connecter ou créer un compte”
 * (mobile/tablet equivalent of AuthModal below the 1024px breakpoint). */
export function LoginPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = location.state as AuthCredentialsState | null;
  const returnTo = authReturnTo(incoming, lang);
  const [email, setEmail] = useState(incoming?.email ?? '');
  const [password, setPassword] = useState(incoming?.password ?? '');
  const [consentStepActive, setConsentStepActive] = useState(initialConsentStepActive);

  const pageTitle = consentStepActive ? t.auth.googleConsentTitle : t.auth.modalTitleLogin;

  return (
    <section aria-labelledby="login-h" className={`${styles.section} ${styles.loginSection}`}>
      <Seo title={pageTitle} description={pageTitle} path="/login" noindex />
      <div className={styles.loginTitleBlock}>
        <h1 id="login-h" className={styles.title}>
          {pageTitle}
        </h1>
        {!consentStepActive && (
          <AuthWelcome
            sentences={t.auth.loginWelcome}
            className={styles.authWelcome ?? ''}
            {...(styles.authWelcomeLast ? { lastClassName: styles.authWelcomeLast } : {})}
          />
        )}
      </div>
      <LoginForm
        email={email}
        onEmailChange={setEmail}
        password={password}
        onPasswordChange={setPassword}
        legalLinkState={{ email, password, returnTo: incoming?.returnTo }}
        {...(incoming?.returnTo ? { authReturnTo: incoming.returnTo } : {})}
        draftSurface="login-page"
        onConsentStepChange={setConsentStepActive}
        onSuccess={(session) =>
          navigate(isStaffRole(session.user.role) ? adminPath() : returnTo, { replace: true })
        }
      />
    </section>
  );
}
