import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type ChangeEvent } from 'react';
import styles from './ImageAttachField.module.css';

const CONTACT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const CONTACT_IMAGE_MAX_COUNT = 3;
/** Raw client-side ceiling before upload (server re-checks after sharp). */
const CONTACT_IMAGE_MAX_RAW_BYTES = 8 * 1024 * 1024;

export interface ImageAttachFieldHandle {
  openPicker: () => void;
}

type ImageAttachFieldProps = {
  label: string;
  hint: string;
  removeAria: string;
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  /** Shown under the list when the last pick was rejected. */
  error?: string | null;
  onError?: (message: string | null) => void;
  errorTooMany: string;
  errorInvalidType: string;
  errorTooLarge: string;
  /** Extra class on the label + inline pick button row — lets a caller hide
   * it responsively (e.g. only past a breakpoint, in favor of an external
   * control driving the picker via the ref) without baking that layout
   * decision into this shared component. */
  rowClassName?: string | undefined;
};

type Preview = { key: string; url: string; name: string };

function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function AttachIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M9.6 3.3 4.9 8a1.7 1.7 0 0 0 2.4 2.4l4.3-4.3a2.9 2.9 0 0 0-4.1-4.1L3.2 6.3a4.1 4.1 0 0 0 5.7 5.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const ImageAttachField = forwardRef<ImageAttachFieldHandle, ImageAttachFieldProps>(
  function ImageAttachField(
    {
      label,
      hint,
      removeAria,
      files,
      onChange,
      disabled = false,
      error = null,
      onError,
      errorTooMany,
      errorInvalidType,
      errorTooLarge,
      rowClassName,
    },
    ref,
  ) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [previews, setPreviews] = useState<Preview[]>([]);

    useImperativeHandle(ref, () => ({
      openPicker: () => inputRef.current?.click(),
    }));

    useEffect(() => {
      const next = files.map((file) => ({
        key: fileKey(file),
        url: URL.createObjectURL(file),
        name: file.name,
      }));
      setPreviews(next);
      return () => {
        for (const item of next) URL.revokeObjectURL(item.url);
      };
    }, [files]);

    function handlePick(event: ChangeEvent<HTMLInputElement>) {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (picked.length === 0) return;

      const allowed = new Set(CONTACT_IMAGE_ACCEPT.split(','));
      const merged = [...files];
      let rejection: string | null = null;

      for (const file of picked) {
        if (merged.length >= CONTACT_IMAGE_MAX_COUNT) {
          rejection = errorTooMany;
          break;
        }
        if (!allowed.has(file.type)) {
          rejection = errorInvalidType;
          continue;
        }
        if (file.size > CONTACT_IMAGE_MAX_RAW_BYTES) {
          rejection = errorTooLarge;
          continue;
        }
        if (merged.some((existing) => fileKey(existing) === fileKey(file))) continue;
        merged.push(file);
      }

      onError?.(rejection);
      onChange(merged);
    }

    return (
      <div className={styles.root}>
        <div className={rowClassName ? `${styles.row} ${rowClassName}` : styles.row}>
          <label className={styles.label} htmlFor={inputId}>
            {label}
          </label>
          <button
            type="button"
            className={styles.pickButton}
            disabled={disabled || files.length >= CONTACT_IMAGE_MAX_COUNT}
            onClick={() => inputRef.current?.click()}
          >
            <AttachIcon />
          </button>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={CONTACT_IMAGE_ACCEPT}
            multiple
            className={styles.input}
            disabled={disabled}
            onChange={handlePick}
          />
        </div>
        <p className={error ? styles.hint : `${styles.hint} ${styles.hintOptional}`}>{hint}</p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {previews.length > 0 ? (
          <ul className={styles.list}>
            {previews.map((preview, index) => {
              const file = files[index];
              return (
                <li key={preview.key} className={styles.item}>
                  <img src={preview.url} alt="" className={styles.thumb} />
                  <span className={styles.name}>{preview.name}</span>
                  <button
                    type="button"
                    className={styles.remove}
                    disabled={disabled}
                    aria-label={removeAria.replace('{fileName}', preview.name)}
                    onClick={() => {
                      onError?.(null);
                      onChange(files.filter((item) => item !== file));
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    );
  },
);
