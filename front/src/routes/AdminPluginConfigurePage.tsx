import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { AdminDetailBar } from '../components/admin/AdminDetailBar';
import { useAuthSession } from '../state/AuthContext';
import { useAdminStrings } from '../assets/i18n/admin';
import { pluginHasConfigure } from './pluginConfigure';
import {
  getAdminPlugin,
  getAdminStore,
  patchAdminPlugin,
  patchAdminStore,
  type AdminPlugin,
  type AdminPluginRate,
  type CourierPriceValue,
} from '../api/admin/shopSetup';
import { getAdminPreferences, patchAdminPreferences, type AdminPreferences } from '../api/admin/commerce';
import { useRefreshStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import { adminPath } from '../utils/adminRoute';
import { NotFoundPage } from './NotFoundPage';
import styles from './AdminPlugins.module.css';

const DEFAULT_THEME_TOKENS: Record<string, string> = {
  '--color-bg': '#ffffff',
  '--color-ink': '#1a1a1a',
  '--color-accent': '#121212',
};

const PAYMENT_KEYS = [
  ['paymentCardEnabled', 'cardTitle'],
  ['paymentPaypalEnabled', 'paypalHint'],
  ['paymentBancontactEnabled', 'bancontactHint'],
  ['paymentGooglePayEnabled', 'googlePayHint'],
  ['paymentApplePayEnabled', 'applePayHint'],
] as const;

export function AdminPluginConfigurePage() {
  const { pluginId } = useParams();
  const navigate = useNavigate();
  const a = useAdminStrings();
  const w = a.whiteLabel;
  const { authedRequest } = useAuthSession();
  const refreshBootstrap = useRefreshStorefrontBootstrap();
  const [plugin, setPlugin] = useState<AdminPlugin | null>(null);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [themeTokens, setThemeTokens] = useState(DEFAULT_THEME_TOKENS);
  const [prefs, setPrefs] = useState<AdminPreferences | null>(null);

  async function reload() {
    if (!pluginId) return;
    try {
      const result = await authedRequest((token) => getAdminPlugin(token, pluginId));
      setPlugin(result.plugin);
      setMissing(false);
      setError('');
      if (result.plugin.manifest.kind === 'theme') {
        const store = await authedRequest((token) => getAdminStore(token));
        setThemeTokens({ ...DEFAULT_THEME_TOKENS, ...(store.theme.tokens ?? {}) });
      }
      if (result.plugin.id === 'payment-stripe') {
        const prefRes = await authedRequest((token) => getAdminPreferences(token));
        setPrefs(prefRes.preferences);
      }
    } catch {
      setMissing(true);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authedRequest, pluginId]);

  if (missing) return <NotFoundPage />;
  if (!plugin) {
    return (
      <div className={styles.page}>
        <Seo
          title={w.configure}
          description={w.pluginsNavDescription}
          path={`/admin/plugins/${pluginId ?? ''}`}
        />
        <p className={styles.hint}>{w.loadError}</p>
      </div>
    );
  }

  if (plugin.id === 'docs-developer') return <Navigate to={adminPath('/docs')} replace />;
  if (plugin.id === 'commerce-vouchers') return <Navigate to={adminPath('/vouchers')} replace />;
  if (plugin.id === 'commerce-cart-rules') return <Navigate to={adminPath('/cart-rules')} replace />;
  if (!pluginHasConfigure(plugin)) return <Navigate to={adminPath('/plugins')} replace />;

  async function save(work: (token: string) => Promise<unknown>) {
    setNotice('');
    setError('');
    try {
      await authedRequest(work);
      await reload();
      refreshBootstrap();
      setNotice(w.saved);
    } catch {
      setError(w.saveError);
    }
  }

  return (
    <div className={styles.page}>
      <Seo
        title={`${w.configure}: ${plugin.manifest.name}`}
        description={plugin.manifest.description}
        path={`/admin/plugins/${plugin.id}`}
      />
      <AdminDetailBar backLabel={a.cronLogs.back} onBack={() => navigate(adminPath('/plugins'))} />
      <h1 className={styles.title}>{plugin.manifest.name}</h1>
      <p className={styles.intro}>{plugin.manifest.description}</p>
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {plugin.manifest.kind === 'theme' ? (
        <ThemeForm
          labels={w}
          tokens={themeTokens}
          onChange={(tokens) => {
            setThemeTokens(tokens);
            applyThemeTokens(tokens);
          }}
          onSave={() => void save((token) => patchAdminStore(token, { theme: { tokens: themeTokens } }))}
        />
      ) : null}

      {plugin.manifest.kind === 'shipping' ? (
        <RatesForm
          labels={w}
          rates={plugin.rates}
          onChange={(rates) => setPlugin({ ...plugin, rates })}
          onSave={() =>
            void save((token) =>
              patchAdminPlugin(token, plugin.id, {
                rates: plugin.rates.map((row) => ({
                  code: row.code,
                  packets: row.packets.map((packet) => ({ key: packet.key, price: packet.price })),
                })),
              }),
            )
          }
        />
      ) : null}

      {plugin.id === 'payment-stripe' && prefs ? (
        <PaymentForm
          labels={w}
          prefs={a.prefs}
          values={prefs}
          onToggle={(key, enabled) => {
            setPrefs({ ...prefs, [key]: enabled });
            void save((token) => patchAdminPreferences(token, { [key]: enabled }));
          }}
        />
      ) : null}

      {plugin.manifest.kind === 'page' || plugin.manifest.kind === 'generic' ? (
        <SettingsForm
          labels={w}
          plugin={plugin}
          onSave={(settings) => void save((token) => patchAdminPlugin(token, plugin.id, { settings }))}
        />
      ) : null}
    </div>
  );
}

function ThemeForm({
  labels,
  tokens,
  onChange,
  onSave,
}: {
  labels: ReturnType<typeof useAdminStrings>['whiteLabel'];
  tokens: Record<string, string>;
  onChange: (tokens: Record<string, string>) => void;
  onSave: () => void;
}) {
  const fields = [
    ['--color-accent', labels.accent],
    ['--color-bg', labels.background],
    ['--color-ink', labels.ink],
  ] as const;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{labels.tabTheme}</h2>
      <p className={styles.hint}>{labels.themeIntro}</p>
      <div className={styles.formGrid}>
        {fields.map(([token, label]) => {
          const value = toColorInput(tokens[token] ?? DEFAULT_THEME_TOKENS[token] ?? '#121212');
          return (
            <label key={token} className={styles.field}>
              <span className={styles.fieldLabel}>{label}</span>
              <div className={styles.colorRow}>
                <input
                  type="color"
                  value={value}
                  aria-label={label}
                  onChange={(event) => onChange({ ...tokens, [token]: event.target.value })}
                />
                <input
                  type="text"
                  value={value}
                  spellCheck={false}
                  aria-label={labels.hex}
                  onChange={(event) => {
                    const next = event.target.value.trim();
                    if (/^#[0-9a-fA-F]{0,6}$/.test(next)) onChange({ ...tokens, [token]: next });
                  }}
                />
              </div>
            </label>
          );
        })}
      </div>
      <div className={styles.toolbar}>
        <Button type="button" onClick={onSave}>
          {labels.saveAction}
        </Button>
      </div>
    </section>
  );
}

function RatesForm({
  labels,
  rates,
  onChange,
  onSave,
}: {
  labels: ReturnType<typeof useAdminStrings>['whiteLabel'];
  rates: AdminPluginRate[];
  onChange: (rates: AdminPluginRate[]) => void;
  onSave: () => void;
}) {
  function setPrice(code: string, key: string, price: CourierPriceValue) {
    onChange(
      rates.map((row) =>
        row.code !== code
          ? row
          : {
              ...row,
              packets: row.packets.map((packet) => (packet.key === key ? { ...packet, price } : packet)),
            },
      ),
    );
  }
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{labels.rates}</h2>
      {rates.map((rate) => (
        <div key={rate.code} className={styles.rateCard}>
          <div className={styles.rateHead}>
            <strong>{rate.name}</strong>
            <span className={styles.rateCode}>{rate.code}</span>
          </div>
          {rate.packets.map((packet) => {
            const price = packet.price;
            return (
              <div key={packet.key} className={styles.packet}>
                <strong>{packet.key}</strong>
                <span className={styles.hint}>{labels.packetMax(packet.maxQuantity)}</span>
                {typeof price === 'number' ? (
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{labels.price}</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={price}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next) && next > 0) setPrice(rate.code, packet.key, next);
                      }}
                    />
                  </label>
                ) : (
                  <div className={styles.countries}>
                    {Object.keys(price)
                      .sort()
                      .map((code) => (
                        <label key={code} className={styles.field}>
                          <span className={styles.fieldLabel}>
                            {labels.price} {code}
                          </span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={price[code]}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (Number.isFinite(next) && next > 0) {
                                setPrice(rate.code, packet.key, { ...price, [code]: next });
                              }
                            }}
                          />
                        </label>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div className={styles.toolbar}>
        <Button type="button" onClick={onSave}>
          {labels.saveAction}
        </Button>
      </div>
    </section>
  );
}

function PaymentForm({
  labels,
  prefs,
  values,
  onToggle,
}: {
  labels: ReturnType<typeof useAdminStrings>['whiteLabel'];
  prefs: ReturnType<typeof useAdminStrings>['prefs'];
  values: AdminPreferences;
  onToggle: (key: (typeof PAYMENT_KEYS)[number][0], enabled: boolean) => void;
}) {
  const titles: Record<(typeof PAYMENT_KEYS)[number][0], string> = {
    paymentCardEnabled: prefs.cardTitle,
    paymentPaypalEnabled: 'PayPal',
    paymentBancontactEnabled: 'Bancontact',
    paymentGooglePayEnabled: 'Google Pay',
    paymentApplePayEnabled: 'Apple Pay',
  };
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{labels.kindPayment}</h2>
      <p className={styles.hint}>{labels.paymentHint}</p>
      {PAYMENT_KEYS.map(([key]) => (
        <div key={key} className={styles.toggle}>
          <span className={styles.toggleLabel}>{titles[key]}</span>
          <ToggleSwitch
            checked={Boolean(values[key])}
            aria-label={titles[key]}
            onChange={(checked) => onToggle(key, checked)}
          />
        </div>
      ))}
    </section>
  );
}

function SettingsForm({
  labels,
  plugin,
  onSave,
}: {
  labels: ReturnType<typeof useAdminStrings>['whiteLabel'];
  plugin: AdminPlugin;
  onSave: (settings: Record<string, unknown>) => void;
}) {
  const schema = plugin.manifest.settingsSchema ?? {};
  const keys = Object.keys(schema).length > 0 ? Object.keys(schema) : Object.keys(plugin.settings ?? {});
  const [draft, setDraft] = useState<Record<string, unknown>>(plugin.settings ?? {});
  useEffect(() => {
    setDraft(plugin.settings ?? {});
  }, [plugin]);
  if (keys.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{labels.settings}</h2>
      <div className={styles.formGrid}>
        {keys.map((key) => {
          const spec = schema[key];
          const label = spec?.label ?? key;
          const value = draft[key];
          if (spec?.type === 'boolean' || typeof value === 'boolean') {
            return (
              <div key={key} className={styles.toggle}>
                <span className={styles.toggleLabel}>{label}</span>
                <ToggleSwitch
                  checked={Boolean(value)}
                  aria-label={label}
                  onChange={(checked) => setDraft({ ...draft, [key]: checked })}
                />
              </div>
            );
          }
          if (spec?.type === 'number' || typeof value === 'number') {
            return (
              <label key={key} className={styles.field}>
                <span className={styles.fieldLabel}>{label}</span>
                <input
                  type="number"
                  value={typeof value === 'number' ? value : Number(value) || 0}
                  onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })}
                />
              </label>
            );
          }
          const rows = spec?.type === 'text' || key === 'body' ? 6 : 2;
          return (
            <label key={key} className={styles.field}>
              <span className={styles.fieldLabel}>{label}</span>
              <textarea
                rows={rows}
                value={String(value ?? '')}
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
              />
            </label>
          );
        })}
      </div>
      <div className={styles.toolbar}>
        <Button type="button" onClick={() => onSave(draft)}>
          {labels.saveAction}
        </Button>
      </div>
    </section>
  );
}

function toColorInput(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return '#121212';
}

function applyThemeTokens(tokens: Record<string, string>): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(tokens)) {
    if (!name.startsWith('--') || !value) continue;
    root.style.setProperty(name, value);
  }
}
