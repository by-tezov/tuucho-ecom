import { useRef, useState } from 'react';
import * as authApi from '../../api/orders';
import { ApiError } from '../../api/errors';
import { type GuestOrderCandidate } from '../../api/orders';
import { useAuthSession } from '../../state/AuthContext';
import { useLang } from '../../assets/i18n';
import { formatPrice } from '../../utils/formatPrice';
import { ConfirmModal } from '../ui/ConfirmModal';
import { LoadingModal } from '../ui/LoadingModal';
import styles from './GuestOrderClaims.module.css';

const ACTIVE_STATUSES = new Set([
  'confirmed',
  'in_preparation',
  'to_send',
  'sent',
  'disponible',
  'need_review',
  'return_review',
]);
const CODE_GROUP_COUNT = 4;
const CODE_GROUP_LENGTH = 4;

function blankCodeGroups(): string[] {
  return Array.from({ length: CODE_GROUP_COUNT }, () => '');
}

function normalizeCodeGroup(value: string): string {
  return value
    .replace(/[^a-fA-F0-9]/g, '')
    .slice(0, CODE_GROUP_LENGTH)
    .toUpperCase();
}

export function GuestOrderClaims({
  scope,
  orders,
  onClaimed,
  onRemoved,
}: {
  scope: 'active' | 'history';
  orders: GuestOrderCandidate[];
  onClaimed: () => void;
  onRemoved: (orderId: string) => void;
}) {
  const { t } = useLang();
  const { authedRequest } = useAuthSession();
  const inputRefs = useRef<Record<string, Array<HTMLInputElement | null>>>({});
  const [codes, setCodes] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<Record<string, string>>({});
  const [pendingDismiss, setPendingDismiss] = useState<GuestOrderCandidate | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);

  const scopedOrders = orders.filter((order) => ACTIVE_STATUSES.has(order.status) === (scope === 'active'));

  function updateCode(orderId: string, index: number, value: string) {
    const normalized = normalizeCodeGroup(value);
    setCodes((current) => {
      const next = [...(current[orderId] ?? blankCodeGroups())];
      next[index] = normalized;
      return { ...current, [orderId]: next };
    });
    setError((current) => {
      if (!current[orderId]) return current;
      const { [orderId]: _removed, ...rest } = current;
      return rest;
    });
    if (normalized.length === CODE_GROUP_LENGTH && index < CODE_GROUP_COUNT - 1) {
      inputRefs.current[orderId]?.[index + 1]?.focus();
    }
  }

  function handleCodeKeyDown(orderId: string, index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !(codes[orderId]?.[index] ?? '') && index > 0) {
      inputRefs.current[orderId]?.[index - 1]?.focus();
    }
  }

  function handleCodePaste(
    orderId: string,
    startIndex: number,
    event: React.ClipboardEvent<HTMLInputElement>,
  ) {
    const characters = event.clipboardData
      .getData('text')
      .replace(/[^a-fA-F0-9]/g, '')
      .toUpperCase();
    if (!characters) return;
    event.preventDefault();
    setCodes((current) => {
      const next = [...(current[orderId] ?? blankCodeGroups())];
      for (let index = startIndex; index < CODE_GROUP_COUNT; index += 1) {
        const offset = (index - startIndex) * CODE_GROUP_LENGTH;
        next[index] = characters.slice(offset, offset + CODE_GROUP_LENGTH);
      }
      return { ...current, [orderId]: next };
    });
    const finalIndex = Math.min(
      startIndex + Math.ceil(characters.length / CODE_GROUP_LENGTH),
      CODE_GROUP_COUNT - 1,
    );
    inputRefs.current[orderId]?.[finalIndex]?.focus();
  }

  async function claim(order: GuestOrderCandidate) {
    if (busyMessage) return;
    const groups = codes[order.id] ?? blankCodeGroups();
    if (groups.some((group) => group.length !== CODE_GROUP_LENGTH)) {
      setError((current) => ({ ...current, [order.id]: t.ordersPage.guestIntegrityInvalid }));
      return;
    }
    setBusyMessage(t.ordersPage.guestClaimLoading);
    try {
      await authedRequest((token) => authApi.claimGuestOrder(token, order.id, groups.join('-')));
      onRemoved(order.id);
      onClaimed();
    } catch (reason) {
      setError((current) => ({
        ...current,
        [order.id]:
          reason instanceof ApiError && reason.code === 'invalid_integrity_token'
            ? t.ordersPage.guestIntegrityInvalid
            : t.ordersPage.guestClaimError,
      }));
    } finally {
      setBusyMessage(null);
    }
  }

  async function dismiss() {
    if (!pendingDismiss || busyMessage) return;
    const order = pendingDismiss;
    setPendingDismiss(null);
    setBusyMessage(t.ordersPage.guestDismissLoading);
    try {
      await authedRequest((token) => authApi.dismissGuestOrder(token, order.id));
      onRemoved(order.id);
    } catch {
      setError((current) => ({ ...current, [order.id]: t.ordersPage.guestClaimError }));
    } finally {
      setBusyMessage(null);
    }
  }

  if (scopedOrders.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby={`guest-orders-${scope}-h`}>
      <h2 id={`guest-orders-${scope}-h`}>{t.ordersPage.guestOrdersTitle}</h2>
      <p>{t.ordersPage.guestOrdersDescription}</p>
      <div className={styles.cards}>
        {scopedOrders.map((order) => {
          const groups = codes[order.id] ?? blankCodeGroups();
          const codeComplete = groups.every((group) => group.length === CODE_GROUP_LENGTH);
          return (
            <article key={order.id} className={styles.card}>
              <p>
                <strong>{order.orderNumber}</strong> · {formatPrice(order.total)}
              </p>
              <fieldset className={styles.codeField} disabled={Boolean(busyMessage)}>
                <legend>{t.ordersPage.guestIntegrityLabel}</legend>
                <div className={styles.codeInputs}>
                  {groups.map((group, index) => (
                    <input
                      key={index}
                      ref={(element) => {
                        const refs = inputRefs.current[order.id] ?? (inputRefs.current[order.id] = []);
                        refs[index] = element;
                      }}
                      aria-label={`${t.ordersPage.guestIntegrityLabel} ${index + 1}`}
                      value={group}
                      onChange={(event) => updateCode(order.id, index, event.target.value)}
                      onKeyDown={(event) => handleCodeKeyDown(order.id, index, event)}
                      onPaste={(event) => handleCodePaste(order.id, index, event)}
                      autoComplete="off"
                      inputMode="text"
                      maxLength={CODE_GROUP_LENGTH}
                      pattern="[A-Fa-f0-9]{4}"
                    />
                  ))}
                </div>
              </fieldset>
              {error[order.id] && (
                <p className={styles.error} role="alert">
                  {error[order.id]}
                </p>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={!codeComplete || Boolean(busyMessage)}
                  onClick={() => void claim(order)}
                >
                  {t.ordersPage.guestClaimButton}
                </button>
                <button
                  type="button"
                  className={styles.notMine}
                  disabled={Boolean(busyMessage)}
                  onClick={() => setPendingDismiss(order)}
                >
                  {t.ordersPage.guestNotMine}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {pendingDismiss && (
        <ConfirmModal
          variant="dialog"
          title={t.ordersPage.guestNotMineTitle}
          message={t.ordersPage.guestNotMineMessage}
          confirmLabel={t.ordersPage.guestNotMineConfirm}
          closeLabel={t.gallery.close}
          onConfirm={() => void dismiss()}
          onCancel={() => setPendingDismiss(null)}
          confirmDanger
        />
      )}
      {busyMessage && <LoadingModal message={busyMessage} />}
    </section>
  );
}
