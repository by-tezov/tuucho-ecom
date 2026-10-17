import { useState, type ReactNode } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import styles from './AdminStatusTabs.module.css';

export interface AdminStatusTab<Value extends string> {
  value: Value;
  label: string;
  /** Live count for this status, or null when the server has none to offer
   * (no badge rather than a fabricated number). */
  count?: number | null | undefined;
  /** Exceptions (payment review, return review): the badge uses the danger
   * tone so the option cannot blend in with the ordinary fulfilment queues. */
  urgent?: boolean | undefined;
}

interface AdminStatusTabsProps<Value extends string> {
  label: string;
  tabs: AdminStatusTab<Value>[];
  active: Value | '';
  onSelect: (value: Value) => void;
  closeLabel: string;
  /** The filtered list. On desktop it sits left of the status menu. */
  children: ReactNode;
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

function Count({ tab }: { tab: AdminStatusTab<string> }) {
  const count = tab.count ?? 0;
  if (count <= 0) return null;
  return <span className={tab.urgent ? `${styles.count} ${styles.countUrgent}` : styles.count}>{count}</span>;
}

/** Status filter of the admin master-detail pages (orders, product requests,
 * conversations, contacts).
 *
 * Mobile: one selector showing the current status; a tap opens the status
 * choice in a bottom sheet (same option style as the other admin sheets).
 * Desktop: the statuses are a menu block on the right of the list, one
 * option per line, always visible. */
export function AdminStatusTabs<Value extends string>({
  label,
  tabs,
  active,
  onSelect,
  closeLabel,
  children,
}: AdminStatusTabsProps<Value>) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const current = tabs.find((tab) => tab.value === active);

  function renderOption(
    tab: AdminStatusTab<Value>,
    className: string,
    activeClassName: string,
    close: boolean,
  ) {
    const isActive = tab.value === active;
    return (
      <button
        key={tab.value}
        type="button"
        className={isActive ? `${className} ${activeClassName}` : className}
        aria-pressed={isActive}
        onClick={() => {
          if (close) setSheetOpen(false);
          if (!isActive) onSelect(tab.value);
        }}
      >
        <span className={styles.optionLabel}>{tab.label}</span>
        <Count tab={tab} />
      </button>
    );
  }

  return (
    <div className={styles.layout}>
      <button
        type="button"
        className={styles.selector}
        aria-haspopup="dialog"
        aria-label={`${label} : ${current?.label ?? ''}`}
        onClick={() => setSheetOpen(true)}
      >
        <span className={styles.selectorText}>
          <span className={styles.selectorKicker}>{label}</span>
          <span className={styles.selectorValue}>{current?.label ?? label}</span>
        </span>
        {current && <Count tab={current} />}
        <Chevron />
      </button>

      <div className={styles.main}>{children}</div>

      <nav className={styles.menu} aria-label={label}>
        <div className={styles.menuTitle}>{label}</div>
        {tabs.map((tab) => renderOption(tab, styles.menuOption ?? '', styles.menuOptionActive ?? '', false))}
      </nav>

      {sheetOpen && (
        <BottomSheet title={label} onClose={() => setSheetOpen(false)} closeLabel={closeLabel}>
          <div className={styles.sheetList}>
            {tabs.map((tab) =>
              renderOption(tab, styles.sheetOption ?? '', styles.sheetOptionActive ?? '', true),
            )}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
