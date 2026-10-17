import { useCallback, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { LoadingModal } from '../components/ui/LoadingModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Button } from '../components/ui/Button';
import { ApiError } from '../api/errors';
import {
  creditAdminLoyaltyByEmail,
  listAdminLoyaltyManualOps,
  uncreditAdminLoyaltyByEmail,
  type LoyaltyManualOp,
} from '../api/loyalty';
import { useAuthSession } from '../state/AuthContext';
import { useAdminInfiniteList } from '../hooks/useAdminInfiniteList';
import { AdminInfiniteList } from '../components/admin/AdminInfiniteList';
import { useLang } from '../assets/i18n';
import { adminPath } from '../utils/adminRoute';
import { formatPrice } from '../utils/formatPrice';
import { withMinDuration } from '../utils/withMinDuration';
import styles from './AdminLoyaltyPage.module.css';
import { useAdminStrings } from '../assets/i18n/admin';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';
import { NotFoundPage } from './NotFoundPage';

const OPS_CHUNK_SIZE = 20;

function dateTime(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function AdminLoyaltyPage() {
  const loyaltyOn = usePluginEnabled('commerce-loyalty');
  const { t, lang } = useLang();
  const a = useAdminStrings();
  const { authedRequest } = useAuthSession();
  const [adjustFieldErrors, setAdjustFieldErrors] = useState<{
    email?: string;
    amount?: string;
    reason?: string;
  }>({});

  const [opEmail, setOpEmail] = useState('');
  const [opAmount, setOpAmount] = useState('');
  const [opReason, setOpReason] = useState('');
  const [opKind, setOpKind] = useState<'credit' | 'uncredit'>('credit');
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustNotice, setAdjustNotice] = useState<string | null>(null);

  const fetchOps = useCallback(
    async (page: number) => {
      const result = await withMinDuration(
        authedRequest((token) => listAdminLoyaltyManualOps(token, page, OPS_CHUNK_SIZE)),
        page === 1 ? 350 : 0,
      );
      return {
        rows: result.entries,
        page: result.pagination.page,
        totalPages: result.pagination.totalPages,
      };
    },
    [authedRequest],
  );
  const {
    rows: ops,
    hasMore: opsHasMore,
    loading: opsLoading,
    loadingMore: opsLoadingMore,
    loadMore: loadMoreOps,
    reload: reloadOps,
  } = useAdminInfiniteList<LoyaltyManualOp>({
    fetchPage: fetchOps,
    errorMessage: t.admin.actionError,
  });
  const adjustDetailsRef = useRef<HTMLDetailsElement>(null);

  function openAdjustConfirm(event: FormEvent) {
    event.preventDefault();
    setAdjustError(null);
    setAdjustNotice(null);
    const value = Number(opAmount.replace(',', '.'));
    const nextFieldErrors: { email?: string; amount?: string; reason?: string } = {};
    if (!opEmail.trim() || !/^\S+@\S+\.\S+$/.test(opEmail.trim())) {
      nextFieldErrors.email = t.admin.loyaltyFieldEmailInvalid;
    }
    if (!Number.isFinite(value) || value <= 0) {
      nextFieldErrors.amount = t.admin.loyaltyFieldAmountInvalid;
    }
    if (!opReason.trim()) {
      nextFieldErrors.reason = t.admin.loyaltyFieldReasonRequired;
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setAdjustFieldErrors(nextFieldErrors);
      if (adjustDetailsRef.current) adjustDetailsRef.current.open = true;
      return;
    }
    setAdjustFieldErrors({});
    setPendingConfirm(true);
  }

  async function submitAdjust() {
    const value = Number(opAmount);
    const email = opEmail.trim();
    const reason = opReason.trim();
    setAdjusting(true);
    setAdjustError(null);
    setAdjustNotice(null);
    setPendingConfirm(false);
    try {
      await authedRequest((token) =>
        opKind === 'credit'
          ? creditAdminLoyaltyByEmail(token, email, value, reason)
          : uncreditAdminLoyaltyByEmail(token, email, value, reason),
      );
      setAdjustNotice(opKind === 'credit' ? t.admin.loyaltyCreditSuccess : t.admin.loyaltyUncreditSuccess);
      setOpAmount('');
      setOpReason('');
      reloadOps();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'loyalty_insufficient') {
        setAdjustError(t.admin.loyaltyInsufficient);
      } else if (e instanceof ApiError && e.code === 'not_found') {
        setAdjustError(t.admin.loyaltyUserNotFound);
      } else {
        setAdjustError(t.admin.actionError);
      }
    } finally {
      setAdjusting(false);
    }
  }

  const busy = adjusting;

  if (!loyaltyOn) return <NotFoundPage />;

  return (
    <section className={styles.section} aria-labelledby="admin-loyalty-h">
      <Seo
        title={t.admin.loyaltyTitle}
        description={t.admin.loyaltyDescription}
        path={adminPath('/loyalty')}
        noindex
      />
      <h1 id="admin-loyalty-h" className={styles.title}>
        {t.admin.loyaltyTitle}
      </h1>

      <form className={styles.panel} onSubmit={openAdjustConfirm} noValidate>
        <details ref={adjustDetailsRef} className={styles.settingsDetails}>
          <summary className={styles.settingsSummary}>
            <h2 className={styles.panelTitle}>{t.admin.loyaltyAdjustTitle}</h2>
          </summary>
          <div className={styles.settingsBody}>
            <p className={styles.note}>{t.admin.loyaltyAdjustNote}</p>

            <div className={styles.kindRow} role="group" aria-label={t.admin.loyaltyAdjustTitle}>
              <button
                type="button"
                className={opKind === 'credit' ? styles.kindActive : styles.kindButton}
                disabled={busy}
                onClick={() => setOpKind('credit')}
              >
                {t.admin.loyaltyCreditConfirm}
              </button>
              <button
                type="button"
                className={opKind === 'uncredit' ? styles.kindActive : styles.kindButton}
                disabled={busy}
                onClick={() => setOpKind('uncredit')}
              >
                {t.admin.loyaltyUncreditConfirm}
              </button>
            </div>

            <div className={styles.field}>
              <label htmlFor="loyalty-op-email">{t.admin.loyaltyAdjustEmailLabel}</label>
              <input
                id="loyalty-op-email"
                type="email"
                autoComplete="off"
                value={opEmail}
                disabled={busy}
                aria-invalid={adjustFieldErrors.email != null}
                aria-describedby={adjustFieldErrors.email ? 'loyalty-op-email-error' : undefined}
                onChange={(event) => {
                  setOpEmail(event.target.value);
                  if (adjustFieldErrors.email) {
                    setAdjustFieldErrors(({ email: _cleared, ...rest }) => rest);
                  }
                }}
              />
              {adjustFieldErrors.email ? (
                <p id="loyalty-op-email-error" className={styles.fieldError} role="alert">
                  {adjustFieldErrors.email}
                </p>
              ) : null}
            </div>

            <div className={styles.field}>
              <label htmlFor="loyalty-op-amount">{t.admin.loyaltyAmountLabel}</label>
              <input
                id="loyalty-op-amount"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={opAmount}
                disabled={busy}
                aria-invalid={adjustFieldErrors.amount != null}
                aria-describedby={adjustFieldErrors.amount ? 'loyalty-op-amount-error' : undefined}
                onChange={(event) => {
                  setOpAmount(event.target.value);
                  if (adjustFieldErrors.amount) {
                    setAdjustFieldErrors(({ amount: _cleared, ...rest }) => rest);
                  }
                }}
              />
              {adjustFieldErrors.amount ? (
                <p id="loyalty-op-amount-error" className={styles.fieldError} role="alert">
                  {adjustFieldErrors.amount}
                </p>
              ) : null}
            </div>

            <div className={styles.field}>
              <label htmlFor="loyalty-op-reason">{t.admin.loyaltyReasonLabel}</label>
              <textarea
                id="loyalty-op-reason"
                rows={3}
                value={opReason}
                disabled={busy}
                aria-invalid={adjustFieldErrors.reason != null}
                aria-describedby={adjustFieldErrors.reason ? 'loyalty-op-reason-error' : undefined}
                onChange={(event) => {
                  setOpReason(event.target.value);
                  if (adjustFieldErrors.reason) {
                    setAdjustFieldErrors(({ reason: _cleared, ...rest }) => rest);
                  }
                }}
              />
              {adjustFieldErrors.reason ? (
                <p id="loyalty-op-reason-error" className={styles.fieldError} role="alert">
                  {adjustFieldErrors.reason}
                </p>
              ) : null}
            </div>

            {adjustError && (
              <p className={styles.error} role="alert">
                {adjustError}
              </p>
            )}
            {adjustNotice && (
              <p className={styles.notice} role="status">
                {adjustNotice}
              </p>
            )}

            <div className={styles.actions}>
              <Button type="submit" disabled={busy}>
                {opKind === 'credit' ? t.admin.loyaltyCreditConfirm : t.admin.loyaltyUncreditConfirm}
              </Button>
            </div>
          </div>
        </details>
      </form>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>{t.admin.loyaltyOpsHistoryTitle}</h2>
        <p className={styles.note}>{t.admin.loyaltyOpsHistoryNote}</p>
        <p className={styles.note}>
          {a.loyalty.historyAlsoIn} <Link to={adminPath('/activity')}>{a.nav.activityLabel}</Link>.
        </p>

        {ops.length === 0 && !opsLoading ? (
          <p className={styles.empty}>{t.admin.loyaltyOpsHistoryEmpty}</p>
        ) : (
          <AdminInfiniteList
            className={styles.opsList}
            label={t.admin.loyaltyOpsHistoryTitle}
            count={ops.length}
            rowKey={(index) => ops[index]!.id}
            hasMore={opsHasMore}
            loadingMore={opsLoadingMore}
            onLoadMore={loadMoreOps}
            renderRow={(index) => {
              const entry = ops[index]!;
              return (
                <div className={styles.opsRow}>
                  <div className={styles.opsMain}>
                    <strong>
                      {entry.kind === 'credit_manual'
                        ? t.admin.loyaltyLedgerKindCreditManual
                        : t.admin.loyaltyLedgerKindUncreditManual}
                    </strong>
                    <span>{entry.userEmail}</span>
                    {entry.reason && <small>{entry.reason}</small>}
                  </div>
                  <div className={styles.opsMeta}>
                    <em className={entry.amount < 0 ? styles.amountNeg : styles.amountPos}>
                      {entry.amount < 0 ? '−' : '+'}
                      {formatPrice(Math.abs(entry.amount))}
                    </em>
                    <time dateTime={entry.createdAt}>{dateTime(entry.createdAt, lang)}</time>
                    <small>
                      {t.admin.loyaltyOpsActorLabel}: {entry.actorEmail ?? '-'}
                    </small>
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>

      {pendingConfirm && (
        <ConfirmModal
          title={
            opKind === 'credit'
              ? t.admin.loyaltyCreditModalTitle(opEmail.trim())
              : t.admin.loyaltyUncreditModalTitle(opEmail.trim())
          }
          message={`${opAmount} €. ${opReason.trim()}`}
          confirmLabel={opKind === 'credit' ? t.admin.loyaltyCreditConfirm : t.admin.loyaltyUncreditConfirm}
          closeLabel={t.gallery.close}
          onConfirm={() => void submitAdjust()}
          onCancel={() => setPendingConfirm(false)}
        />
      )}

      {busy && <LoadingModal message={adjusting ? t.admin.actionLoading : t.admin.contentLoading} />}
      {opsLoading && !busy && <LoadingModal message={t.admin.contentLoading} />}
    </section>
  );
}
