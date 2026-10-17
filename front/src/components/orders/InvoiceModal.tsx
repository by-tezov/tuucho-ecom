import { CloseIcon } from '../ui/CloseIcon';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../../assets/i18n';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useAuthSession } from '../../state/AuthContext';
import { announce } from '../../state/liveAnnouncer';
import * as authApi from '../../api/orders';
import { ApiError } from '../../api/errors';
import { type Order } from '../../api/orders';
import { isBackendUnavailableError } from '../../api/http';
import type { Strings } from '../../assets/i18n/types';
import { formatPrice } from '../../utils/formatPrice';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import styles from './InvoiceModal.module.css';

interface InvoiceModalProps {
  order: Order;
  t: Strings;
  onClose: () => void;
}

type ActionError = { action: 'download' | 'email'; rateLimited: boolean };

function formatOrderDate(confirmedAt: string, lang: ReturnType<typeof useLang>['lang']): string {
  return new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(confirmedAt));
}

/** The "Ma Facture" button's modal — two independent choices, each hitting
 * its own backend route (see account.routes.ts). Both show a blocking loading
 * overlay, then the success message in place of the choices until the
 * customer closes the dialog: a timed auto-close would fail RGAA 13.1.
 * Always a centered dialog, never a bottom sheet. */
export function InvoiceModal({ order, t, onClose }: InvoiceModalProps) {
  useLockBodyScroll();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { lang } = useLang();
  const { authedRequest } = useAuthSession();
  const [busy, setBusy] = useState<'download' | 'email' | null>(null);
  const [succeeded, setSucceeded] = useState<'download' | 'email' | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const requestClose = useHistoryBackClose(onClose);
  useFocusTrap(panelRef, {
    onEscape: busy ? undefined : requestClose,
    enabled: !busy,
  });

  function succeed(action: 'download' | 'email') {
    setSucceeded(action);
    announce(action === 'download' ? t.ordersPage.invoiceDownloaded : t.ordersPage.invoiceEmailSent);
  }

  async function handleDownload() {
    setBusy('download');
    setError(null);
    try {
      await authedRequest((token) => authApi.downloadInvoice(token, order.id));
      setBusy(null);
      succeed('download');
    } catch (err) {
      if (isBackendUnavailableError(err)) {
        setBusy(null);
        return;
      }
      setError({
        action: 'download',
        rateLimited: err instanceof ApiError && err.code === 'resend_limit_exceeded',
      });
      setBusy(null);
    }
  }

  async function handleEmail() {
    setBusy('email');
    setError(null);
    try {
      await authedRequest((token) => authApi.emailInvoice(token, order.id));
      succeed('email');
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      setError({
        action: 'email',
        rateLimited: err instanceof ApiError && err.code === 'resend_limit_exceeded',
      });
    } finally {
      setBusy(null);
    }
  }

  if (busy) {
    return (
      <LoadingModal
        message={busy === 'download' ? t.ordersPage.invoiceDownloadLoading : t.ordersPage.invoiceEmailLoading}
      />
    );
  }

  return createPortal(
    <ModalBackdrop
      className={styles.backdrop ?? ''}
      label={t.ordersPage.invoiceModalTitle}
      onClose={requestClose}
    >
      <div ref={panelRef} className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>{t.ordersPage.invoiceModalTitle}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label={t.ordersPage.invoiceModalCloseAria}
          >
            <CloseIcon />
          </button>
        </div>

        <div className={styles.body}>
          {succeeded ? (
            <p className={styles.success} data-testid="invoice-success">
              {succeeded === 'download' ? t.ordersPage.invoiceDownloaded : t.ordersPage.invoiceEmailSent}
            </p>
          ) : (
            <>
              <div className={styles.orderMeta}>
                <p className={styles.orderNumber}>{order.orderNumber}</p>
                <p className={styles.metaRow}>
                  <span className={styles.metaLabel}>{t.ordersPage.orderDateLabel}</span>
                  <span>{formatOrderDate(order.confirmedAt, lang)}</span>
                </p>
                <p className={styles.totalRow}>
                  <span className={styles.metaLabel}>{t.ordersPage.totalLabel}</span>
                  <span className={styles.totalAmount}>{formatPrice(order.total)}</span>
                </p>
              </div>
              <div className={styles.actions}>
                <Button type="button" disabled={busy !== null} onClick={handleDownload}>
                  {t.ordersPage.invoiceDownloadButton}
                </Button>
                <Button variant="ghost" type="button" disabled={busy !== null} onClick={handleEmail}>
                  {t.ordersPage.invoiceEmailButton}
                </Button>
              </div>
              {error && (
                <p className={styles.message} role="alert">
                  {error.rateLimited
                    ? error.action === 'download'
                      ? t.ordersPage.invoiceRateLimitedDownload
                      : t.ordersPage.invoiceRateLimitedEmail
                    : t.auth.errorGeneric}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
