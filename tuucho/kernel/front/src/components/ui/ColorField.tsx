import { useId } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import { Field } from './Field';
import { TextField } from './TextField';
import styles from './ColorField.module.css';

interface ColorFieldProps {
  label: string;
  description?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  hexLabel: string;
}

function toColorInput(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return '#121212';
}

function ColorFieldRoot({ label, description, value, onChange, hexLabel }: ColorFieldProps) {
  const id = useId();
  const hexId = `${id}-hex`;
  const swatch = toColorInput(value);
  return (
    <Field label={label} description={description} htmlFor={hexId}>
      <div className={styles.row}>
        <input
          className={styles.swatch}
          type="color"
          value={swatch}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
        <TextField
          id={hexId}
          className={styles.hex}
          type="text"
          value={value}
          spellCheck={false}
          aria-label={hexLabel}
          onChange={(next) => {
            const trimmed = next.trim();
            if (trimmed === '' || /^#[0-9a-fA-F]{0,6}$/.test(trimmed)) onChange(trimmed);
          }}
        />
      </div>
    </Field>
  );
}

export const ColorField = withKernelUi(KERNEL_UI.ColorField, ColorFieldRoot);
