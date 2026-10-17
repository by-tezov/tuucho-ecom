import { useEffect, useRef, useState } from 'react';
import { useLang } from '../assets/i18n';
import { useAuthSession } from '../state/AuthContext';
import * as authApi from '../api/account';
import { getShopSignInMethods, type ShopSignInMethods } from '../api/checkout';
import { Seo } from '../components/seo/Seo';
import { AccountShell } from '../components/account/AccountShell';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { ContrastControl } from '../components/ui/ContrastControl';
import { ThemeSwitch } from '../components/ui/ThemeSwitch';
import {
  ChangeEmailSettings,
  ProfileSettings,
  ResendConfirmation,
} from '../components/account/settings/ProfileSettings';
import { RecentLoginActivity } from '../components/account/settings/RecentLoginActivity';
import { SignInMethodsSettings } from '../components/account/settings/SignInMethodsSettings';
import { PasswordSettings } from '../components/account/settings/PasswordSettings';
import { DeletionSettings } from '../components/account/settings/DeletionSettings';
import { OnboardingReplaySettings } from '../components/account/settings/OnboardingReplaySettings';
import styles from '../components/account/settings/AccountSettings.module.css';
import { OpeningEntries } from '../plugins/OpeningEntries';
import { useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';

const SIGN_IN_METHODS_OFF: ShopSignInMethods = {
  google: false,
  apple: false,
  facebook: false,
  facebookMobileDirectOAuthEnabled: false,
  googleVerbose: false,
  appleVerbose: false,
  facebookVerbose: false,
};

interface AccountBootstrap {
  accountId: string;
  phoneCountryCodes: string[];
  recentLogins: authApi.RecentLogin[];
  signInMethods: ShopSignInMethods;
}

/** Route composition for the authenticated account area. Each settings
 * concern owns its own UI and state in components/account/settings/. */
export function AccountPage() {
  const { t, lang } = useLang();
  const { user, setUser, authedRequest, isImpersonating } = useAuthSession();
  const storefront = useStorefrontBootstrap();
  const accountId = user?.id ?? null;
  const authedRequestRef = useRef(authedRequest);
  authedRequestRef.current = authedRequest;
  const [bootstrap, setBootstrap] = useState<AccountBootstrap | null>(null);

  // The profile previously let each section mount and fetch independently,
  // which made phone options, recent logins and social methods appear at
  // different times. Settle every initial request before mounting any form.
  useEffect(() => {
    if (!accountId) {
      setBootstrap(null);
      return;
    }
    let cancelled = false;
    setBootstrap(null);
    void (async () => {
      const request = authedRequestRef.current;
      const [profileResult, countriesResult, loginsResult, signInMethodsResult] = await Promise.all([
        request((token) => authApi.getProfile(token)).catch(() => null),
        authApi.listPhoneCountries().catch(() => null),
        request((token) => authApi.listRecentLogins(token)).catch(() => null),
        getShopSignInMethods().catch(() => null),
      ]);
      if (cancelled) return;
      if (profileResult) setUser(profileResult.user);
      setBootstrap({
        accountId,
        phoneCountryCodes: countriesResult?.countries.map((country) => country.code) ?? [],
        recentLogins: loginsResult?.logins ?? [],
        signInMethods: signInMethodsResult?.signInMethods ?? SIGN_IN_METHODS_OFF,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, setUser]);

  if (!user) return null;
  if (!bootstrap || bootstrap.accountId !== user.id) return <AccountShell loading />;

  const userSectionProps = { t, user, setUser, authedRequest };

  return (
    <AccountShell>
      <section aria-labelledby="account-h" className={styles.section}>
        <Seo title={t.account.pageTitle} description={t.account.pageTitle} path="/account" noindex />
        <LegalPageBackLink placement="top" />
        <div className={styles.titleRow}>
          <h1 id="account-h" className={styles.title}>
            {t.account.pageTitle}
          </h1>
          <div className={styles.appearanceControls}>
            <ThemeSwitch />
            <ContrastControl modes="full" />
          </div>
        </div>

        <div className={styles.emailRow}>
          <span className={styles.email}>{user.email}</span>
          <span
            className={
              user.emailVerified
                ? `${styles.badge} ${styles.badgeVerified}`
                : `${styles.badge} ${styles.badgeUnverified}`
            }
          >
            {user.emailVerified ? t.account.emailVerifiedBadge : t.account.emailUnverifiedBadge}
          </span>
        </div>
        {!user.emailVerified && <ResendConfirmation t={t} authedRequest={authedRequest} />}

        <div className={styles.settingsGrid}>
          <ProfileSettings {...userSectionProps} phoneCountryCodes={bootstrap.phoneCountryCodes} />
          <ChangeEmailSettings {...userSectionProps} />
          <RecentLoginActivity t={t} lang={lang} logins={bootstrap.recentLogins} />
          <SignInMethodsSettings {...userSectionProps} signInMethods={bootstrap.signInMethods} />
          <OpeningEntries entries={storefront.openings?.profile} className={styles.block} />
          <OpeningEntries entries={storefront.openings?.signInMethods} className={styles.block} />
          <PasswordSettings {...userSectionProps} />
          {!isImpersonating && <OnboardingReplaySettings />}
          <DeletionSettings {...userSectionProps} lang={lang} />
        </div>

        <LegalPageBackLink placement="bottom" />
      </section>
    </AccountShell>
  );
}
