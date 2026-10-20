import { useId } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import { Chip } from './Chip';
import { Field } from './Field';
import { TextareaField } from './TextareaField';
import { TextField } from './TextField';
import styles from './SecretField.module.css';

interface SecretFieldProps {
  label: string;
  description?: string | undefined;
  /** Stored secret exists. The value itself is never shown. */
  isSet: boolean;
  /** Replace draft only. Empty means leave the stored secret unchanged. */
  value: string;
  onChange: (value: string) => void;
  long?: boolean | undefined;
  setLabel: string;
  notSetLabel: string;
  placeholder?: string | undefined;
}

function SecretFieldRoot({
  label,
  description,
  isSet,
  value,
  onChange,
  long = false,
  setLabel,
  notSetLabel,
  placeholder,
}: SecretFieldProps) {
  const id = useId();
  const hintId = description ? `${id}-hint` : undefined;
  return (
    <Field label={label} description={description} htmlFor={id}>
      <div className={styles.replace}>
        <div className={styles.status}>
          <Chip className={styles.statusChip}>{isSet ? setLabel : notSetLabel}</Chip>
        </div>
        {long ? (
          <TextareaField
            id={id}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            autoComplete="new-password"
            spellCheck={false}
            size="long"
            aria-describedby={hintId}
          />
        ) : (
          <TextField
            id={id}
            type="password"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            autoComplete="new-password"
            spellCheck={false}
            aria-describedby={hintId}
          />
        )}
      </div>
    </Field>
  );
}

export const SecretField = withKernelUi(KERNEL_UI.SecretField, SecretFieldRoot);
