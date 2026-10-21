import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import styles from './OtpCodeInput.module.css';

interface OtpCodeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  focusOnMount?: boolean;
  length?: number;
  compact?: boolean;
  className?: string;
  autoComplete?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'data-testid'?: string;
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Digit boxes with paste + auto-advance. Length defaults to 6 (login OTP). */
export function OtpCodeInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
  focusOnMount,
  length = 6,
  compact,
  className,
  autoComplete,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'data-testid': testId,
}: OtpCodeInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length }, (_, index) => value[index] ?? '');

  useEffect(() => {
    if (!focusOnMount || disabled) return;
    const firstInput = inputsRef.current[0];
    firstInput?.focus();
    firstInput?.select();
  }, [disabled, focusOnMount]);

  function focusIndex(index: number) {
    const clamped = Math.max(0, Math.min(length - 1, index));
    inputsRef.current[clamped]?.focus();
    inputsRef.current[clamped]?.select();
  }

  function writeAt(index: number, digit: string) {
    const next = chars.slice();
    next[index] = digit;
    onChange(next.join('').replace(/\s/g, ''));
  }

  function fillFrom(index: number, digits: string) {
    const start = digits.length >= length ? 0 : index;
    const next = chars.slice();
    for (let offset = 0; offset < digits.length && start + offset < length; offset += 1) {
      next[start + offset] = digits[offset]!;
    }
    onChange(next.join(''));
    focusIndex(Math.min(start + digits.length, length - 1));
  }

  function handleChange(index: number, raw: string) {
    let digits = digitsOnly(raw);
    const previous = chars[index];
    if (previous && digits.length > 1 && digits.length !== length) {
      if (digits.startsWith(previous)) digits = digits.slice(1);
      else if (digits.endsWith(previous)) digits = digits.slice(0, -1);
    }
    digits = digits.slice(0, length);
    if (digits.length === 0) {
      writeAt(index, '');
      return;
    }
    if (digits.length > 1) {
      fillFrom(index, digits);
      return;
    }
    writeAt(index, digits);
    if (index < length - 1) focusIndex(index + 1);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !chars[index] && index > 0) {
      event.preventDefault();
      writeAt(index - 1, '');
      focusIndex(index - 1);
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusIndex(index - 1);
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      focusIndex(index + 1);
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = digitsOnly(event.clipboardData?.getData('text') ?? '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    fillFrom(index, pasted);
  }

  const firstAutoComplete = autoComplete ?? (length === 6 ? 'one-time-code' : 'off');

  return (
    <div
      className={[styles.row, compact ? styles.compact : '', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      data-testid={testId}
    >
      {chars.map((char, index) => (
        <div key={index} className={invalid ? `${styles.cell} ${styles.invalid}` : styles.cell}>
          <input
            ref={(node) => {
              inputsRef.current[index] = node;
            }}
            id={index === 0 ? id : undefined}
            className={styles.box}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? firstAutoComplete : 'off'}
            disabled={disabled}
            value={char}
            maxLength={1}
            aria-invalid={invalid || undefined}
            aria-label={ariaLabel ? `${ariaLabel} ${index + 1}` : undefined}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      ))}
    </div>
  );
}
