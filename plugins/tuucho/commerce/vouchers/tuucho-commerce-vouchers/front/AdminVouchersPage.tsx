import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Seo } from '@kernel/front/components/seo/Seo';
import { LoadingModal } from '@kernel/front/components/ui/LoadingModal';
import { BottomSheet } from '@kernel/front/components/ui/BottomSheet';
import { ConfirmModal } from '@kernel/front/components/ui/ConfirmModal';
import { ToggleSwitch } from '@kernel/front/components/ui/ToggleSwitch';
import { Chip } from '@kernel/front/components/ui/Chip';
import { Button } from '@kernel/front/components/ui/Button';
import { CloseIcon } from '@kernel/front/components/ui/CloseIcon';
import { ModalBackdrop } from '@kernel/front/components/ui/ModalBackdrop';
import { ModalScrollBody } from '@kernel/front/components/ui/ModalScrollBody';
import { ApiError } from '@kernel/front/api/errors';
import {
  createAdminVoucher,
  deleteAdminVoucher,
  getAdminVouchers,
  setAdminVoucherEnabled,
  type AdminVoucher,
  type AdminVoucherOfferType,
} from '@kernel/front/api/admin/commerce';
import { useAuthSession } from '@kernel/front/state/AuthContext';
import { useLang } from '@kernel/front/assets/i18n';
import { useAdminStrings, type AdminUiStrings } from '@kernel/front/assets/i18n/admin';
import { adminPath } from '@kernel/front/utils/adminRoute';
import { formatPrice } from '@kernel/front/utils/formatPrice';
import { withMinDuration } from '@kernel/front/utils/withMinDuration';
import { useFocusTrap } from '@kernel/front/hooks/useFocusTrap';
import { useHistoryBackClose } from '@kernel/front/hooks/useHistoryBackClose';
import { useLockBodyScroll } from '@kernel/front/hooks/useLockBodyScroll';
import styles from './AdminVouchersPage.module.css';
import { shopConfig } from '@kernel/front/config/env';
import { usePluginEnabled } from '@kernel/front/plugins/StorefrontBootstrap';
import { NotFoundPage } from '@kernel/front/routes/NotFoundPage';

const OFFER_TYPES: AdminVoucherOfferType[] = [
  'percent',
  'amount',
  'free_shipping',
  'free_item',
  'free_item_nth',
];

type EnabledFilter = 'all' | 'active' | 'inactive';

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function offerTypeLabel(type: string, a: AdminUiStrings): string {
  switch (type) {
    case 'percent':
      return a.vouchers.typePercent;
    case 'amount':
      return a.vouchers.typeAmount;
    case 'free_shipping':
      return a.vouchers.typeFreeShipping;
    case 'free_item':
      return a.vouchers.typeFreeItem;
    case 'free_item_nth':
      return a.vouchers.typeFreeItemNth;
    default:
      return type;
  }
}

function valueFieldMeta(
  offerType: AdminVoucherOfferType,
  a: AdminUiStrings,
): { label: string; step?: string; min: string } | null {
  switch (offerType) {
    case 'percent':
      return { label: a.vouchers.valuePercent, min: '0.01', step: '0.01' };
    case 'amount':
      return { label: a.vouchers.valueAmount, min: '0.01', step: '0.01' };
    case 'free_item':
      return { label: a.vouchers.valueMaxItemPrice, min: '0.01', step: '0.01' };
    case 'free_item_nth':
      return { label: a.vouchers.valueNth, min: '1', step: '1' };
    case 'free_shipping':
      return null;
  }
}

function formatOffer(offer: AdminVoucher['offer'], a: AdminUiStrings): string {
  switch (offer.type) {
    case 'percent':
      return offer.percent != null ? `−${offer.percent} %` : offerTypeLabel(offer.type, a);
    case 'amount':
      return offer.amount != null ? `−${formatPrice(offer.amount)}` : offerTypeLabel(offer.type, a);
    case 'free_shipping':
      return a.vouchers.typeFreeShipping;
    case 'free_item':
      return offer.maxItemPrice != null
        ? a.vouchers.offerItemUpTo(formatPrice(offer.maxItemPrice))
        : offerTypeLabel(offer.type, a);
    case 'free_item_nth':
      return offer.requiredItemQuantity != null
        ? a.vouchers.offerNthItem(offer.requiredItemQuantity)
        : offerTypeLabel(offer.type, a);
    default:
      return offerTypeLabel(offer.type, a);
  }
}

