import { useEffect, useState } from 'react';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { LoadingModal } from '../../components/ui/LoadingModal';
import { ApiError } from '../../api/errors';
import {
  dismissAdminOrderReturn,
  getAdminOrderReturnFinancialPreview,
  resolveAdminOrderReturn,
  type AdminOrder,
  type OrderReturnFinancialPreview,
  type OrderReturnRefundMode,
  type ResolveOrderReturnBody,
} from '../../api/admin/orders';
import { useAuthSession } from '../../state/AuthContext';
import { useLang } from '../../assets/i18n';
import { formatPrice } from '../../utils/formatPrice';
import authFormStyles from '../../components/auth/AuthForm.module.css';
import styles from '../AdminOrdersPage.module.css';

function returnStockKey(line: {
  productUid: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
}): string {
  return JSON.stringify([line.productUid, line.shapeKey, line.lengthKey, line.size]);
}

function eurosToCents(value: string): number | null {
  const amount = Number(value.trim().replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function RequiredMark() {
  return (
    <span className={authFormStyles.requiredMark} aria-hidden="true">
      *
    </span>
  );
}

export function ReturnReviewPanel({ order, onCompleted }: { order: AdminOrder; onCompleted: () => void }) {
  const { t, lang } = useLang();
  const { authedRequest } = useAuthSession();
  const review = order.returnReview!;
  const [preview, setPreview] = useState<OrderReturnFinancialPreview | null>(null);
  const [refundMode, setRefundMode] = useState<OrderReturnRefundMode>('courier_deduction');
  const [courierAmount, setCourierAmount] = useState((review.courierDefaultCents ?? 0) / 100 + '');
  const [customRefundAmount, setCustomRefundAmount] = useState('0');
  const [decisionReason, setDecisionReason] = useState('');
  const [courierOverrideReason, setCourierOverrideReason] = useState('');
  const [dismissReason, setDismissReason] = useState('');
  const [stockQuantities, setStockQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      review.stockLines.map((line) => [
        returnStockKey(line),
        line.productAvailable ? String(line.maxRestockUnits ?? 0) : '0',
      ]),
    ),
  );
  const [confirmAction, setConfirmAction] = useState<'resolve' | 'dismiss' | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolveErrors, setShowResolveErrors] = useState(false);
  const [showDismissErrors, setShowDismissErrors] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void authedRequest((accessToken) => getAdminOrderReturnFinancialPreview(accessToken, order.id))
      .then((result) => {
        if (cancelled) return;
        setPreview(result.preview);
        setCourierAmount(String(result.preview.courierDefaultCents / 100));
        setCustomRefundAmount(String(result.preview.remainingRefundableCents / 100));
      })
      .catch(() => {
        if (!cancelled) setError(t.admin.returnReviewPreviewFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authedRequest, order.id, t.admin.returnReviewPreviewFailed]);

  const returnTypeLabel =
    review.returnType === 'unclaimed'
      ? t.admin.returnReviewTypeUnclaimed
      : review.returnType === 'refused'
        ? t.admin.returnReviewTypeRefused
        : t.admin.returnReviewTypeOther;
  const evidence =
    review.carrierEvidence && typeof review.carrierEvidence === 'object'
      ? (review.carrierEvidence as { matchedLabel?: unknown }).matchedLabel
      : null;
  const courierCents = refundMode === 'full' ? 0 : eurosToCents(courierAmount);
  const customCents = refundMode === 'custom' ? eurosToCents(customRefundAmount) : null;
  const earnRetainedCents = preview?.loyaltyEarnRetainedCents ?? 0;
  const proposedRefund = preview
    ? refundMode === 'full'
      ? Math.max(0, preview.remainingRefundableCents - earnRetainedCents)
      : refundMode === 'courier_deduction' && courierCents !== null
        ? Math.max(0, preview.remainingRefundableCents - courierCents - earnRetainedCents)
        : refundMode === 'custom' && customCents !== null
          ? Math.min(customCents, Math.max(0, preview.remainingRefundableCents - earnRetainedCents))
          : 0
    : 0;

  function stockLineInvalid(line: (typeof review.stockLines)[number]): boolean {
    const quantity = Number(stockQuantities[returnStockKey(line)] ?? '0');
    return !(
      Number.isSafeInteger(quantity) &&
      quantity >= 0 &&
      (line.maxRestockUnits === null || quantity <= line.maxRestockUnits) &&
      (line.productAvailable || quantity === 0)
    );
  }

  function errorFor(reason: unknown): string {
    const code = reason instanceof ApiError ? reason.code : null;
    if (code === 'stripe_refund_pending') return t.admin.returnReviewPending;
    if (code === 'refund_amount_invalid') return t.admin.returnReviewRefundInvalid;
    if (code === 'stock_selection_invalid' || code === 'stock_product_missing') {
      return t.admin.returnReviewStockInvalid;
    }
    if (code === 'resolution_conflict') return t.admin.returnReviewResolutionConflict;
    if (code === 'stripe_not_configured') return t.admin.needReviewOrderStripeNotConfigured;
    if (code === 'stripe_action_failed') return t.admin.needReviewOrderStripeActionFailed;
    if (code === 'invalid_status') return t.admin.returnReviewInvalidStatus;
    if (code === 'invalid_request') return t.admin.returnReviewInvalidRequest;
    if (code === 'not_found') return t.admin.returnReviewNotFound;
    return t.admin.actionError;
  }

  function resolutionIssue(): string | null {
    if (!preview) return t.admin.returnReviewPreviewFailed;
    if (refundMode !== 'full' && courierCents === null) return t.admin.returnReviewCourierAmountInvalid;
    if (refundMode === 'custom' && customCents === null) return t.admin.returnReviewCustomAmountInvalid;
    if (
      refundMode !== 'full' &&
      courierCents !== preview.courierDefaultCents &&
      !courierOverrideReason.trim()
    ) {
      return t.admin.returnReviewCourierOverrideRequired;
    }
    if (review.stockLines.some(stockLineInvalid)) return t.admin.returnReviewStockQtyInvalid;
    if (!decisionReason.trim()) return t.admin.returnReviewDecisionRequired;
    return null;
  }

  function requestResolve() {
    const issue = resolutionIssue();
    if (issue) {
      setShowResolveErrors(true);
      setError(issue);
      return;
    }
    setError(null);
    setConfirmAction('resolve');
  }

  function requestDismiss() {
    if (!dismissReason.trim()) {
      setShowDismissErrors(true);
      setError(t.admin.returnReviewDismissRequired);
      return;
    }
    setError(null);
    setConfirmAction('dismiss');
  }

  async function resolveReturn() {
    const issue = resolutionIssue();
    if (issue || courierCents === null) {
      setConfirmAction(null);
      setShowResolveErrors(true);
      setError(issue ?? t.admin.returnReviewCourierAmountInvalid);
      return;
    }
    setConfirmAction(null);
    setActing(true);
    setError(null);
    const body: ResolveOrderReturnBody = {
      refundMode,
      courierRetainedCents: courierCents,
      ...(refundMode === 'custom' && customCents !== null ? { customRefundAmountCents: customCents } : {}),
      decisionReason: decisionReason.trim(),
      ...(courierOverrideReason.trim() ? { courierOverrideReason: courierOverrideReason.trim() } : {}),
      stock: review.stockLines.map((line) => ({
        productUid: line.productUid,
        shapeKey: line.shapeKey,
        lengthKey: line.lengthKey,
        size: line.size,
        quantity: Number(stockQuantities[returnStockKey(line)] ?? '0'),
      })),
      confirmed: true,
    };
    try {
      await authedRequest((accessToken) => resolveAdminOrderReturn(accessToken, order.id, body));
      onCompleted();
    } catch (reason) {
      setError(errorFor(reason));
    } finally {
      setActing(false);
    }
  }

  async function dismissReturn() {
    if (!dismissReason.trim()) {
      setConfirmAction(null);
      setShowDismissErrors(true);
      setError(t.admin.returnReviewDismissRequired);
      return;
    }
    setConfirmAction(null);
    setActing(true);
    setError(null);
    try {
      await authedRequest((accessToken) =>
        dismissAdminOrderReturn(accessToken, order.id, dismissReason.trim()),
      );
      onCompleted();
    } catch (reason) {
      setError(errorFor(reason));
    } finally {
      setActing(false);
    }
  }

  return (
    <section className={styles.returnReview} aria-labelledby="admin-return-review-h">
      <h3 id="admin-return-review-h">{t.admin.returnReviewTitle}</h3>
      <p>
        <strong>{t.admin.returnReviewTypeLabel}:</strong> {returnTypeLabel}
      </p>
      <p>{t.admin.returnReviewSourceCarrier}</p>
      <p>
        <strong>{t.admin.returnReviewDetectedAt}:</strong>{' '}
        {new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(review.detectedAt),
        )}
      </p>
      {typeof evidence === 'string' && <p className={styles.returnEvidence}>{evidence}</p>}
      {review.resolutionState === 'refund_pending' && (
        <p className={styles.error}>{t.admin.returnReviewPending}</p>
      )}

      <fieldset className={styles.returnFieldset} disabled={acting || loading}>
        <legend>{t.admin.returnReviewFinancialTitle}</legend>
        {preview && (
          <dl className={styles.returnMoneySummary}>
            <div>
              <dt>{t.admin.returnReviewTotalPaid}</dt>
              <dd>{formatPrice(preview.totalPaidCents / 100)}</dd>
            </div>
            <div>
              <dt>{t.admin.returnReviewAlreadyRefunded}</dt>
              <dd>{formatPrice(preview.alreadyRefundedCents / 100)}</dd>
            </div>
            <div>
              <dt>{t.admin.returnReviewRemainingRefundable}</dt>
              <dd>{formatPrice(preview.remainingRefundableCents / 100)}</dd>
            </div>
            {preview.loyaltyEarnRetainedCents > 0 && (
              <div>
                <dt>{t.admin.returnReviewLoyaltyEarnRetained}</dt>
                <dd>{formatPrice(preview.loyaltyEarnRetainedCents / 100)}</dd>
              </div>
            )}
          </dl>
        )}
        <label className={styles.returnLabel}>
          <span>
            {t.admin.returnReviewRefundMode}
            <RequiredMark />
          </span>
          <select
            value={refundMode}
            onChange={(event) => setRefundMode(event.target.value as OrderReturnRefundMode)}
          >
            <option value="full">{t.admin.returnReviewRefundFull}</option>
            <option value="courier_deduction">{t.admin.returnReviewRefundCourier}</option>
            <option value="custom">{t.admin.returnReviewRefundCustom}</option>
            <option value="none">{t.admin.returnReviewRefundNone}</option>
          </select>
        </label>
        {refundMode !== 'full' && (
          <label className={styles.returnLabel}>
            <span>
              {t.admin.returnReviewCourierAmount}
              <RequiredMark />
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              aria-invalid={showResolveErrors && courierCents === null}
              aria-describedby={
                showResolveErrors && courierCents === null ? 'return-courier-error' : undefined
              }
              value={courierAmount}
              onChange={(event) => setCourierAmount(event.target.value)}
            />
            {showResolveErrors && courierCents === null && (
              <p id="return-courier-error" className={authFormStyles.fieldError} role="alert">
                {t.admin.returnReviewCourierAmountInvalid}
              </p>
            )}
          </label>
        )}
        {refundMode === 'custom' && (
          <label className={styles.returnLabel}>
            <span>
              {t.admin.returnReviewCustomRefundAmount}
              <RequiredMark />
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              aria-invalid={showResolveErrors && customCents === null}
              aria-describedby={showResolveErrors && customCents === null ? 'return-custom-error' : undefined}
              value={customRefundAmount}
              onChange={(event) => setCustomRefundAmount(event.target.value)}
            />
            {showResolveErrors && customCents === null && (
              <p id="return-custom-error" className={authFormStyles.fieldError} role="alert">
                {t.admin.returnReviewCustomAmountInvalid}
              </p>
            )}
          </label>
        )}
        {preview &&
          courierCents !== null &&
          refundMode !== 'full' &&
          courierCents !== preview.courierDefaultCents && (
            <label className={styles.returnLabel}>
              <span>
                {t.admin.returnReviewCourierOverrideReason}
                <RequiredMark />
              </span>
              <textarea
                aria-invalid={showResolveErrors && !courierOverrideReason.trim()}
                aria-describedby={
                  showResolveErrors && !courierOverrideReason.trim() ? 'return-override-error' : undefined
                }
                value={courierOverrideReason}
                onChange={(event) => setCourierOverrideReason(event.target.value)}
              />
              {showResolveErrors && !courierOverrideReason.trim() && (
                <p id="return-override-error" className={authFormStyles.fieldError} role="alert">
                  {t.admin.returnReviewCourierOverrideRequired}
                </p>
              )}
            </label>
          )}
        <p className={styles.returnProposed}>
          {t.admin.returnReviewCustomRefundAmount}: <strong>{formatPrice(proposedRefund / 100)}</strong>
        </p>
      </fieldset>

      <fieldset className={styles.returnFieldset} disabled={acting}>
        <legend>{t.admin.returnReviewStockTitle}</legend>
        <p>{review.stockLedgerComplete ? t.admin.returnReviewStockExact : t.admin.returnReviewStockLegacy}</p>
        <div className={styles.returnStockList}>
          {review.stockLines.map((line) => {
            const key = returnStockKey(line);
            return (
              <label key={key} className={styles.returnStockLine}>
                <span>
                  <strong>{line.productUid}</strong>
                  {[line.shapeKey, line.lengthKey, line.size].filter(Boolean).join(' · ')}
                  {!line.productAvailable && <small>{t.admin.returnReviewStockUnavailable}</small>}
                </span>
                <span>
                  {t.admin.returnReviewStockUnits}
                  <input
                    type="number"
                    min="0"
                    max={line.maxRestockUnits ?? undefined}
                    step="1"
                    disabled={!line.productAvailable}
                    aria-invalid={showResolveErrors && stockLineInvalid(line)}
                    value={stockQuantities[key] ?? '0'}
                    onChange={(event) =>
                      setStockQuantities((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {showResolveErrors && review.stockLines.some(stockLineInvalid) && (
        <p className={authFormStyles.fieldError} role="alert">
          {t.admin.returnReviewStockQtyInvalid}
        </p>
      )}

      <label className={styles.returnLabel}>
        <span>
          {t.admin.returnReviewDecisionReason}
          <RequiredMark />
        </span>
        <textarea
          aria-invalid={showResolveErrors && !decisionReason.trim()}
          aria-describedby={showResolveErrors && !decisionReason.trim() ? 'return-decision-error' : undefined}
          value={decisionReason}
          onChange={(event) => setDecisionReason(event.target.value)}
        />
        {showResolveErrors && !decisionReason.trim() && (
          <p id="return-decision-error" className={authFormStyles.fieldError} role="alert">
            {t.admin.returnReviewDecisionRequired}
          </p>
        )}
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.returnActions}>
        <button type="button" disabled={acting || loading} onClick={requestResolve}>
          {t.admin.returnReviewResolve}
        </button>
      </div>

      <div className={styles.returnDismiss}>
        <label className={styles.returnLabel}>
          <span>
            {t.admin.returnReviewDismissReason}
            <RequiredMark />
          </span>
          <textarea
            aria-invalid={showDismissErrors && !dismissReason.trim()}
            aria-describedby={showDismissErrors && !dismissReason.trim() ? 'return-dismiss-error' : undefined}
            value={dismissReason}
            onChange={(event) => setDismissReason(event.target.value)}
          />
          {showDismissErrors && !dismissReason.trim() && (
            <p id="return-dismiss-error" className={authFormStyles.fieldError} role="alert">
              {t.admin.returnReviewDismissRequired}
            </p>
          )}
        </label>
        <button type="button" className={styles.ghostAction} disabled={acting} onClick={requestDismiss}>
          {t.admin.returnReviewDismiss}
        </button>
      </div>

      {confirmAction && (
        <ConfirmModal
          variant="dialog"
          title={
            confirmAction === 'resolve' ? t.admin.returnReviewResolveTitle : t.admin.returnReviewDismissTitle
          }
          message={
            confirmAction === 'resolve'
              ? t.admin.returnReviewResolveMessage
              : t.admin.returnReviewDismissMessage
          }
          confirmLabel={
            confirmAction === 'resolve' ? t.admin.returnReviewResolve : t.admin.returnReviewDismiss
          }
          closeLabel={t.gallery.close}
          confirmDanger={confirmAction === 'resolve'}
          onConfirm={() => void (confirmAction === 'resolve' ? resolveReturn() : dismissReturn())}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {(loading || acting) && <LoadingModal message={t.admin.actionLoading} />}
    </section>
  );
}
