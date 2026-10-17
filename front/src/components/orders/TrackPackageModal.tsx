import { CloseIcon } from '../ui/CloseIcon';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useAuthSession } from '../../state/AuthContext';
import * as authApi from '../../api/orders';
import { ApiError } from '../../api/errors';
import { type Order, type OrderTracking } from '../../api/orders';
import { isBackendUnavailableError } from '../../api/http';
import type { Strings } from '../../assets/i18n/types';
import styles from './TrackPackageModal.module.css';
import { ModalBackdrop } from '../ui/ModalBackdrop';

interface TrackPackageModalProps {
  order: Order;
  t: Strings;
  lang: string;
  onClose: () => void;
}

type TrackingState =
  | { status: 'loading' }
  | { status: 'error' }
  /** No carrier shipment was ever created for this order (e.g. ops used
   * `--skip-shipment-label`) — distinct from 'error' because "try again
   * later" would be misleading here: there is nothing to retry. */
  | { status: 'not-shipped' }
  | { status: 'ready'; tracking: OrderTracking };

function formatEventDate(dateTime: string | null, lang: string): string {
  if (!dateTime) return '';
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) return dateTime;
  return new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

/** Deliberately carrier-agnostic — the only carrier-identifying text shown
 * is the order's own courierName/courierCode, never a literal "Mondial
 * Relay" string, since courier codes/providers are configurable data (see
 * shippingTracking.service.ts's resolveTrackingProvider on the backend
 * following the same rule). Same portal/lock-scroll/dialog shell as
 * AddressFormModal/ConfirmModal. */
export function TrackPackageModal({ order, t, lang, onClose }: TrackPackageModalProps) {
  useLockBodyScroll();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const requestClose = useHistoryBackClose(onClose);
  useFocusTrap(panelRef, { onEscape: requestClose });
  const { authedRequest } = useAuthSession();
  const [state, setState] = useState<TrackingState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    authedRequest((token) => authApi.getOrderTracking(token, order.id))
      .then((res) => {
        if (!cancelled) setState({ status: 'ready', tracking: res.tracking });
      })
      .catch((err) => {
        if (cancelled) return;
        if (isBackendUnavailableError(err)) return;
        setState({
          status: err instanceof ApiError && err.code === 'shipment_not_found' ? 'not-shipped' : 'error',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [authedRequest, order.id]);

  return createPortal(
    <ModalBackdrop
      className={styles.backdrop ?? ''}
      label={t.ordersPage.trackPackageTitle}
      onClose={requestClose}
    >
      <div ref={panelRef} className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>{t.ordersPage.trackPackageTitle}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label={t.ordersPage.trackPackageCloseAria}
          >
            <CloseIcon />
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.courierLine}>{order.courierName ?? order.courierCode}</p>

          {state.status === 'loading' && <p className={styles.message}>{t.ordersPage.trackPackageLoading}</p>}

          {state.status === 'error' && (
            <p className={styles.message}>{t.ordersPage.trackPackageUnavailable}</p>
          )}

          {state.status === 'not-shipped' && (
            <p className={styles.message}>{t.ordersPage.trackPackageNotShipped}</p>
          )}

          {state.status === 'ready' && (
            <>
              <p className={styles.shipmentNumber}>
                {t.ordersPage.trackPackageShipmentNumberLabel} {state.tracking.shipmentNumber}
              </p>
              {state.tracking.events.length === 0 ? (
                <p className={styles.message}>{t.ordersPage.trackPackageNoEvents}</p>
              ) : (
                <ol className={styles.timeline}>
                  {state.tracking.events.map((event, index) => (
                    <li key={index} className={styles.timelineItem}>
                      <span className={styles.timelineLabel}>{event.label}</span>
                      {(event.dateTime || event.location) && (
                        <span className={styles.timelineMeta}>
                          {[formatEventDate(event.dateTime, lang), event.location]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {state.tracking.externalUrl && (
                <a
                  className={styles.externalLink}
                  href={state.tracking.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.ordersPage.trackPackageExternalLinkLabel}
                  {/* Same new-window hint as the shop platform links. */}
                  <span className="visuallyHidden"> ({t.newWindowAria})</span>
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
