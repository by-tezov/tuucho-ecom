import type { ChangeEvent } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './Control.module.css';

interface TextareaFieldProps {
  id?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  spellCheck?: boolean | undefined;
  autoComplete?: string | undefined;
  rows?: number | undefined;
  /** `compact` for short copy; `long` for PEM / JSON. Never the default for a URL. */
  size?: 'compact' | 'long' | undefined;
  'aria-label'?: string | undefined;
  'aria-describedby'?: string | undefined;
  className?: string | undefined;
}

function TextareaFieldRoot({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  spellCheck,
  autoComplete,
  rows,
  size = 'compact',
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  className,
}: TextareaFieldProps) {
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
  }
  return (
    <textarea
      id={id}
      className={[styles.textarea, size === 'long' ? styles.long : styles.compact, className]
        .filter(Boolean)
        .join(' ')}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={spellCheck}
      autoComplete={autoComplete}
      rows={rows ?? (size === 'long' ? 6 : 3)}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    />
  );
}

export const TextareaField = withKernelUi(KERNEL_UI.TextareaField, TextareaFieldRoot);
