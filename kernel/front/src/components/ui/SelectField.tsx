import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import { Chip } from './Chip';
import { Field } from './Field';
import { SegmentedSwitch } from './SegmentedSwitch';
import styles from './SelectField.module.css';

export type SelectFieldOption = { value: string; label: string };

interface SelectFieldProps {
  label: string;
  description?: string | undefined;
  options: SelectFieldOption[];
  value: string;
  onChange: (value: string) => void;
}

/** Exclusive choice. Never a native `<select>`. */
function SelectFieldRoot({ label, description, options, value, onChange }: SelectFieldProps) {
  const control =
    options.length <= 4 ? (
      <div className={styles.switch}>
        <SegmentedSwitch
          options={options.map((option) => ({ key: option.value, label: option.label }))}
          activeKey={value}
          onSelect={onChange}
          ariaLabel={label}
        />
      </div>
    ) : (
      <div className={styles.chips} role="listbox" aria-label={label}>
        {options.map((option) => (
          <Chip
            key={option.value}
            active={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    );
  return (
    <Field label={label} description={description}>
      {control}
    </Field>
  );
}

export const SelectField = withKernelUi(KERNEL_UI.SelectField, SelectFieldRoot);
