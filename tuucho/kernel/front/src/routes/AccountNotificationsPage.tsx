import { useEffect, useState } from 'react';
import { useLang } from '../assets/i18n';
import type { NotificationChannelCopy, NotificationsStrings } from '../assets/i18n/types';
import { useAuthSession } from '../state/AuthContext';
import { Seo } from '../components/seo/Seo';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { AccountShell } from '../components/account/AccountShell';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import * as authApi from '../api/account';
import { ApiError } from '../api/errors';
import { isBackendUnavailableError } from '../api/http';
import type { NotificationChannel, NotificationPreferences } from '../api/account';
import addressStyles from './AccountAddressesPage.module.css';
import styles from './AccountNotificationsPage.module.css';
import { OpeningEntries } from '../plugins/OpeningEntries';
import { CORE_FRONT_SLOTS, PluginSlot } from '../plugins/PluginHost';
import { usePluginEnabled, useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';

type PendingDisable = { channel: NotificationChannel; title: string; message: string };

type TransactionalChannel = Extract<
  NotificationChannel,
  'order_confirmation' | 'order_shipped' | 'invoice' | 'security' | 'chat_reply' | 'loyalty_expiry'
>;

const TRANSACTIONAL: {
  channel: TransactionalChannel;
  copyKey: keyof Pick<
    NotificationsStrings,
    'orderConfirmation' | 'orderShipped' | 'invoice' | 'security' | 'chatReply' | 'loyaltyExpiry'
  >;
}[] = [
  { channel: 'order_confirmation', copyKey: 'orderConfirmation' },
  { channel: 'order_shipped', copyKey: 'orderShipped' },
  { channel: 'invoice', copyKey: 'invoice' },
  { channel: 'security', copyKey: 'security' },
  { channel: 'chat_reply', copyKey: 'chatReply' },
  { channel: 'loyalty_expiry', copyKey: 'loyaltyExpiry' },
];

const MARKETING: {
  channel: Extract<
    NotificationChannel,
    'nouveautes' | 'cart_reminder' | 'favorite_sold' | 'favorite_restock' | 'promo'
  >;
  copyKey: keyof Pick<
    NotificationsStrings,
    'nouveautes' | 'cartReminder' | 'favoriteSold' | 'favoriteRestock' | 'promo'
  >;
}[] = [
  { channel: 'nouveautes', copyKey: 'nouveautes' },
  { channel: 'cart_reminder', copyKey: 'cartReminder' },
  { channel: 'favorite_sold', copyKey: 'favoriteSold' },
  { channel: 'favorite_restock', copyKey: 'favoriteRestock' },
  { channel: 'promo', copyKey: 'promo' },
];

function channelEnabled(prefs: NotificationPreferences, channel: NotificationChannel): boolean {
  if (channel === 'emails_enabled') return prefs.emailsEnabled;
  if (channel in prefs.transactional) {
    return prefs.transactional[channel as keyof NotificationPreferences['transactional']];
  }
  return prefs.marketing[channel as keyof NotificationPreferences['marketing']];
}

export function AccountNotificationsPage() {
  const loyaltyOn = usePluginEnabled('tuucho-commerce-loyalty');
  const storefront = useStorefrontBootstrap();
  const { t } = useLang();
  const n = t.notifications;
  const { authedRequest, user } = useAuthSession();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const [pendingDisable, setPendingDisable] = useState<PendingDisable | null>(null);
  const [saving, setSaving] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sent' | 'limited'>('idle');

  const transactionalChannels = loyaltyOn
    ? TRANSACTIONAL
    : TRANSACTIONAL.filter((entry) => entry.channel !== 'loyalty_expiry');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    (async () => {
      try {
        const result = await authedRequest((token) => authApi.getNotificationPreferences(token));
        if (cancelled) return;
        setPrefs(result);
        setLoadFailed(false);
      } catch {
        if (cancelled) return;
        setPrefs(null);
        setLoadFailed(true);
      } finally {
        if (!cancelled) {
          setLoadedAccountId(user?.id ?? null);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, user?.id]);

  async function applyToggle(channel: NotificationChannel, enabled: boolean) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs((current) => {
      if (!current) return current;
      if (channel === 'emails_enabled') return { ...current, emailsEnabled: enabled };
      if (channel in current.transactional) {
        return {
          ...current,
          transactional: { ...current.transactional, [channel]: enabled },
        };
      }
      return {
        ...current,
        marketing: { ...current.marketing, [channel]: enabled },
      };
    });
    setSaving(true);
    try {
      const result = await authedRequest((token) =>
        authApi.setNotificationPreference(token, channel, enabled),
      );
      setPrefs(result);
    } catch {
      setPrefs(previous);
    } finally {
      setSaving(false);
    }
  }

  function requestToggle(channel: NotificationChannel, enabled: boolean, copy?: NotificationChannelCopy) {
    if (enabled) {
      void applyToggle(channel, true);
      return;
    }
    if (channel === 'emails_enabled') {
      setPendingDisable({
        channel,
        title: n.masterDisableConfirmTitle,
        message: n.masterDisableConfirmMessage,
      });
      return;
    }
    if (!copy) return;
    setPendingDisable({
      channel,
      title: copy.disableConfirmTitle,
      message: copy.disableConfirmMessage,
    });
  }

  async function confirmDisable() {
    if (!pendingDisable) return;
    const { channel } = pendingDisable;
    setPendingDisable(null);
    await applyToggle(channel, false);
  }

  async function handleResendConfirmation() {
    try {
      await authedRequest((token) => authApi.resendEmailConfirmation(token));
      setResendStatus('sent');
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      setResendStatus(err instanceof ApiError && err.code === 'resend_limit_exceeded' ? 'limited' : 'idle');
    }
  }

  return (
    <AccountShell loading={loading || loadedAccountId !== (user?.id ?? null)}>
      <section aria-labelledby="notifications-h" className={addressStyles.section}>
        <Seo title={n.pageTitle} description={n.pageTitle} path="/account/notifications" noindex />
        <LegalPageBackLink placement="top" />
        <h1 id="notifications-h" className={addressStyles.title}>
          {n.pageTitle}
        </h1>

        {loading ? (
          <p className={styles.loading}>{n.loading}</p>
        ) : loadFailed || !prefs ? (
          <p className={styles.loading} role="alert">
            {n.loadError}
          </p>
        ) : (
          <>
            <section className={styles.block} aria-labelledby="notify-emails-h">
              <h2 id="notify-emails-h" className={styles.sectionTitle}>
                {n.emailsSectionTitle}
              </h2>
              <article className={styles.card}>
                <div className={styles.cardTop}>
                  <div>
                    <h3 className={styles.cardTitle}>{n.emailsMasterLabel}</h3>
                    <p className={styles.cardDescription}>{n.emailsMasterDescription}</p>
                  </div>
                  <div className={`${addressStyles.toggleAction} ${addressStyles.courierToggleRow}`}>
                    <ToggleSwitch
                      checked={prefs.emailsEnabled}
                      disabled={saving}
                      aria-label={n.emailsMasterLabel}
                      onChange={(enabled) => requestToggle('emails_enabled', enabled)}
                    />
                  </div>
                </div>
                <div className={styles.primaryRow}>
                  <span className={styles.primaryLabel}>{n.primaryEmailLabel}</span>
                  <span className={styles.primaryEmail}>{prefs.primary.email}</span>
                  <span className={prefs.primary.verified ? styles.badgeVerified : styles.badgeUnverified}>
                    {prefs.primary.verified ? n.verifiedBadge : n.unverifiedBadge}
                  </span>
                </div>
                {!prefs.primary.verified && (
                  <p className={styles.banner} role="status">
                    {n.unverifiedBanner}{' '}
                    <button
                      type="button"
                      className={styles.resendButton}
                      onClick={() => void handleResendConfirmation()}
                    >
                      {t.auth.resendConfirmationButton}
                    </button>
                    {resendStatus === 'sent' && (
                      <span className={styles.resendResult}>{t.auth.resendConfirmationSuccess}</span>
                    )}
                    {resendStatus === 'limited' && (
                      <span className={styles.resendResult}>{t.auth.resendConfirmationLimitReached}</span>
                    )}
                  </p>
                )}
              </article>
            </section>

            <section className={styles.block} aria-labelledby="notify-tx-h">
              <h2 id="notify-tx-h" className={styles.sectionTitle}>
                {n.transactionalSectionTitle}
              </h2>
              <div className={styles.groupedCard}>
                {transactionalChannels.map(({ channel, copyKey }) => {
                  const copy = n[copyKey];
                  const enabled = channelEnabled(prefs, channel);
                  return (
                    <article key={channel} className={styles.entry}>
                      <div className={styles.cardTop}>
                        <div>
                          <h3 className={styles.cardTitle}>{copy.title}</h3>
                          <p className={styles.cardDescription}>{copy.description}</p>
                        </div>
                        <div className={`${addressStyles.toggleAction} ${addressStyles.courierToggleRow}`}>
                          <ToggleSwitch
                            checked={enabled}
                            disabled={saving}
                            aria-label={copy.title}
                            onChange={(next) => requestToggle(channel, next, copy)}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className={styles.block} aria-labelledby="notify-mkt-h">
              <h2 id="notify-mkt-h" className={styles.sectionTitle}>
                {n.marketingSectionTitle}
              </h2>
              <div className={styles.groupedCard}>
                {MARKETING.map(({ channel, copyKey }) => {
                  const copy = n[copyKey];
                  const enabled = channelEnabled(prefs, channel);
                  return (
                    <article key={channel} className={styles.entry}>
                      <div className={styles.cardTop}>
                        <div>
                          <h3 className={styles.cardTitle}>{copy.title}</h3>
                          <p className={styles.cardDescription}>{copy.description}</p>
                        </div>
                        <div className={`${addressStyles.toggleAction} ${addressStyles.courierToggleRow}`}>
                          <ToggleSwitch
                            checked={enabled}
                            disabled={saving}
                            aria-label={copy.title}
                            onChange={(next) => requestToggle(channel, next, copy)}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            <OpeningEntries entries={storefront.openings?.notifications} />
            <PluginSlot name={CORE_FRONT_SLOTS.accountNotifications} />
          </>
        )}
        <LegalPageBackLink placement="bottom" />
      </section>

      {pendingDisable && (
        <ConfirmModal
          variant="dialog"
          title={pendingDisable.title}
          message={pendingDisable.message}
          confirmLabel={n.disableConfirmButton}
          closeLabel={t.auth.closeAria}
          onConfirm={() => void confirmDisable()}
          onCancel={() => setPendingDisable(null)}
        />
      )}
    </AccountShell>
  );
}
