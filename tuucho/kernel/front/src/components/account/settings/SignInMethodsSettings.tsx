import { useState } from 'react';
import type { ShopSignInMethods } from '../../../api/checkout';
import { shopConfig } from '../../../config/env';
import { useSectionUnlock } from '../../../hooks/useSectionUnlock';
import { useStorefrontBootstrap } from '../../../plugins/StorefrontBootstrap';
import { Separator } from '../../ui/Separator';
import { SectionUnlockButton, SectionUnlockPrompt } from '../SectionUnlockControl';
import { GoogleSignInSettings } from './GoogleSignInSettings';
import { AppleSignInSettings } from './AppleSignInSettings';
import { FacebookSignInSettings } from './FacebookSignInSettings';
import {
  signInBlockVisible,
  signInOpeningOn,
  signInProviderOffered,
  signInProviderVisible,
} from './signInProviderVisibility';
import styles from './AccountSettings.module.css';
import type { AccountUserSectionProps } from './accountSettingsTypes';

export function SignInMethodsSettings({
  t,
  user,
  setUser,
  authedRequest,
  signInMethods,
}: AccountUserSectionProps & { signInMethods: ShopSignInMethods }) {
  const openings = useStorefrontBootstrap().openings?.signInMethods;
  const googlePluginOn = signInOpeningOn(openings, 'google');
  const applePluginOn = signInOpeningOn(openings, 'apple');
  const facebookPluginOn = signInOpeningOn(openings, 'facebook');
  const [googleOffered, setGoogleOffered] = useState(
    signInProviderOffered(googlePluginOn, signInMethods.google, Boolean(shopConfig.googleClientId)),
  );
  const [appleOffered, setAppleOffered] = useState(
    signInProviderOffered(applePluginOn, signInMethods.apple, Boolean(shopConfig.appleClientId)),
  );
  const [facebookOffered, setFacebookOffered] = useState(
    signInProviderOffered(facebookPluginOn, signInMethods.facebook, Boolean(shopConfig.facebookAppId)),
  );
  const showGoogle = signInProviderVisible(googlePluginOn, user.hasGoogle === true);
  const showApple = signInProviderVisible(applePluginOn, user.hasApple === true);
  const showFacebook = signInProviderVisible(facebookPluginOn, user.hasFacebook === true);
  const hasPassword = user.hasPassword !== false;
  // The block itself is broader than any single row: it shows when the
  // opening is on, or a provider is configured, or one is already linked.
  const blockVisible = signInBlockVisible(openings, [
    { configured: Boolean(shopConfig.googleClientId), linked: user.hasGoogle === true },
    { configured: Boolean(shopConfig.appleClientId), linked: user.hasApple === true },
    { configured: Boolean(shopConfig.facebookAppId), linked: user.hasFacebook === true },
  ]);
  // One unlock for all panes, under the single button in this block's header.
  // Not one per provider: an OTP is scoped to its action, so two requests mean
  // two emails with two different codes, and whichever the user types can only
  // ever satisfy one of them — the other stayed locked and no link/unlink
  // button appeared. The 'social' token is accepted by all providers' routes.
  const sharedUnlock = useSectionUnlock('social', authedRequest, hasPassword);

  if (!blockVisible) return null;

  return (
    <div className={`${styles.block} ${styles.socialSignInBlock}`} data-testid="account-sign-in-methods">
      <div className={styles.blockHeader}>
        <h2 className={styles.blockTitle}>{t.account.signInMethodsSocialTitle}</h2>
        {/* The unlock control belongs to the block, not to canUnlock
            visibility: gating it on offered/linked hid Déverrouiller exactly
            when a visible row still needed it. useSectionUnlock owns the
            actual unlock flow. */}
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
        {showGoogle && showApple && <Separator bleed="inset" />}
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
        {(showGoogle || showApple) && showFacebook && <Separator bleed="inset" />}
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
