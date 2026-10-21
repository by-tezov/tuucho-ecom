import { useEffect, useState } from 'react';
import { useLang } from '../../assets/i18n';
import { CloseIcon } from '../ui/CloseIcon';
import styles from './CartControl.module.css';

export interface DrawerNotice {
  /** `pending`: the add is still in flight, the drawer is locked meanwhile. */
  kind: 'pending' | 'success' | 'error';
  title: string;
}

/** The drawer's banner: loading while the add runs, then green or red.
 * Progress and success are a `status`, a failed add an `alert` (RGAA 7.5).
 * The live region mounts with the drawer, so its text is filled one frame
 * later: most screen readers ignore a live region that arrives already
 * filled. Switching to an error remounts it as a fresh alert. */
export function CartDrawerNotice({ notice }: { notice: DrawerNotice }) {
  const isError = notice.kind === 'error';
  return <CartDrawerNoticeRegion key={isError ? 'alert' : 'status'} notice={notice} />;
}

function CartDrawerNoticeRegion({ notice }: { notice: DrawerNotice }) {
  const { t } = useLang();
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setFilled(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const kindClass =
    notice.kind === 'error'
      ? styles.drawerNoticeError
      : notice.kind === 'pending'
        ? styles.drawerNoticePending
        : '';
  return (
    <p
      className={[styles.drawerNotice, kindClass].filter(Boolean).join(' ')}
      data-testid={`cart-drawer-${notice.kind}`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      {notice.kind === 'pending' ? (
        <span className={styles.drawerNoticeSpinner} aria-hidden="true" />
      ) : notice.kind === 'error' ? (
        <CloseIcon size={14} />
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3 8.5 6.2 11.5 13 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {!filled ? null : notice.kind === 'pending' ? (
        <span>{t.cart.drawerLoading}</span>
      ) : (
        <span>
          <strong>{notice.title}</strong>{' '}
          {notice.kind === 'error' ? t.cart.drawerErrorSuffix : t.cart.drawerAddedSuffix}
        </span>
      )}
    </p>
  );
}
