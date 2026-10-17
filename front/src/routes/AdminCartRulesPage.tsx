import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Seo } from '../components/seo/Seo';
import { LoadingModal } from '../components/ui/LoadingModal';
import { BottomSheet } from '../components/ui/BottomSheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { Button } from '../components/ui/Button';
import { CloseIcon } from '../components/ui/CloseIcon';
import { ModalBackdrop } from '../components/ui/ModalBackdrop';
import { ModalScrollBody } from '../components/ui/ModalScrollBody';
import { ApiError } from '../api/errors';
import {
  deleteAdminCartRule,
  getAdminCartRules,
  setAdminCartRuleEnabled,
  upsertAdminCartRule,
  type AdminCartRule,
  type AdminCartRuleKind,
} from '../api/admin/commerce';
import { useAuthSession } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { useLang } from '../assets/i18n';
import { useAdminStrings, type AdminUiStrings } from '../assets/i18n/admin';
import { adminPath } from '../utils/adminRoute';
import { withMinDuration } from '../utils/withMinDuration';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useHistoryBackClose } from '../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import styles from './AdminCartRulesPage.module.css';
import { shopConfig } from '../config/env';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';
import { NotFoundPage } from './NotFoundPage';

const KINDS: AdminCartRuleKind[] = ['gift_per_nail_set', 'nail_qty_percent_tiers', 'free_shipping_above'];

type TierDraft = { minQty: string; percent: string };
type ThresholdDraft = { country: string; euros: string };

type RuleDraft = {
  code: string;
  kind: AdminCartRuleKind;
  enabled: boolean;
  priority: string;
  forbidVoucher: boolean;
  productUid: string;
  qtyPerNailSetUnit: string;
  minNails: string;
  tiers: TierDraft[];
  thresholds: ThresholdDraft[];
};

function kindLabel(kind: string, a: AdminUiStrings): string {
  switch (kind) {
    case 'gift_per_nail_set':
      return a.cartRules.kindGift;
    case 'nail_qty_percent_tiers':
      return a.cartRules.kindTiers;
    case 'free_shipping_above':
      return a.cartRules.kindFreeShipping;
    default:
      return kind;
  }
}

function ruleSummary(draft: RuleDraft, a: AdminUiStrings): string {
  const extras: string[] = [a.cartRules.priority(draft.priority)];
  if (draft.forbidVoucher) extras.push(a.cartRules.vouchersForbidden);
  let detail = '';
  if (draft.kind === 'gift_per_nail_set') {
    detail = [
      draft.productUid.trim(),
      `${draft.qtyPerNailSetUnit} / set`,
      a.cartRules.fromNails(draft.minNails),
    ]
      .filter(Boolean)
      .join(' · ');
  } else if (draft.kind === 'nail_qty_percent_tiers') {
    const steps = draft.tiers
      .filter((tier) => tier.minQty !== '' || tier.percent !== '')
      .map((tier) => `${tier.minQty || '?'} → ${tier.percent || '?'} %`)
      .join(' · ');
    detail = [steps, a.cartRules.fromNails(draft.minNails)].filter(Boolean).join(' · ');
  } else {
    detail = draft.thresholds
      .filter((row) => row.country !== '' || row.euros !== '')
      .map((row) => `${row.country || '?'} ≥ ${row.euros || '?'} €`)
      .join(' · ');
  }
  return [detail, ...extras].filter(Boolean).join(' · ');
}

function emptyDraft(kind: AdminCartRuleKind = 'gift_per_nail_set'): RuleDraft {
  return {
    code: '',
    kind,
    enabled: true,
    priority: '100',
    forbidVoucher: false,
    productUid: '',
    qtyPerNailSetUnit: '1',
    minNails: '5',
    tiers: [{ minQty: '2', percent: '5' }],
    thresholds: [{ country: 'FR', euros: '65' }],
  };
}

