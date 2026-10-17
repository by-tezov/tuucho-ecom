import googleIconUrl from '../../assets/images/brand/google-g.svg';
import appleIconUrl from '../../assets/images/brand/apple.svg';
import facebookIconUrl from '../../assets/images/brand/facebook-f.svg';
import socialButtonStyles from '../auth/SocialSignInButton.module.css';

const PROVIDER_ICON: Record<'google' | 'apple' | 'facebook', string> = {
  google: googleIconUrl,
  apple: appleIconUrl,
  facebook: facebookIconUrl,
};

/** Same chrome as the associate social buttons (max-width, radius, icon). */
export function SocialUnlinkButton({
  provider,
  disabled = false,
  onClick,
  testId,
  children,
}: {
  provider: 'google' | 'apple' | 'facebook';
  disabled?: boolean;
  onClick: () => void;
  testId: string;
  children: string;
}) {
  return (
    <button
      type="button"
      className={socialButtonStyles.socialButton}
      data-provider={provider}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      <img src={PROVIDER_ICON[provider]} alt="" width={20} height={20} decoding="async" />
      <span>{children}</span>
    </button>
  );
}
