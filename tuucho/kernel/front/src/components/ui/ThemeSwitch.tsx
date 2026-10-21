import { useLang } from '../../assets/i18n';
import { useTheme } from '../../theme/themeContext';
import type { ThemePreference } from '../../theme/types';
import { MoonIcon, SunIcon, SystemPreferenceIcon } from './AppearancePreferenceIcons';
import styles from './AppearanceSwitch.module.css';

interface ThemeSwitchProps {
  className?: string;
  /** `full` (default) exposes light, dark and system. `light-dark` is the
   * compact header variant; a system preference highlights its resolved mode. */
  modes?: 'full' | 'light-dark';
}

/** Presentational appearance control. ThemeProvider owns browser state,
 * account persistence and cross-tab synchronization. */
export function ThemeSwitch({ className, modes = 'full' }: ThemeSwitchProps) {
  const { t } = useLang();
  const { preference, resolvedTheme, setPreference } = useTheme();

  const choose = (next: ThemePreference) => setPreference(next);
  const darkActive = modes === 'light-dark' ? resolvedTheme === 'dark' : preference === 'dark';
  const lightActive = modes === 'light-dark' ? resolvedTheme === 'light' : preference === 'light';

  return (
    <div
      className={[styles.switch, className].filter(Boolean).join(' ')}
      role="group"
      aria-label={t.account.themeLabel}
      data-theme-preference={preference}
    >
      <button
        type="button"
        className={`${styles.option} ${darkActive ? styles.optionActive : ''}`}
        aria-pressed={darkActive}
        aria-label={t.account.themeDark}
        title={t.account.themeDark}
        onClick={() => choose('dark')}
      >
        <MoonIcon />
      </button>
      <button
        type="button"
        className={`${styles.option} ${lightActive ? styles.optionActive : ''}`}
        aria-pressed={lightActive}
        aria-label={t.account.themeLight}
        title={t.account.themeLight}
        onClick={() => choose('light')}
      >
        <SunIcon />
      </button>
      {modes === 'full' && (
        <button
          type="button"
          className={`${styles.option} ${preference === 'system' ? styles.optionActive : ''}`}
          aria-pressed={preference === 'system'}
          aria-label={t.account.themeSystem}
          title={t.account.themeSystem}
          onClick={() => choose('system')}
        >
          <SystemPreferenceIcon />
        </button>
      )}
    </div>
  );
}
