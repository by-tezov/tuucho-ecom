import { useState } from 'react';
import type { ShopSignInMethods } from '../../../api/checkout';
import { shopConfig } from '../../../config/env';
import { useSectionUnlock } from '../../../hooks/useSectionUnlock';
import { SectionUnlockButton, SectionUnlockPrompt } from '../SectionUnlockControl';
import { GoogleSignInSettings } from './GoogleSignInSettings';
import { AppleSignInSettings } from './AppleSignInSettings';
import { FacebookSignInSettings } from './FacebookSignInSettings';
import styles from './AccountSettings.module.css';
import type { AccountUserSectionProps } from './accountSettingsTypes';

export function SignInMethodsSettings({
  t,
  user,
  setUser,
  authedRequest,
  signInMethods,
}: AccountUserSectionProps & { signInMethods: ShopSignInMethods }) {
  const [googleOffered, setGoogleOffered] = useState(
    Boolean(shopConfig.googleClientId) && signInMethods.google,
  );
  const [appleOffered, setAppleOffered] = useState(Boolean(shopConfig.appleClientId) && signInMethods.apple);
  const [facebookOffered, setFacebookOffered] = useState(
    Boolean(shopConfig.facebookAppId) && signInMethods.facebook,
  );
  const showGoogle = user.hasGoogle === true || googleOffered;
  const showApple = user.hasApple === true || appleOffered;
  const showFacebook = user.hasFacebook === true || facebookOffered;
  const hasPassword = user.hasPassword !== false;
  // One unlock for all panes, under the single button in this block's header.
  // Not one per provider: an OTP is scoped to its action, so two requests mean
  // two emails with two different codes, and whichever the user types can only
  // ever satisfy one of them — the other stayed locked and no link/unlink
  // button appeared. The 'social' token is accepted by all providers' routes.
  const sharedUnlock = useSectionUnlock('social', authedRequest, hasPassword);

  if (!showGoogle && !showApple && !showFacebook) return null;

  return (
    <div className={`${styles.block} ${styles.socialSignInBlock}`} data-testid="account-sign-in-methods">
      <div className={styles.blockHeader}>
        <h2 className={styles.blockTitle}>{t.account.signInMethodsSocialTitle}</h2>
        <SectionUnlockButton unlock={sharedUnlock} />
      </div>
      {sharedUnlock.confirming && <SectionUnlockPrompt unlock={sharedUnlock} />}
      <div className={styles.socialSignInStack}>
        {showGoogle && (
          <GoogleSignInSettings
            embedded
            sharedUnlock={sharedUnlock}
            googleOffered={googleOffered}
            onGoogleOfferedChange={setGoogleOffered}
            t={t}
            user={user}
            setUser={setUser}
            authedRequest={authedRequest}
          />
        )}
        {showGoogle && showApple && <div className={styles.socialSignInDivider} aria-hidden="true" />}
        {showApple && (
          <AppleSignInSettings
            embedded
            sharedUnlock={sharedUnlock}
            appleOffered={appleOffered}
            onAppleOfferedChange={setAppleOffered}
            t={t}
            user={user}
            setUser={setUser}
            authedRequest={authedRequest}
          />
        )}
        {(showGoogle || showApple) && showFacebook && (
          <div className={styles.socialSignInDivider} aria-hidden="true" />
        )}
        {showFacebook && (
          <FacebookSignInSettings
            embedded
            sharedUnlock={sharedUnlock}
            facebookOffered={facebookOffered}
            onFacebookOfferedChange={setFacebookOffered}
            facebookMobileDirectOAuthEnabled={signInMethods.facebookMobileDirectOAuthEnabled !== false}
            t={t}
            user={user}
            setUser={setUser}
            authedRequest={authedRequest}
          />
        )}
      </div>
      <p className={styles.socialSignInHint}>{t.account.signInMethodsSocialHint}</p>
    </div>
  );
}
