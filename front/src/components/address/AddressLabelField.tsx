import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Strings } from '../../assets/i18n/types';
import { FIELD_ADDRESS_LABEL_MAX } from '../../utils/fieldLimits';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import authFormStyles from '../auth/AuthForm.module.css';
import styles from './AddressFormModal.module.css';

interface AddressLabelFieldProps {
  strings: Strings['address'];
  value: string;
  onChange: (value: string) => void;
}

/** A controlled address-name combobox. It keeps all listbox keyboard and
 * outside-interaction behavior with the field instead of coupling it to the
 * modal's delivery/address submission state. */
export function AddressLabelField({ strings, value, onChange }: AddressLabelFieldProps) {
  const fieldId = useId();
  const listId = `${fieldId}-suggestions`;
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = useMemo(() => {
    const query = normalizeForMatch(value);
    if (!query) return strings.labelSuggestions;
    const matches = strings.labelSuggestions.filter((suggestion) =>
      normalizeForMatch(suggestion).includes(query),
    );
    return matches.length === 1 && normalizeForMatch(matches[0] ?? '') === query
      ? strings.labelSuggestions
      : matches;
  }, [strings.labelSuggestions, value]);

  function closeList() {
    setListOpen(false);
    setActiveIndex(-1);
  }

  function pickSuggestion(suggestion: string) {
    onChange(suggestion);
    closeList();
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      event.preventDefault();
      if (!listOpen) {
        setListOpen(true);
        setActiveIndex(event.key === 'ArrowDown' ? 0 : suggestions.length - 1);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(
        (current) => (((current + step) % suggestions.length) + suggestions.length) % suggestions.length,
      );
      return;
    }
    if (event.key === 'Enter' && listOpen) {
      const active = suggestions[activeIndex];
      if (active) {
        event.preventDefault();
        pickSuggestion(active);
      } else {
        closeList();
      }
    }
  }

  useEffect(() => {
    if (activeIndex < 0) return;
    const options = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    options?.[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    if (!listOpen) return;
    function onKeyDownCapture(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeList();
      inputRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (fieldRef.current?.contains(event.target as Node)) return;
      closeList();
    }
    document.addEventListener('keydown', onKeyDownCapture, true);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDownCapture, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [listOpen]);

  return (
    <div ref={fieldRef} className={`${authFormStyles.field} ${styles.field} ${styles.labelField}`}>
      <label className={authFormStyles.label} htmlFor={fieldId}>
        {strings.labelField}
      </label>
      <div className={styles.labelCombo}>
        <input
          ref={inputRef}
          id={fieldId}
          className={`${authFormStyles.input} ${styles.labelComboInput}`}
          name="address-label"
          data-testid="address-label"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          aria-activedescendant={listOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-describedby={`${fieldId}-hint`}
          maxLength={FIELD_ADDRESS_LABEL_MAX}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setListOpen(true);
            setActiveIndex(-1);
          }}
          onClick={() => setListOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            if (!fieldRef.current?.contains(event.relatedTarget)) closeList();
          }}
        />
        <button
          type="button"
          className={styles.labelComboToggle}
          tabIndex={-1}
          aria-label={strings.labelSuggestionsToggle}
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          onMouseDown={suppressMouseFocus}
          onClick={() => {
            if (listOpen) closeList();
            else setListOpen(true);
            inputRef.current?.focus();
          }}
        >
          <svg
            className={listOpen ? styles.labelComboChevronOpen : undefined}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2.5 4.5L6 8L9.5 4.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {listOpen && suggestions.length > 0 && (
          <ul
            ref={listRef}
            id={listId}
            className={styles.labelComboList}
            role="listbox"
            aria-label={strings.labelField}
            data-testid="address-label-suggestions"
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={normalizeForMatch(suggestion) === normalizeForMatch(value)}
                  tabIndex={-1}
                  className={
                    index === activeIndex
                      ? `${styles.labelComboOption} ${styles.labelComboOptionActive}`
                      : styles.labelComboOption
                  }
                  data-testid="address-label-suggestion"
                  onMouseDown={suppressMouseFocus}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pickSuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p id={`${fieldId}-hint`} className={authFormStyles.hint}>
        {strings.labelHint}
      </p>
    </div>
  );
}

function normalizeForMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