function formatDateRange(startsAt: string, endsAt: string): string {
  return `${startsAt} → ${endsAt}`;
}

function formatRedemptionDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(value: string, a: AdminUiStrings): { emails: string[] } | { error: string } {
  const tokens = value
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const email = token.toLowerCase();
    if (!EMAIL_RE.test(email)) return { error: a.vouchers.errEmails };
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return { emails };
}

function createErrorMessage(error: unknown, a: AdminUiStrings): string {
  if (error instanceof ApiError) {
    if (error.code === 'already_exists') return a.vouchers.errCodeExists;
    if (error.code === 'not_found') return a.vouchers.errNoAccount;
    if (error.code === 'invalid_request') return a.vouchers.errCheckFields;
  }
  return a.vouchers.errCreate;
}

export function AdminVouchersPage() {
  const vouchersOn = usePluginEnabled('tuucho-commerce-vouchers');
  const { t, lang } = useLang();
  const a = useAdminStrings();
  const { authedRequest } = useAuthSession();
  const [vouchers, setVouchers] = useState<AdminVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [togglingCode, setTogglingCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminVoucher | null>(null);

  const [code, setCode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [start, setStart] = useState(todayIsoDate);
  const [end, setEnd] = useState('');
  const [offerType, setOfferType] = useState<AdminVoucherOfferType>('percent');
  const [value, setValue] = useState('10');
  const [maxUsesPerUser, setMaxUsesPerUser] = useState('1');
  const [minSubtotal, setMinSubtotal] = useState('');
  const [emails, setEmails] = useState('');

  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>('all');
  const [search, setSearch] = useState('');
  const busy = loading || creating || togglingCode !== null || deletingCode !== null;
  const loadingMessage =
    creating || togglingCode !== null || deletingCode !== null
      ? t.admin.actionLoading
      : t.admin.contentLoading;

  const valueMeta = valueFieldMeta(offerType, a);

  const load = useCallback(async () => {
    if (!vouchersOn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => getAdminVouchers(token)),
        shopConfig.loadingMinMs.short,
      );
      setVouchers(result.vouchers);
    } catch {
      setError(a.vouchers.loadError);
    } finally {
      setLoading(false);
    }
  }, [authedRequest, a.vouchers.loadError, vouchersOn]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return vouchers.filter((voucher) => {
      if (enabledFilter === 'active' && !voucher.enabled) return false;
      if (enabledFilter === 'inactive' && voucher.enabled) return false;
      if (
        query &&
        !voucher.code.toLowerCase().includes(query) &&
        !(voucher.allowedEmails ?? []).some((email) => email.toLowerCase().includes(query))
      ) {
        return false;
      }
      return true;
    });
  }, [vouchers, enabledFilter, search]);
  const detailVoucher = detailCode ? (vouchers.find((voucher) => voucher.code === detailCode) ?? null) : null;

  function validateCreate(): string | null {
    const qty = Number(quantity);
    if (!Number.isSafeInteger(qty) || qty <= 0) return a.vouchers.errQuantity;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return a.vouchers.errDates;
    }
    if (start > end) return a.vouchers.errDateOrder;
    const perUser = Number(maxUsesPerUser);
    if (!Number.isSafeInteger(perUser) || perUser < 0) {
      return a.vouchers.errPerUser;
    }
    if (offerType === 'amount' || offerType === 'free_shipping') {
      if (minSubtotal.trim()) {
        const floor = Number(minSubtotal.replace(',', '.'));
        if (!Number.isFinite(floor) || floor <= 0) {
          return a.vouchers.errMinPositive;
        }
      }
    } else if (minSubtotal.trim()) {
      return a.vouchers.errMinOnlyFor;
    }
    if (offerType !== 'free_shipping') {
      const numeric = Number(value.replace(',', '.'));
      if (offerType === 'percent') {
        if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100) {
          return a.vouchers.errPercent;
        }
      } else if (offerType === 'free_item_nth') {
        if (!Number.isSafeInteger(numeric) || numeric < 1) {
          return a.vouchers.errNth;
        }
      } else if (!Number.isFinite(numeric) || numeric <= 0) {
        return a.vouchers.errValue;
      }
    }
    const parsed = parseEmails(emails, a);
    if ('error' in parsed) return parsed.error;
    return null;
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const validationError = validateCreate();
    if (validationError) {
      setFormError(validationError);
      setNotice(null);
      return;
    }
    setCreating(true);
    setFormError(null);
    setNotice(null);
    const parsedEmails = parseEmails(emails, a);
    const emailList = 'emails' in parsedEmails ? parsedEmails.emails : [];
    try {
      const created = await withMinDuration(
        authedRequest((token) =>
          createAdminVoucher(token, {
            ...(code.trim() ? { code: code.trim() } : {}),
            quantity: Number(quantity),
            maxUsesPerUser: Number(maxUsesPerUser),
            ...(minSubtotal.trim() && (offerType === 'amount' || offerType === 'free_shipping')
              ? { minSubtotal: Number(minSubtotal.replace(',', '.')) }
              : {}),
            startsAt: start,
            endsAt: end,
            offerType,
            ...(offerType === 'free_shipping' ? {} : { value: Number(value.replace(',', '.')) }),
            ...(emailList.length ? { emails: emailList } : {}),
          }),
        ),
        shopConfig.loadingMinMs.short,
      );
      setCode('');
      setQuantity('1');
      setStart(todayIsoDate());
      setEnd('');
      setOfferType('percent');
      setValue('10');
      setMaxUsesPerUser('1');
      setMinSubtotal('');
      setEmails('');
      setCreateOpen(false);
      setNotice(a.vouchers.createdNotice(created.code));
      await load();
    } catch (err) {
      setFormError(createErrorMessage(err, a));
    } finally {
      setCreating(false);
    }
  }

  async function toggle(voucher: AdminVoucher) {
    setTogglingCode(voucher.code);
    setError(null);
    try {
      await withMinDuration(
        authedRequest((token) => setAdminVoucherEnabled(token, voucher.code, !voucher.enabled)),
        shopConfig.loadingMinMs.short,
      );
      setVouchers((current) =>
        current.map((entry) =>
          entry.code === voucher.code ? { ...entry, enabled: !voucher.enabled } : entry,
        ),
      );
    } catch {
      setError(a.vouchers.errToggle);
    } finally {
      setTogglingCode(null);
    }
  }

  async function removeVoucher(voucher: AdminVoucher) {
    if (deletingCode !== null) return;
    setDeletingCode(voucher.code);
    setError(null);
    try {
      await withMinDuration(
        authedRequest((token) => deleteAdminVoucher(token, voucher.code)),
        shopConfig.loadingMinMs.short,
      );
      setVouchers((current) => current.filter((entry) => entry.code !== voucher.code));
      setDeleteTarget(null);
      setDetailCode(null);
      setNotice(t.admin.voucherDeleteSuccess(voucher.code));
    } catch (err) {
      setDeleteTarget(null);
      if (err instanceof ApiError && err.code === 'voucher_not_deletable') {
        setError(t.admin.voucherDeleteUnavailable);
      } else {
        setError(t.admin.actionError);
      }
    } finally {
      setDeletingCode(null);
    }
  }

  if (!vouchersOn) return <NotFoundPage />;

  return (
    <section className={styles.section}>
      <Seo
        title={t.admin.vouchersTitle}
        description={t.admin.vouchersDescription}
        path={adminPath('/vouchers')}
        noindex
      />
      <h1 className={styles.title}>{t.admin.vouchersTitle}</h1>

      <label className={styles.searchField}>
        <span>{a.vouchers.searchLabel}</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={a.vouchers.searchPlaceholder}
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <div className={styles.filterRow} role="group" aria-label={a.vouchers.filterAria}>
        {(
          [
            ['all', a.vouchers.filterAll],
            ['active', a.vouchers.filterActive],
            ['inactive', a.vouchers.filterInactive],
          ] as const
        ).map(([filterValue, label]) => (
          <Chip
            key={filterValue}
            active={enabledFilter === filterValue}
            onClick={() => setEnabledFilter(filterValue)}
          >
            {label}
          </Chip>
        ))}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && <p className={styles.notice}>{notice}</p>}

      <button type="button" className={styles.createTrigger} onClick={() => setCreateOpen(true)}>
        + {t.admin.voucherCreate}
      </button>

      {!loading &&
        (filtered.length === 0 ? (
          <p className={styles.empty}>
            {vouchers.length === 0 ? a.vouchers.emptyNone : a.vouchers.emptyFiltered}
          </p>
        ) : (
          <ul className={styles.listRows}>
            {filtered.map((voucher) => (
              <li key={voucher.code}>
                <button
                  type="button"
                  className={styles.listRow}
                  title={t.admin.voucherOpen(voucher.code)}
                  onClick={() => setDetailCode(voucher.code)}
                >
                  <span className={styles.listRowMain}>
                    <span className={styles.listRowTop}>
                      <strong className={styles.listCode}>{voucher.code}</strong>
                      <span
                        className={
                          voucher.enabled
                            ? `${styles.status} ${styles.statusOn}`
                            : `${styles.status} ${styles.statusOff}`
                        }
                      >
                        {voucher.enabled ? t.admin.voucherActive : t.admin.voucherInactive}
                      </span>
                    </span>
                    <span className={styles.listSummary}>
                      {formatOffer(voucher.offer, a)} ·{' '}
                      {a.vouchers.listSummary(voucher.remainingQuantity, voucher.redeemedQuantity)}
                    </span>
                  </span>
                  <span className={styles.listTrailing}>
                    {formatDateRange(voucher.startsAt, voucher.endsAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      {createOpen && (
        <BottomSheet
          title={t.admin.voucherCreateTitle}
          onClose={() => setCreateOpen(false)}
          closeLabel={t.gallery.close}
        >
          <form className={styles.formGrid} onSubmit={(event) => void onCreate(event)} noValidate>
            <label className={styles.field}>
              <span>{a.vouchers.codeLabel}</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={a.vouchers.codePlaceholder}
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <label className={styles.field}>
              <span>{a.vouchers.quantity}</span>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className={styles.field}>
              <span>{a.vouchers.start}</span>
              <input
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className={styles.field}>
              <span>{a.vouchers.end}</span>
              <input
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                disabled={creating}
              />
            </label>
            <label className={styles.field}>
              <span>{a.vouchers.offerType}</span>
              <select
                value={offerType}
                onChange={(event) => setOfferType(event.target.value as AdminVoucherOfferType)}
                disabled={busy}
              >
                {OFFER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {offerTypeLabel(type, a)}
                  </option>
                ))}
              </select>
            </label>
            {valueMeta && (
              <label className={styles.field}>
                <span>{valueMeta.label}</span>
                <input
                  type="number"
                  min={valueMeta.min}
                  step={valueMeta.step}
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  disabled={busy}
                />
              </label>
            )}
            <label className={styles.field}>
              <span>{a.vouchers.perUser}</span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={maxUsesPerUser}
                onChange={(event) => setMaxUsesPerUser(event.target.value)}
                disabled={busy}
              />
              <span className={styles.fieldHint}>{a.vouchers.perUserHint}</span>
            </label>
            {(offerType === 'amount' || offerType === 'free_shipping') && (
              <label className={styles.field}>
                <span>{a.vouchers.minPurchase}</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  inputMode="decimal"
                  value={minSubtotal}
                  onChange={(event) => setMinSubtotal(event.target.value)}
                  placeholder={a.vouchers.optional}
                  disabled={busy}
                />
              </label>
            )}
            <label className={`${styles.field} ${styles.spanAll}`}>
              <span>{a.vouchers.restrictLabel}</span>
              <textarea
                value={emails}
                onChange={(event) => setEmails(event.target.value)}
                placeholder={a.vouchers.restrictPlaceholder}
                autoComplete="off"
                disabled={busy}
                rows={3}
              />
              <span className={styles.fieldHint}>{a.vouchers.restrictHint}</span>
            </label>
            {formError && (
              <p className={`${styles.error} ${styles.spanAll}`} role="alert">
                {formError}
              </p>
            )}
            <div className={styles.formActions}>
              <Button type="submit" disabled={busy}>
                {a.vouchers.create}
              </Button>
            </div>
          </form>
        </BottomSheet>
      )}

      {detailVoucher && (
        <VoucherDetailModal
          voucher={detailVoucher}
          language={lang}
          closeLabel={t.gallery.close}
          activeLabel={t.admin.voucherActive}
          inactiveLabel={t.admin.voucherInactive}
          deleteAria={t.admin.voucherDeleteAria(detailVoucher.code)}
          deleteLabel={t.admin.voucherDeleteConfirm}
          busy={busy}
          onToggle={() => void toggle(detailVoucher)}
          onDelete={detailVoucher.canDelete ? () => setDeleteTarget(detailVoucher) : undefined}
          onClose={() => {
            if (deletingCode === null) setDetailCode(null);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={t.admin.voucherDeleteTitle}
          message={t.admin.voucherDeleteMessage(deleteTarget.code)}
          confirmLabel={t.admin.voucherDeleteConfirm}
          closeLabel={t.auth.closeAria}
          confirmDanger
          onConfirm={() => void removeVoucher(deleteTarget)}
          onCancel={() => {
            if (deletingCode === null) setDeleteTarget(null);
          }}
        />
      )}

      {busy && <LoadingModal message={loadingMessage} />}
    </section>
  );
}

function VoucherDetailModal({
  voucher,
  language,
  closeLabel,
  activeLabel,
  inactiveLabel,
  deleteAria,
  deleteLabel,
  busy,
  onToggle,
  onDelete,
  onClose,
}: {
  voucher: AdminVoucher;
  language: string;
  closeLabel: string;
  activeLabel: string;
  inactiveLabel: string;
  deleteAria: string;
  deleteLabel: string;
  busy: boolean;
  onToggle: () => void;
  onDelete?: (() => void) | undefined;
  onClose: () => void;
}) {
  const { t } = useLang();
  const a = useAdminStrings();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const requestClose = useHistoryBackClose(onClose);
  useLockBodyScroll();
  useFocusTrap(panelRef, { onEscape: requestClose });

  return createPortal(
    <ModalBackdrop className={styles.detailBackdrop ?? ''} label={voucher.code} onClose={requestClose}>
      <div ref={panelRef} className={styles.detailPanel}>
        <div className={styles.detailHeader}>
          <span className={styles.detailTitle}>{voucher.code}</span>
          <button type="button" className={styles.detailClose} onClick={requestClose} aria-label={closeLabel}>
            <CloseIcon />
          </button>
        </div>
        <ModalScrollBody contentKey={voucher.code}>
          <div className={styles.detailToolbar}>
            <span
              className={
                voucher.enabled
                  ? `${styles.status} ${styles.statusOn}`
                  : `${styles.status} ${styles.statusOff}`
              }
            >
              {voucher.enabled ? activeLabel : inactiveLabel}
            </span>
            <ToggleSwitch
              checked={voucher.enabled}
              onChange={onToggle}
              aria-label={a.vouchers.toggleAria(voucher.code)}
              disabled={busy}
            />
          </div>
          <p className={styles.offer}>{formatOffer(voucher.offer, a)}</p>
          <div className={styles.stats}>
            <Stat label={a.vouchers.statRemaining} value={voucher.remainingQuantity} />
            <Stat label={a.vouchers.statUsed} value={voucher.redeemedQuantity} />
            <Stat label={a.vouchers.statHeld} value={voucher.heldQuantity} />
            <Stat label={a.vouchers.quantity} value={voucher.quantity} />
            <Stat
              label={a.vouchers.statPerUser}
              value={voucher.maxUsesPerUser === 0 ? '∞' : voucher.maxUsesPerUser}
            />
          </div>
          <p className={styles.validity}>
            {a.vouchers.validity(formatDateRange(voucher.startsAt, voucher.endsAt))}
            {voucher.minSubtotal != null ? a.vouchers.minPurchaseShort(formatPrice(voucher.minSubtotal)) : ''}
          </p>
          <p className={styles.restriction}>
            {(voucher.allowedEmails ?? []).length === 0
              ? a.vouchers.allAccounts
              : a.vouchers.accounts((voucher.allowedEmails ?? []).join(', '))}
          </p>
          <div className={styles.redemptionModal} data-testid="admin-voucher-redemptions-modal">
            <p
              className={styles.usageHeading}
              data-testid="admin-voucher-usage"
              data-voucher-code={voucher.code}
            >
              {t.admin.voucherConsumedTitle(voucher.redemptions.length)}
            </p>
            {voucher.redemptions.length === 0 ? (
              <p className={styles.redemptionEmpty}>{t.admin.voucherConsumedEmpty}</p>
            ) : (
              <ul className={styles.redemptionList}>
                {voucher.redemptions.map((redemption) => (
                  <li
                    key={`${redemption.orderNumber}-${redemption.redeemedAt}`}
                    data-testid="admin-voucher-redemption"
                  >
                    <strong className={styles.consumedEmail}>
                      {redemption.email ?? t.admin.voucherConsumedDeleted}
                    </strong>
                    <span>
                      {t.admin.voucherConsumedOrder(redemption.orderNumber)} ·{' '}
                      <time dateTime={redemption.redeemedAt}>
                        {formatRedemptionDate(redemption.redeemedAt, language)}
                      </time>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ModalScrollBody>
        {onDelete && (
          <div className={styles.detailFooter}>
            <Button
              type="button"
              variant="ghostDanger"
              disabled={busy}
              onClick={onDelete}
              aria-label={deleteAria}
            >
              {deleteLabel}
            </Button>
          </div>
        )}
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
