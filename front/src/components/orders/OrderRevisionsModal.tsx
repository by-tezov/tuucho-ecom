import { CloseIcon } from '../ui/CloseIcon';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useAuthSession } from '../../state/AuthContext';
import * as authApi from '../../api/orders';
import type {
  Order,
  OrderRevision,
  OrderRevisionBillingSnapshot,
  OrderRevisionShippingSnapshot,
} from '../../api/orders';
import { isBackendUnavailableError } from '../../api/http';
import type { Lang } from '../../assets/i18n';
import type { Strings } from '../../assets/i18n/types';
import { identityName } from '../../utils/customerIdentity';
import styles from './OrderRevisionsModal.module.css';
import { useScrollHint } from '../../hooks/useScrollHint';
import { ModalBackdrop } from '../ui/ModalBackdrop';

interface OrderRevisionsModalProps {
  order: Order;
  t: Strings;
  lang: Lang;
  onClose: () => void;
}

function formatRevisionDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatAddressLines(snap: OrderRevisionBillingSnapshot | OrderRevisionShippingSnapshot): string {
  const name = identityName(snap.recipientName, snap.companyName);
  const line = [snap.line1, snap.line2, `${snap.postalCode} ${snap.city}`, snap.countryCode]
    .filter(Boolean)
    .join(', ');
  return name ? `${name}, ${line}` : line;
}

function kindLabel(kind: OrderRevision['kind'], t: Strings): string {
  switch (kind) {
    case 'billing_address_change':
      return t.ordersPage.revisionsKindBilling;
    case 'shipping_address_change':
      return t.ordersPage.revisionsKindShipping;
  }
}

export function OrderRevisionsModal({ order, t, lang, onClose }: OrderRevisionsModalProps) {
  const { authedRequest } = useAuthSession();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useLockBodyScroll();
  const requestClose = useHistoryBackClose(onClose);
  useFocusTrap(panelRef, { onEscape: requestClose });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revisions, setRevisions] = useState<OrderRevision[]>([]);
  const { scrollHint, updateScrollHint } = useScrollHint(scrollRef);

  useLayoutEffect(() => {
    updateScrollHint();
    const settle = window.setTimeout(updateScrollHint, 260);
    window.addEventListener('resize', updateScrollHint);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('resize', updateScrollHint);
    };
  }, [loading, error, revisions.length, updateScrollHint]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await authedRequest((token) => authApi.listOrderRevisions(token, order.id));
        if (cancelled) return;
        setRevisions([...result.revisions].sort((a, b) => b.revisionNumber - a.revisionNumber));
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (isBackendUnavailableError(err)) {
          setLoading(false);
          return;
        }
        setError(true);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, order.id]);

  return createPortal(
    <ModalBackdrop
      className={styles.backdrop ?? ''}
      label={t.ordersPage.revisionsModalTitle}
      onClose={requestClose}
    >
      <div ref={panelRef} className={styles.dialog}>
        <div className={styles.header}>
          <p className={styles.title}>{t.ordersPage.revisionsModalTitle}</p>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label={t.ordersPage.revisionsModalCloseAria}
          >
            <CloseIcon size={14} />
          </button>
        </div>
        <div ref={scrollRef} className={styles.scrollArea} onScroll={updateScrollHint}>
          {loading && <p className={styles.status}>{t.ordersPage.revisionsLoading}</p>}
          {error && <p className={`${styles.status} ${styles.error}`}>{t.ordersPage.revisionsError}</p>}
          {!loading && !error && revisions.length === 0 && (
            <p className={styles.status}>{t.ordersPage.revisionsEmpty}</p>
          )}

          {!loading && !error && revisions.length > 0 && (
            <ul className={styles.list}>
              {revisions.map((revision) => {
                const billingBefore = revision.diff.billing?.before;
                const shippingBefore = revision.diff.shipping?.before;
                const modeLabel = billingBefore
                  ? billingBefore.sameAsShipping
                    ? t.ordersPage.revisionsSameAsShipping
                    : t.ordersPage.revisionsDistinctBilling
                  : null;
                return (
                  <li key={revision.id} className={styles.item}>
                    <div className={styles.itemHead}>
                      <span className={styles.kind}>
                        {kindLabel(revision.kind, t)} · #{revision.revisionNumber}
                      </span>
                      <span className={styles.date}>{formatRevisionDate(revision.createdAt, lang)}</span>
                    </div>
                    {modeLabel && <p className={styles.change}>{modeLabel}</p>}
                    {billingBefore && !billingBefore.sameAsShipping && (
                      <p className={styles.addressBlock}>{formatAddressLines(billingBefore)}</p>
                    )}
                    {shippingBefore && (
                      <p className={styles.addressBlock}>{formatAddressLines(shippingBefore)}</p>
                    )}
                    {revision.previousIntegrityToken && (
                      <p className={styles.integrity}>
                        <span>
                          {t.ordersPage.revisionsIntegrityLabel.replace(
                            '{n}',
                            String(revision.revisionNumber),
                          )}
                        </span>{' '}
                        <span className={styles.integrityToken}>{revision.previousIntegrityToken}</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {scrollHint.up && (
          <span className={styles.scrollHintUp} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 7.5L6 4L9.5 7.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        {scrollHint.down && (
          <span className={styles.scrollHintDown} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 4.5L6 8L9.5 4.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        {(scrollHint.up || scrollHint.down) && (
          <span
            className={[
              styles.scrollHintBar,
              scrollHint.up && styles.scrollHintBarFromUp,
              scrollHint.down && styles.scrollHintBarToDown,
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden="true"
          />
        )}
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
