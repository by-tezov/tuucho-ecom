import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { useLang } from '../../assets/i18n';
import styles from './AuthForm.module.css';

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>;

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const { t } = useLang();
    const [visible, setVisible] = useState(false);

    return (
      <div className={styles.passwordInputWrapper}>
        <input ref={ref} {...props} type={visible ? 'text' : 'password'} className={styles.input} />
        <button
          type="button"
          className={styles.passwordToggle}
          onClick={() => setVisible((v) => !v)}
          // The name is the action and flips with it, so no aria-pressed too:
          // "Masquer le mot de passe, activé" would contradict itself.
          aria-label={visible ? t.auth.hidePasswordAria : t.auth.showPasswordAria}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    );
  },
);

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9.9 4.24A11.4 11.4 0 0 1 12 4c7 0 11 7 11 7a17.6 17.6 0 0 1-3.4 4.34M6.6 6.6C3.7 8.4 1 12 1 12s4 7 11 7a10.4 10.4 0 0 0 4.4-.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
