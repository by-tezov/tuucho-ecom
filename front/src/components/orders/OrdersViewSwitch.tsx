import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { SegmentedSwitch } from '../ui/SegmentedSwitch';
import styles from './OrdersViewSwitch.module.css';

const ACTIVE_PATH = '/orders';
const HISTORY_PATH = '/orders/history';

/** Which half was showing before this mount. Module scope on purpose: the
 * two pages are separate routes, so every switch between them destroys
 * this component — nothing inside it can survive to say where the fill
 * should slide from. Undefined on a cold arrival (deep link, refresh),
 * which correctly means "no slide, just be there". */
let lastActivePath: string | undefined;

/** Mobile-only switch between /orders and /orders/history — replaces
 * what AccountShell's own mobile tab strip used to do for these two pages
 * specifically (that strip is gone now, see AccountShell.module.css).
 * Desktop still has AccountShell's sidebar for this, so this renders
 * nothing there.
 *
 * Same pill as the gallery's in-stock/sold-out switch (SegmentedSwitch):
 * both are "two views of one list", and they used to look like two
 * unrelated controls. The two halves are routes, but they navigate from a
 * button rather than an <a href>: these read as a switch, not as a link,
 * and a link's touch long-press callout has no place in a mobile-first UI
 * (see reset.css). Both pages sit behind the account gate, so there was no
 * crawlable href to give up. */
export function OrdersViewSwitch() {
  const { t } = useLang();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeKey = pathname === HISTORY_PATH ? HISTORY_PATH : ACTIVE_PATH;
  // Read once per mount, before the effect below moves it on — otherwise
  // this would always equal activeKey and never animate.
  const enterFromKey = useRef(lastActivePath).current;

  useEffect(() => {
    lastActivePath = activeKey;
  }, [activeKey]);

  return (
    <div className={styles.wrap}>
      <SegmentedSwitch
        ariaLabel={t.ordersPage.switchAria}
        activeKey={activeKey}
        {...(enterFromKey ? { enterFromKey } : {})}
        // Push, not replace — same history behaviour the links had, so Back
        // still steps between the two views.
        onSelect={(key) => {
          if (key !== activeKey) navigate(key);
        }}
        options={[
          {
            key: ACTIVE_PATH,
            label: t.ordersPage.switchActive,
            'data-testid': 'orders-view-switch-active',
          },
          {
            key: HISTORY_PATH,
            label: t.ordersPage.switchHistory,
            'data-testid': 'orders-view-switch-history',
          },
        ]}
      />
    </div>
  );
}
