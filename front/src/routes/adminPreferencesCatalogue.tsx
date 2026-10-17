import { useState } from 'react';
import { patchAdminPreferences, type AdminPreferences } from '../api/admin/commerce';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useAdminStrings } from '../assets/i18n/admin';
import styles from './AdminPreferencesPage.module.css';
import { ToggleRow } from './adminPreferencesToggles';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';

/** Sold-out catalogue and the composition page. Split out of
 * AdminPreferencesPage.tsx (size ratchet). */
export function AdminPreferencesCatalogue(props: {
  preferences: AdminPreferences;
  busy: boolean;
  save: (patch: Parameters<typeof patchAdminPreferences>[1], label: string) => Promise<void>;
}) {
  const { preferences, busy, save } = props;
  const a = useAdminStrings();
  const requestsOn = usePluginEnabled('commerce-product-requests');
  const [pendingOutOfStock, setPendingOutOfStock] = useState<{ next: boolean } | null>(null);
  const [pendingSizeRequest, setPendingSizeRequest] = useState<{ next: boolean } | null>(null);

  return (
    <>
      <section className={styles.panel} aria-labelledby="prefs-out-of-stock">
        <h2 id="prefs-out-of-stock" className={styles.panelTitle}>
          {a.prefs.outOfStockTitle}
        </h2>
        <p className={styles.panelHint}>{a.prefs.outOfStockHint}</p>
        <ToggleRow
          title={a.prefs.showSoldOut}
          hint={a.prefs.showSoldOutHint}
          checked={preferences.outOfStockEnabled !== false}
          disabled={busy}
          onChange={(checked) => setPendingOutOfStock({ next: checked })}
        />
        {requestsOn ? (
          <ToggleRow
            title={a.prefs.allowSizeRequest}
            hint={a.prefs.allowSizeRequestHint}
            checked={preferences.outOfStockSizeRequestEnabled !== false}
            disabled={busy}
            onChange={(checked) => setPendingSizeRequest({ next: checked })}
          />
        ) : null}
      </section>

      {pendingOutOfStock && (
        <ConfirmModal
          title={pendingOutOfStock.next ? a.prefs.showSoldOutTitle : a.prefs.hideSoldOutTitle}
          message={pendingOutOfStock.next ? a.prefs.showSoldOutMessage : a.prefs.hideSoldOutMessage}
          confirmLabel={pendingOutOfStock.next ? a.prefs.show : a.prefs.hide}
          closeLabel={a.prefs.close}
          confirmDanger={!pendingOutOfStock.next}
          onConfirm={() => {
            const next = pendingOutOfStock.next;
            setPendingOutOfStock(null);
            void save({ outOfStockEnabled: next }, 'outOfStockEnabled');
          }}
          onCancel={() => setPendingOutOfStock(null)}
        />
      )}

      {requestsOn && pendingSizeRequest && (
        <ConfirmModal
          title={pendingSizeRequest.next ? a.prefs.allowSizeRequestTitle : a.prefs.blockSizeRequestTitle}
          message={
            pendingSizeRequest.next ? a.prefs.allowSizeRequestMessage : a.prefs.blockSizeRequestMessage
          }
          confirmLabel={pendingSizeRequest.next ? a.prefs.allow : a.prefs.turnOff}
          closeLabel={a.prefs.close}
          confirmDanger={!pendingSizeRequest.next}
          onConfirm={() => {
            const next = pendingSizeRequest.next;
            setPendingSizeRequest(null);
            void save({ outOfStockSizeRequestEnabled: next }, 'outOfStockSizeRequestEnabled');
          }}
          onCancel={() => setPendingSizeRequest(null)}
        />
      )}

    </>
  );
}
