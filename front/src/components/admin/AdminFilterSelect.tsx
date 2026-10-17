import { useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import styles from './AdminFilterSelect.module.css';

export type AdminFilterOption<Value extends string> = {
  value: Value;
  label: string;
};

interface AdminFilterSelectProps<Value extends string> {
  label: string;
  options: AdminFilterOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  closeLabel: string;
  disabled?: boolean;
  /** Text field at the top of the dialog. Narrows `options` by label. */
  filter?: {
    label: string;
    placeholder: string;
    empty: string;
  };
}

/** Case-insensitive substring. An empty query keeps every option. */
export function matchesAdminFilterOption(label: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return label.toLocaleLowerCase().includes(needle);
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 6 8 10.5 12.5 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Compact filter control used by admin pages that need several independent
 * selectors (journal, …). Opens a BottomSheet (mobile sheet / desktop dialog)
 * with the shared ModalScrollBody scroll cues. */
export function AdminFilterSelect<Value extends string>({
  label,
  options,
  value,
  onChange,
  closeLabel,
  disabled = false,
  filter,
}: AdminFilterSelectProps<Value>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = options.find((option) => option.value === value);
  const visible = filter
    ? options.filter((option) => matchesAdminFilterOption(option.label, query))
    : options;

  function close() {
    setQuery('');
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={styles.selector}
        aria-haspopup="dialog"
        aria-label={`${label} : ${current?.label ?? ''}`}
        disabled={disabled}
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
      >
        <span className={styles.selectorText}>
          <span className={styles.selectorKicker}>{label}</span>
          <span className={styles.selectorValue}>{current?.label ?? label}</span>
        </span>
        <Chevron />
      </button>

      {open && !disabled ? (
        <BottomSheet title={label} onClose={close} closeLabel={closeLabel}>
          {filter ? (
            <label className={styles.filterField}>
              <span>{filter.label}</span>
              <input
                type="search"
                value={query}
                placeholder={filter.placeholder}
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          ) : null}
          {visible.length === 0 && filter ? <p className={styles.filterEmpty}>{filter.empty}</p> : null}
          <div className={styles.sheetList}>
            {visible.map((option) => {
              const isActive = option.value === value;
              return (
                <button
                  key={option.value || 'all'}
                  type="button"
                  className={
                    isActive ? `${styles.sheetOption} ${styles.sheetOptionActive}` : styles.sheetOption
                  }
                  aria-pressed={isActive}
                  onClick={() => {
                    close();
                    if (!isActive) onChange(option.value);
                  }}
                >
                  <span className={styles.optionLabel}>{option.label}</span>
                </button>
              );
            })}
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}

interface AdminMultiSelectProps<Value extends string> {
  label: string;
  options: AdminFilterOption<Value>[];
  values: readonly Value[];
  /** Called once with the whole new selection when it is confirmed. */
  onChange: (values: Value[]) => void;
  closeLabel: string;
  confirmLabel: string;
  /** Shown in the trigger when nothing is selected. */
  emptyLabel: string;
  disabled?: boolean;
}

/** Several-choice counterpart of AdminFilterSelect: same trigger and option
 * sheet, options toggle in place, and the confirm button applies the whole
 * selection at once (closing without confirming changes nothing). */
export function AdminMultiSelect<Value extends string>({
  label,
  options,
  values,
  onChange,
  closeLabel,
  confirmLabel,
  emptyLabel,
  disabled = false,
}: AdminMultiSelectProps<Value>) {
  const [draft, setDraft] = useState<Value[] | null>(null);
  const summary =
    options
      .filter((option) => values.includes(option.value))
      .map((option) => option.label)
      .join(', ') || emptyLabel;

  function toggle(value: Value) {
    setDraft((current) => {
      const selected = current ?? [];
      const next = selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value];
      return options.map((option) => option.value).filter((entry) => next.includes(entry));
    });
  }

  return (
    <>
      <button
        type="button"
        className={styles.selector}
        aria-haspopup="dialog"
        aria-label={`${label} : ${summary}`}
        disabled={disabled}
        onClick={() => setDraft([...values])}
      >
        <span className={styles.selectorText}>
          <span className={styles.selectorKicker}>{label}</span>
          <span className={styles.selectorValue}>{summary}</span>
        </span>
        <Chevron />
      </button>

      {draft && !disabled ? (
        <BottomSheet
          title={label}
          onClose={() => setDraft(null)}
          closeLabel={closeLabel}
          footer={
            <div className={styles.sheetFooter}>
              <Button
                type="button"
                onClick={() => {
                  const next = draft;
                  setDraft(null);
                  onChange(next);
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          }
        >
          <div className={styles.sheetList}>
            {options.map((option) => {
              const isActive = draft.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={
                    isActive ? `${styles.sheetOption} ${styles.sheetOptionActive}` : styles.sheetOption
                  }
                  aria-pressed={isActive}
                  onClick={() => toggle(option.value)}
                >
                  <span className={styles.optionLabel}>{option.label}</span>
                </button>
              );
            })}
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}
