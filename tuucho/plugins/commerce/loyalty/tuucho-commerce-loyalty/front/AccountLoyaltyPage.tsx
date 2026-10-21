import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import type { Strings, Lang } from '@kernel/front/assets/i18n/types';
import { useAuthSession } from '@kernel/front/state/AuthContext';
import { Seo } from '@kernel/front/components/seo/Seo';
import { LegalPageBackLink } from '@kernel/front/components/layout/LegalPageBackLink';
import { AccountShell } from '@kernel/front/components/account/AccountShell';
import * as authApi from '@kernel/front/api/loyalty';
import { localizedPath } from '@kernel/front/config/i18nRoutes';
import { formatPrice } from '@kernel/front/utils/formatPrice';
import addressStyles from '@kernel/front/routes/AccountAddressesPage.module.css';
import styles from './AccountLoyaltyPage.module.css';
import { usePluginEnabled } from '@kernel/front/plugins/StorefrontBootstrap';
import { NotFoundPage } from '@kernel/front/routes/NotFoundPage';

function formatWalletDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  );
}

function loyaltyLedgerKindLabel(kind: authApi.LoyaltyLedgerKind, t: Strings): string {
  switch (kind) {
    case 'earn':
      return t.loyalty.ledgerKindEarn;
    case 'spend':
      return t.loyalty.ledgerKindSpend;
    case 'spend_refund':
      return t.loyalty.ledgerKindSpendRefund;
    case 'expire':
      return t.loyalty.ledgerKindExpire;
    case 'earn_reversal':
      return t.loyalty.ledgerKindEarnReversal;
    case 'credit_manual':
      return t.loyalty.ledgerKindCreditManual;
    case 'uncredit_manual':
      return t.loyalty.ledgerKindUncreditManual;
  }
}

export function AccountLoyaltyPage() {
  const loyaltyOn = usePluginEnabled('tuucho-commerce-loyalty');
  const { t, lang } = useLang();
  const { authedRequest } = useAuthSession();
  const [wallet, setWallet] = useState<authApi.LoyaltyWalletSummary | null>(null);
  const [ledger, setLedger] = useState<authApi.LoyaltyLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!loyaltyOn) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [walletResult, ledgerResult] = await Promise.all([
          authedRequest((token) => authApi.getLoyaltyWallet(token)),
          authedRequest((token) => authApi.listLoyaltyLedger(token, 1, 20)),
        ]);
        if (cancelled) return;
        setWallet(walletResult.wallet);
        setLedger(ledgerResult.entries);
        setLoadFailed(false);
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          setWallet(null);
          setLedger([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, loyaltyOn]);

  if (!loyaltyOn) return <NotFoundPage />;

  return (
    <AccountShell>
      <section
        aria-labelledby="loyalty-h"
        className={addressStyles.section}
        data-testid="account-loyalty-page"
      >
        <Seo title={t.loyalty.pageTitle} description={t.loyalty.pageTitle} path="/account/loyalty" noindex />
        <LegalPageBackLink placement="top" />
        <h1 id="loyalty-h" className={addressStyles.title}>
          {t.loyalty.pageTitle}
        </h1>
        <p className={addressStyles.subtitle}>{t.loyalty.pageSubtitle}</p>

        {loading ? (
          <p className={styles.muted}>{t.notifications.loading}</p>
        ) : loadFailed ? (
          <p className={styles.error} role="alert">
            {t.loyalty.walletLoadError}
          </p>
        ) : wallet ? (
          <>
            <dl className={styles.metrics}>
              <div>
                <dt>{t.loyalty.walletAvailable}</dt>
                <dd>{formatPrice(wallet.available)}</dd>
              </div>
              {wallet.coming > 0 && (
                <div>
                  <dt>{t.loyalty.walletComing}</dt>
                  <dd>{formatPrice(wallet.coming)}</dd>
                </div>
              )}
              {wallet.burned > 0 && (
                <div>
                  <dt>{t.loyalty.walletBurned}</dt>
                  <dd>{formatPrice(wallet.burned)}</dd>
                </div>
              )}
            </dl>

            {(wallet.burnNoticeAmount ?? 0) > 0 && wallet.burnNoticeExpiresAt ? (
              <p className={styles.burnNotice} role="status">
                {t.loyalty.walletBurnNotice(
                  formatPrice(wallet.burnNoticeAmount!),
                  formatWalletDate(wallet.burnNoticeExpiresAt, lang),
                )}
              </p>
            ) : null}

            {wallet.coming > 0 && (
              <p className={styles.ordersLinkWrap}>
                <Link className={styles.ordersLink} to={localizedPath('/orders', lang)}>
                  {t.loyalty.walletOrdersLink}
                </Link>
              </p>
            )}

            <h2 className={styles.ledgerTitle}>{t.loyalty.walletLedgerTitle}</h2>
            {ledger.length === 0 ? (
              <p className={styles.muted}>{t.loyalty.ledgerEmpty}</p>
            ) : (
              <ul className={styles.ledger}>
                {ledger.map((entry) => (
                  <li key={entry.id}>
                    <span className={styles.ledgerKind}>{loyaltyLedgerKindLabel(entry.kind, t)}</span>
                    <span className={styles.ledgerAmount}>
                      {entry.amount >= 0 ? '+' : '−'}
                      {formatPrice(Math.abs(entry.amount))}
                    </span>
                    <time dateTime={entry.createdAt}>{formatWalletDate(entry.createdAt, lang)}</time>
                    {entry.orderNumber ? (
                      <Link className={styles.ledgerOrder} to={localizedPath('/orders', lang)}>
                        {t.loyalty.ledgerOrder(entry.orderNumber)}
                      </Link>
                    ) : null}
                    {entry.reason ? <span className={styles.ledgerReason}>{entry.reason}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className={styles.muted}>{t.loyalty.walletEmpty}</p>
        )}

        <LegalPageBackLink placement="bottom" />
      </section>
    </AccountShell>
  );
}
