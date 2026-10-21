import { useId, type ChangeEvent } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import { Field } from './Field';
import styles from './Control.module.css';

interface FileFieldProps {
  label: string;
  description?: string | undefined;
  accept?: string | undefined;
  multiple?: boolean | undefined;
  disabled?: boolean | undefined;
  onFiles: (files: File[]) => void;
}

function FileFieldRoot({ label, description, accept, multiple, disabled, onFiles }: FileFieldProps) {
  const id = useId();
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    onFiles(list ? Array.from(list) : []);
    event.target.value = '';
  }
  return (
    <Field label={label} description={description} htmlFor={id}>
      <input
        id={id}
        className={styles.input}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleChange}
      />
    </Field>
  );
}

export const FileField = withKernelUi(KERNEL_UI.FileField, FileFieldRoot);
