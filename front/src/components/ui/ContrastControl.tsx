import { useLang } from '../../assets/i18n';
import { useTheme } from '../../theme/themeContext';
import {
  EnhancedContrastIcon,
  StandardContrastIcon,
  SystemPreferenceIcon,
} from './AppearancePreferenceIcons';
import switchStyles from './AppearanceSwitch.module.css';
import styles from './ContrastControl.module.css';

interface ContrastControlProps {
  className?: string;
  /** The compact form keeps its accessible name but hides the text visually. */
  compact?: boolean;
  /** Keep the labelled desktop control, then use its icon below 1024px. */
  compactOnMobile?: boolean;
  /** Account settings exposes standard, enhanced and system as a compact icon switch.
   * `standard-more` is the compact header/burger pair (no system), like ThemeSwitch
   * `light-dark`. */
  modes?: 'toggle' | 'full' | 'standard-more';
}

/** Shared enhanced-contrast toggle for public and admin surfaces. */
export function ContrastControl({
  className,
  compact = false,
  compactOnMobile = false,
  modes = 'toggle',
}: ContrastControlProps) {
  const { t } = useLang();
  const { contrastPreference, resolvedContrast, setContrastPreference } = useTheme();

  if (modes === 'full' || modes === 'standard-more') {
    const standardActive =
      modes === 'standard-more' ? resolvedContrast === 'standard' : contrastPreference === 'standard';
    const moreActive =
      modes === 'standard-more' ? resolvedContrast === 'more' : contrastPreference === 'more';

    return (
      <div
        className={[switchStyles.switch, className].filter(Boolean).join(' ')}
        role="group"
        aria-label={t.account.contrastLabel}
        data-contrast-preference={contrastPreference}
      >
        <button
          type="button"
          className={`${switchStyles.option} ${standardActive ? switchStyles.optionActive : ''}`}
          aria-pressed={standardActive}
          aria-label={t.account.contrastStandard}
          title={t.account.contrastStandard}
          onClick={() => setContrastPreference('standard')}
        >
          <StandardContrastIcon />
        </button>
        <button
          type="button"
          className={`${switchStyles.option} ${moreActive ? switchStyles.optionActive : ''}`}
          aria-pressed={moreActive}
          aria-label={t.account.contrastMore}
          title={t.account.contrastMore}
          onClick={() => setContrastPreference('more')}
        >
          <EnhancedContrastIcon />
        </button>
        {modes === 'full' && (
          <button
            type="button"
            className={`${switchStyles.option} ${
              contrastPreference === 'system' ? switchStyles.optionActive : ''
            }`}
            aria-pressed={contrastPreference === 'system'}
            aria-label={t.account.contrastSystem}
            title={t.account.contrastSystem}
            onClick={() => setContrastPreference('system')}
          >
            <SystemPreferenceIcon />
          </button>
        )}
      </div>
    );
  }

  const enhanced = resolvedContrast === 'more';
  return (
    <button
      type="button"
      className={[
        styles.toggle,
        compact && styles.compact,
        compactOnMobile && styles.compactOnMobile,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={t.account.contrastToggle}
      aria-pressed={enhanced}
      title={t.account.contrastToggle}
      onClick={() => setContrastPreference(enhanced ? 'standard' : 'more')}
    >
      <EnhancedContrastIcon size={18} />
      <span className={compact ? styles.visuallyHidden : styles.label}>{t.account.contrastToggle}</span>
    </button>
  );
}
