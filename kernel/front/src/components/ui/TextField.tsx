import type { ChangeEvent } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './Control.module.css';

export type TextFieldType = 'text' | 'url' | 'email' | 'number' | 'password';

interface TextFieldProps {
  id?: string | undefined;
  type?: TextFieldType | undefined;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  autoComplete?: string | undefined;
  disabled?: boolean | undefined;
  spellCheck?: boolean | undefined;
  min?: number | undefined;
  step?: number | string | undefined;
  inputMode?: 'text' | 'email' | 'url' | 'numeric' | 'decimal' | undefined;
  'aria-label'?: string | undefined;
  'aria-describedby'?: string | undefined;
  className?: string | undefined;
}

function TextFieldRoot({
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  spellCheck,
  min,
  step,
  inputMode,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  className,
}: TextFieldProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }
  return (
    <input
      id={id}
      className={[styles.input, className].filter(Boolean).join(' ')}
      type={type}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      autoComplete={autoComplete}
      disabled={disabled}
      spellCheck={spellCheck}
      min={min}
      step={step}
      inputMode={inputMode}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    />
  );
}

export const TextField = withKernelUi(KERNEL_UI.TextField, TextFieldRoot);
