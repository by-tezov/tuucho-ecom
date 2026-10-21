import type { ReactNode } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import typography from './Typography.module.css';
import styles from './Field.module.css';

interface FieldProps {
  label: string;
  /** Help text under the label. Empty is a product bug on Configure schemas. */
  description?: string | undefined;
  htmlFor?: string | undefined;
  error?: string | undefined;
  /** `inline` puts the control on the right (ToggleSwitch). */
  layout?: 'stack' | 'inline' | undefined;
  children: ReactNode;
}

function FieldRoot({
  label,
  description,
  htmlFor,
  error,
  layout = 'stack',
  children,
}: FieldProps) {
  const hintId = description && htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className={[styles.root, layout === 'inline' ? styles.inline : null].filter(Boolean).join(' ')}>
      <div className={styles.head}>
        {htmlFor ? (
          <label htmlFor={htmlFor} className={styles.label}>
            {label}
          </label>
        ) : (
          <span className={styles.label}>{label}</span>
        )}
        {description ? (
          <p className={styles.description} id={hintId}>
            {description}
          </p>
        ) : null}
      </div>
      <div className={styles.control}>{children}</div>
      {error ? (
        <p className={typography.fieldError} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Field = withKernelUi(KERNEL_UI.Field, FieldRoot);
