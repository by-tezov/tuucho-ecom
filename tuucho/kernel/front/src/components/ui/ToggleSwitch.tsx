import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './ToggleSwitch.module.css';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name when no visible text is associated. */
  'aria-label'?: string;
  /** The name is the action a click performs ("Cacher", "Montrer") and so
   * flips with the state. Then this renders a plain button: a switch whose
   * name changes along with `aria-checked` reads as a contradiction
   * ("Cacher, interrupteur, activé"). ARIA APG: a toggle whose label changes
   * must not also expose a state. */
  labelIsAction?: boolean;
}

/** Custom on/off control. Implemented as a button (role=switch), not a
 * checkbox — Chromium paints a blinking text caret on focused opacity:0
 * checkboxes, which looked broken next to these tracks. Mouse focus is
 * also suppressed; keyboard Tab + Space/Enter still works with the
 * :focus-visible ring. */
function ToggleSwitchRoot({
  checked,
  onChange,
  disabled,
  'aria-label': ariaLabel,
  labelIsAction = false,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      {...(labelIsAction ? {} : { role: 'switch', 'aria-checked': checked })}
      aria-label={ariaLabel}
      disabled={disabled}
      className={styles.root}
      data-checked={checked}
      onMouseDown={suppressMouseFocus}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.track} aria-hidden="true" />
    </button>
  );
}

export const ToggleSwitch = withKernelUi(KERNEL_UI.ToggleSwitch, ToggleSwitchRoot);
