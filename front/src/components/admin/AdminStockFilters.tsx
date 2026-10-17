import { ToggleSwitch } from '../ui/ToggleSwitch';
import type { AdminStockListFilters } from '../../api/admin/catalog';
import styles from './AdminStockList.module.css';

/** The stock lists' two switches, shown under the search field.
 *
 * Both are off by default, so the list starts as the whole catalogue and each
 * switch narrows it. They are sent to the API, not applied to the rows already
 * received — see `AdminStockListFilters` for why.
 */
export function AdminStockFilters({
  filters,
  onChange,
  disabled,
  hiddenLabel,
  stockLabel,
}: {
  filters: AdminStockListFilters;
  onChange: (next: AdminStockListFilters) => void;
  disabled: boolean;
  hiddenLabel: string;
  stockLabel: string;
}) {
  return (
    <div className={styles.listFilters}>
      <label className={styles.listFilter}>
        <span>{hiddenLabel}</span>
        <ToggleSwitch
          checked={filters.hidden === 'visible'}
          onChange={(checked) => onChange({ ...filters, hidden: checked ? 'visible' : 'all' })}
          disabled={disabled}
          aria-label={hiddenLabel}
        />
      </label>
      <label className={styles.listFilter}>
        <span>{stockLabel}</span>
        <ToggleSwitch
          checked={filters.stock === 'in'}
          onChange={(checked) => onChange({ ...filters, stock: checked ? 'in' : 'all' })}
          disabled={disabled}
          aria-label={stockLabel}
        />
      </label>
    </div>
  );
}

export const DEFAULT_STOCK_FILTERS: AdminStockListFilters = { hidden: 'all', stock: 'all' };