function draftFromRule(rule: AdminCartRule): RuleDraft {
  const kind = (
    KINDS.includes(rule.kind as AdminCartRuleKind) ? rule.kind : 'gift_per_nail_set'
  ) as AdminCartRuleKind;
  const params = rule.params && typeof rule.params === 'object' ? rule.params : {};
  const gift = params as {
    productUid?: unknown;
    qtyPerNailSetUnit?: unknown;
    minNails?: unknown;
  };
  const tiers = params as { tiers?: unknown };
  const shipping = params as { thresholdsByCountry?: unknown };
  return {
    code: rule.code,
    kind,
    enabled: rule.enabled,
    priority: String(rule.priority),
    forbidVoucher: rule.forbidVoucher,
    productUid: typeof gift.productUid === 'string' ? gift.productUid : '',
    qtyPerNailSetUnit: typeof gift.qtyPerNailSetUnit === 'number' ? String(gift.qtyPerNailSetUnit) : '1',
    minNails: typeof gift.minNails === 'number' ? String(gift.minNails) : '5',
    tiers:
      Array.isArray(tiers.tiers) && tiers.tiers.length > 0
        ? tiers.tiers.map((tier) => {
            const row = tier && typeof tier === 'object' ? (tier as Record<string, unknown>) : {};
            return {
              minQty: typeof row.minQty === 'number' ? String(row.minQty) : '',
              percent: typeof row.percent === 'number' ? String(row.percent) : '',
            };
          })
        : [{ minQty: '2', percent: '5' }],
    thresholds:
      shipping.thresholdsByCountry &&
      typeof shipping.thresholdsByCountry === 'object' &&
      !Array.isArray(shipping.thresholdsByCountry) &&
      Object.keys(shipping.thresholdsByCountry).length > 0
        ? Object.entries(shipping.thresholdsByCountry as Record<string, unknown>).map(([country, euros]) => ({
            country,
            euros: typeof euros === 'number' ? String(euros) : '',
          }))
        : [{ country: 'FR', euros: '65' }],
  };
}

function buildParams(draft: RuleDraft): Record<string, unknown> | null {
  const minNails = Number(draft.minNails);
  const minNailsOk = Number.isInteger(minNails) && minNails >= 1 && minNails <= 10;
  if (draft.kind === 'gift_per_nail_set') {
    const qty = Number(draft.qtyPerNailSetUnit);
    if (!draft.productUid.trim() || !Number.isInteger(qty) || qty <= 0 || !minNailsOk) return null;
    return { productUid: draft.productUid.trim(), qtyPerNailSetUnit: qty, minNails };
  }
  if (draft.kind === 'nail_qty_percent_tiers') {
    const tiers = draft.tiers.map((tier) => ({ minQty: Number(tier.minQty), percent: Number(tier.percent) }));
    if (
      tiers.length === 0 ||
      tiers.some(
        (tier) =>
          !Number.isInteger(tier.minQty) ||
          tier.minQty <= 0 ||
          !Number.isFinite(tier.percent) ||
          tier.percent < 0 ||
          tier.percent > 100,
      )
    ) {
      return null;
    }
    if (!minNailsOk) return null;
    return { tiers, minNails };
  }
  const thresholdsByCountry: Record<string, number> = {};
  for (const row of draft.thresholds) {
    const country = row.country.trim().toUpperCase();
    const euros = Number(row.euros);
    if (!/^[A-Z]{2}$/.test(country) || !Number.isFinite(euros) || euros < 0) return null;
    thresholdsByCountry[country] = euros;
  }
  if (Object.keys(thresholdsByCountry).length === 0) return null;
  return { thresholdsByCountry };
}

function saveErrorMessage(error: unknown, a: AdminUiStrings): string {
  if (error instanceof ApiError) {
    if (error.code === 'invalid_params' || error.code === 'invalid_request') return a.cartRules.errParams;
    if (error.code === 'not_found') return a.cartRules.errNotFound;
  }
  return a.cartRules.errSave;
}

export function AdminCartRulesPage() {
  const rulesOn = usePluginEnabled('commerce-cart-rules');
  const { t } = useLang();
  const a = useAdminStrings();
  const { authedRequest } = useAuthSession();
  const toast = useToast();
  const [rules, setRules] = useState<AdminCartRule[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [createDraft, setCreateDraft] = useState<RuleDraft>(() => emptyDraft());
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const busy = loading || creating || savingCode !== null;
  const loadingMessage = creating || savingCode !== null ? t.admin.actionLoading : t.admin.contentLoading;

  const load = useCallback(async () => {
    if (!rulesOn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => getAdminCartRules(token)),
        shopConfig.loadingMinMs.short,
      );
      setRules(result.rules);
      const next: Record<string, RuleDraft> = {};
      for (const rule of result.rules) next[rule.code] = draftFromRule(rule);
      setDrafts(next);
    } catch {
      setError(a.cartRules.loadError);
    } finally {
      setLoading(false);
    }
  }, [authedRequest, a.cartRules.loadError, rulesOn]);

  useEffect(() => {
    void load();
  }, [load]);

  const editingRule = editingCode ? (rules.find((rule) => rule.code === editingCode) ?? null) : null;
  const editingDraft = editingCode ? (drafts[editingCode] ?? null) : null;

  function openRule(rule: AdminCartRule) {
    if (busy) return;
    setEditError(null);
    setDrafts((current) => ({ ...current, [rule.code]: draftFromRule(rule) }));
    setEditingCode(rule.code);
  }

  function updateDraft(code: string, patch: Partial<RuleDraft>) {
    setDrafts((current) => {
      const base = current[code];
      if (!base) return current;
      return { ...current, [code]: { ...base, ...patch } };
    });
  }

  async function saveRule(code: string) {
    const draft = drafts[code];
    if (!draft || busy) return;
    const priority = Number(draft.priority);
    const params = buildParams(draft);
    if (!params || !Number.isInteger(priority)) {
      setEditError(a.cartRules.errParams);
      return;
    }
    setSavingCode(code);
    setError(null);
    setEditError(null);
    setNotice(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) =>
          upsertAdminCartRule(token, {
            code: draft.code,
            kind: draft.kind,
            enabled: draft.enabled,
            priority,
            forbidVoucher: draft.forbidVoucher,
            params,
          }),
        ),
        shopConfig.loadingMinMs.short,
      );
      setRules((current) => current.map((rule) => (rule.code === code ? result.rule : rule)));
      setDrafts((current) => ({ ...current, [code]: draftFromRule(result.rule) }));
      setEditingCode(null);
      setNotice(a.cartRules.savedNotice(code));
    } catch (err) {
      setEditError(saveErrorMessage(err, a));
    } finally {
      setSavingCode(null);
    }
  }

  async function toggleEnabled(rule: AdminCartRule) {
    if (busy) return;
    setSavingCode(rule.code);
    setError(null);
    setEditError(null);
    try {
      await withMinDuration(
        authedRequest((token) => setAdminCartRuleEnabled(token, rule.code, !rule.enabled)),
        shopConfig.loadingMinMs.short,
      );
      setRules((current) =>
        current.map((entry) => (entry.code === rule.code ? { ...entry, enabled: !rule.enabled } : entry)),
      );
      updateDraft(rule.code, { enabled: !rule.enabled });
      toast(!rule.enabled ? a.cartRules.enabledToast : a.cartRules.disabledToast);
    } catch {
      setEditError(a.cartRules.errToggle);
    } finally {
      setSavingCode(null);
    }
  }

  async function removeRule(code: string) {
    if (busy) return;
    setSavingCode(code);
    setError(null);
    setNotice(null);
    try {
      await withMinDuration(
        authedRequest((token) => deleteAdminCartRule(token, code)),
        shopConfig.loadingMinMs.short,
      );
      setRules((current) => current.filter((rule) => rule.code !== code));
      setDrafts((current) => {
        const next = { ...current };
        delete next[code];
        return next;
      });
      setEditingCode(null);
      setNotice(a.cartRules.deletedNotice(code));
    } catch {
      setError(a.cartRules.errDelete);
    } finally {
      setSavingCode(null);
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const priority = Number(createDraft.priority);
    const params = buildParams(createDraft);
    if (!createDraft.code.trim() || !params || !Number.isInteger(priority)) {
      setFormError(a.cartRules.errCreateFields);
      return;
    }
    setCreating(true);
    setFormError(null);
    setNotice(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) =>
          upsertAdminCartRule(token, {
            code: createDraft.code.trim().toLowerCase(),
            kind: createDraft.kind,
            enabled: createDraft.enabled,
            priority,
            forbidVoucher: createDraft.forbidVoucher,
            params,
          }),
        ),
        shopConfig.loadingMinMs.short,
      );
      setCreateDraft(emptyDraft(createDraft.kind));
      setCreateOpen(false);
      setNotice(a.cartRules.createdNotice(result.rule.code));
      await load();
    } catch (err) {
      setFormError(saveErrorMessage(err, a));
    } finally {
      setCreating(false);
    }
  }

  if (!rulesOn) return <NotFoundPage />;

  return (
    <section className={styles.section}>
      <Seo
        title={t.admin.cartRulesTitle}
        description={t.admin.cartRulesDescription}
        path={adminPath('/cart-rules')}
        noindex
      />
      <h1 className={styles.title}>{t.admin.cartRulesTitle}</h1>
      <p className={styles.description}>{a.cartRules.intro}</p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && <p className={styles.notice}>{notice}</p>}

      <button type="button" className={styles.createTrigger} onClick={() => setCreateOpen(true)}>
        + {t.admin.cartRuleCreate}
      </button>

      {!loading && rules.length === 0 && <p className={styles.empty}>{a.cartRules.empty}</p>}
      {rules.length > 0 && (
        <ul className={styles.listRows}>
          {rules.map((rule) => {
            const draft = drafts[rule.code] ?? draftFromRule(rule);
            return (
              <li key={rule.code}>
                <button
                  type="button"
                  className={styles.listRow}
                  title={t.admin.cartRuleOpen(rule.code)}
                  onClick={() => openRule(rule)}
                >
                  <span className={styles.listRowMain}>
                    <span className={styles.listRowTop}>
                      <strong className={styles.listCode}>{rule.code}</strong>
                      <span
                        className={
                          rule.enabled
                            ? `${styles.status} ${styles.statusOn}`
                            : `${styles.status} ${styles.statusOff}`
                        }
                      >
                        {rule.enabled ? t.admin.cartRuleActive : t.admin.cartRuleInactive}
                      </span>
                    </span>
                    <span className={styles.listSummary}>{ruleSummary(draft, a)}</span>
                  </span>
                  <span className={styles.listTrailing}>{kindLabel(rule.kind, a)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {createOpen && (
        <BottomSheet
          title={t.admin.cartRuleCreateTitle}
          onClose={() => setCreateOpen(false)}
          closeLabel={t.gallery.close}
        >
          <form className={styles.formGrid} onSubmit={(event) => void onCreate(event)} noValidate>
            <RuleFields draft={createDraft} onChange={setCreateDraft} disabled={busy} codeEditable />
            {formError && (
              <p className={`${styles.error} ${styles.spanAll}`} role="alert">
                {formError}
              </p>
            )}
            <div className={styles.formActions}>
              <Button type="submit" disabled={busy}>
                {t.admin.saveAction}
              </Button>
            </div>
          </form>
        </BottomSheet>
      )}

      {editingRule && editingDraft && (
        <CartRuleEditModal
          rule={editingRule}
          draft={editingDraft}
          closeLabel={t.gallery.close}
          saveLabel={t.admin.saveAction}
          deleteLabel={t.admin.voucherDeleteConfirm}
          activeLabel={t.admin.cartRuleActive}
          inactiveLabel={t.admin.cartRuleInactive}
          busy={busy}
          error={editError}
          onChange={(next) => updateDraft(editingRule.code, next)}
          onSave={() => void saveRule(editingRule.code)}
          onToggle={() => void toggleEnabled(editingRule)}
          onDelete={() => setPendingDelete(editingRule.code)}
          onClose={() => {
            if (savingCode === null) {
              setEditError(null);
              setEditingCode(null);
            }
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={a.cartRules.deleteTitle}
          message={a.cartRules.deleteMessage(pendingDelete)}
          confirmLabel={t.admin.voucherDeleteConfirm}
          closeLabel={t.gallery.close}
          confirmDanger
          onConfirm={() => {
            const code = pendingDelete;
            setPendingDelete(null);
            void removeRule(code);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {busy && <LoadingModal message={loadingMessage} />}
    </section>
  );
}

function CartRuleEditModal({
  rule,
  draft,
  closeLabel,
  saveLabel,
  deleteLabel,
  activeLabel,
  inactiveLabel,
  busy,
  error,
  onChange,
  onSave,
  onToggle,
  onDelete,
  onClose,
}: {
  rule: AdminCartRule;
  draft: RuleDraft;
  closeLabel: string;
  saveLabel: string;
  deleteLabel: string;
  activeLabel: string;
  inactiveLabel: string;
  busy: boolean;
  error: string | null;
  onChange: (next: RuleDraft) => void;
  onSave: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const a = useAdminStrings();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const requestClose = useHistoryBackClose(() => {
    if (!busy) onClose();
  });
  useLockBodyScroll();
  useFocusTrap(panelRef, { onEscape: busy ? undefined : requestClose });

  return createPortal(
    <ModalBackdrop
      className={styles.detailBackdrop ?? ''}
      label={rule.code}
      onClose={busy ? () => {} : requestClose}
      closeOnBackdropClick={!busy}
    >
      <div ref={panelRef} className={styles.detailPanel}>
        <div className={styles.detailHeader}>
          <span className={styles.detailTitle}>{rule.code}</span>
          <button
            type="button"
            className={styles.detailClose}
            onClick={requestClose}
            aria-label={closeLabel}
            disabled={busy}
          >
            <CloseIcon />
          </button>
        </div>
        <ModalScrollBody contentKey={rule.code}>
          <div className={styles.detailToolbar}>
            <span
              className={
                rule.enabled ? `${styles.status} ${styles.statusOn}` : `${styles.status} ${styles.statusOff}`
              }
            >
              {rule.enabled ? activeLabel : inactiveLabel}
            </span>
            <ToggleSwitch
              checked={rule.enabled}
              onChange={onToggle}
              aria-label={a.cartRules.toggleAria(rule.code)}
              disabled={busy}
            />
          </div>
          <p className={styles.kindHeading}>{kindLabel(rule.kind, a)}</p>
          <div className={styles.formGrid}>
            <RuleFields draft={draft} onChange={onChange} disabled={busy} codeEditable={false} kindLocked />
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </ModalScrollBody>
        <div className={styles.detailFooter}>
          <Button type="button" disabled={busy} onClick={onSave}>
            {saveLabel}
          </Button>
          <Button type="button" variant="ghostDanger" disabled={busy} onClick={onDelete}>
            {deleteLabel}
          </Button>
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

function RuleFields({
  draft,
  onChange,
  disabled,
  codeEditable,
  kindLocked = false,
}: {
  draft: RuleDraft;
  onChange: (next: RuleDraft) => void;
  disabled: boolean;
  codeEditable: boolean;
  kindLocked?: boolean;
}) {
  const a = useAdminStrings();
  return (
    <>
      {codeEditable && (
        <label className={styles.field}>
          <span>{a.cartRules.codeLabel}</span>
          <input
            value={draft.code}
            onChange={(event) => onChange({ ...draft, code: event.target.value })}
            autoComplete="off"
            disabled={disabled}
            placeholder="tip-pot"
          />
        </label>
      )}
      <label className={styles.field}>
        <span>{a.cartRules.type}</span>
        <select
          value={draft.kind}
          disabled={disabled || kindLocked}
          onChange={(event) => onChange({ ...draft, kind: event.target.value as AdminCartRuleKind })}
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kindLabel(kind, a)}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>{a.cartRules.priorityLabel}</span>
        <input
          type="number"
          step={1}
          value={draft.priority}
          onChange={(event) => onChange({ ...draft, priority: event.target.value })}
          disabled={disabled}
        />
      </label>
      {codeEditable && (
        <div className={`${styles.checkField} ${styles.spanAll}`}>
          <ToggleSwitch
            checked={draft.enabled}
            onChange={(checked) => onChange({ ...draft, enabled: checked })}
            aria-label={a.cartRules.active}
            disabled={disabled}
          />
          {a.cartRules.active}
        </div>
      )}
      <div className={`${styles.checkField} ${styles.spanAll}`}>
        <ToggleSwitch
          checked={draft.forbidVoucher}
          onChange={(checked) => onChange({ ...draft, forbidVoucher: checked })}
          aria-label={a.cartRules.forbidVouchersAria}
          disabled={disabled}
        />
        {a.cartRules.forbidVouchers}
      </div>

      {draft.kind === 'gift_per_nail_set' && (
        <>
          <label className={styles.field}>
            <span>{a.cartRules.giftProduct}</span>
            <input
              value={draft.productUid}
              onChange={(event) => onChange({ ...draft, productUid: event.target.value })}
              disabled={disabled}
              placeholder="TK-PT-248"
            />
          </label>
          <label className={styles.field}>
            <span>{a.cartRules.giftQty}</span>
            <input
              type="number"
              min={1}
              step={1}
              value={draft.qtyPerNailSetUnit}
              onChange={(event) => onChange({ ...draft, qtyPerNailSetUnit: event.target.value })}
              disabled={disabled}
            />
          </label>
          <label className={styles.field}>
            <span>{a.cartRules.minNails}</span>
            <input
              type="number"
              min={1}
              max={10}
              step={1}
              value={draft.minNails}
              onChange={(event) => onChange({ ...draft, minNails: event.target.value })}
              disabled={disabled}
            />
          </label>
        </>
      )}

      {draft.kind === 'nail_qty_percent_tiers' && (
        <div className={`${styles.field} ${styles.spanAll}`}>
          <label className={styles.field}>
            <span>{a.cartRules.minNails}</span>
            <input
              type="number"
              min={1}
              max={10}
              step={1}
              value={draft.minNails}
              onChange={(event) => onChange({ ...draft, minNails: event.target.value })}
              disabled={disabled}
            />
          </label>
          <span>{a.cartRules.tiers}</span>
          <div className={styles.pairList}>
            {draft.tiers.map((tier, index) => (
              <div key={index} className={styles.pairRow}>
                <label className={styles.field}>
                  <span>{a.cartRules.minQty}</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={tier.minQty}
                    disabled={disabled}
                    onChange={(event) => {
                      const tiers = draft.tiers.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, minQty: event.target.value } : row,
                      );
                      onChange({ ...draft, tiers });
                    }}
                  />
                </label>
                <label className={styles.field}>
                  <span>%</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={tier.percent}
                    disabled={disabled}
                    onChange={(event) => {
                      const tiers = draft.tiers.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, percent: event.target.value } : row,
                      );
                      onChange({ ...draft, tiers });
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={disabled || draft.tiers.length <= 1}
                  aria-label={a.cartRules.removeTier}
                  onClick={() =>
                    onChange({ ...draft, tiers: draft.tiers.filter((_, rowIndex) => rowIndex !== index) })
                  }
                >
                  −
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={disabled}
              onClick={() => onChange({ ...draft, tiers: [...draft.tiers, { minQty: '', percent: '' }] })}
            >
              {a.cartRules.addTier}
            </button>
          </div>
        </div>
      )}

      {draft.kind === 'free_shipping_above' && (
        <div className={`${styles.field} ${styles.spanAll}`}>
          <span>{a.cartRules.thresholds}</span>
          <div className={styles.pairList}>
            {draft.thresholds.map((row, index) => (
              <div key={index} className={styles.pairRow}>
                <label className={styles.field}>
                  <span>{a.cartRules.countryCode}</span>
                  <input
                    value={row.country}
                    disabled={disabled}
                    maxLength={2}
                    onChange={(event) => {
                      const thresholds = draft.thresholds.map((entry, rowIndex) =>
                        rowIndex === index ? { ...entry, country: event.target.value.toUpperCase() } : entry,
                      );
                      onChange({ ...draft, thresholds });
                    }}
                  />
                </label>
                <label className={styles.field}>
                  <span>{a.cartRules.threshold}</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={row.euros}
                    disabled={disabled}
                    onChange={(event) => {
                      const thresholds = draft.thresholds.map((entry, rowIndex) =>
                        rowIndex === index ? { ...entry, euros: event.target.value } : entry,
                      );
                      onChange({ ...draft, thresholds });
                    }}
                  />
                </label>
                <button
                  aria-label={a.cartRules.removeThreshold}
                  type="button"
                  disabled={disabled || draft.thresholds.length <= 1}
                  onClick={() =>
                    onChange({
                      ...draft,
                      thresholds: draft.thresholds.filter((_, rowIndex) => rowIndex !== index),
                    })
                  }
                >
                  −
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={disabled}
              onClick={() =>
                onChange({ ...draft, thresholds: [...draft.thresholds, { country: '', euros: '' }] })
              }
            >
              {a.cartRules.addThreshold}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
