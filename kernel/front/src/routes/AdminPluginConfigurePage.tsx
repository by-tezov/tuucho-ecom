import { Suspense, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { AdminDetailBar } from '../components/admin/AdminDetailBar';
import { useAuthSession } from '../state/AuthContext';
import { useAdminStrings } from '../assets/i18n/admin';
import { pluginConfigureElement } from '../plugins/PluginHost';
import { pluginHasConfigure } from './pluginConfigure';
import {
  getAdminPlugin,
  getAdminStore,
  patchAdminPlugin,
  patchAdminStore,
  type AdminPlugin,
} from '../api/admin/shopSetup';
import { useRefreshStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import { adminPath } from '../utils/adminRoute';
import { NotFoundPage } from './NotFoundPage';
import styles from './AdminPlugins.module.css';

const DEFAULT_THEME_TOKENS: Record<string, string> = {
  '--color-bg': '#ffffff',
  '--color-ink': '#1a1a1a',
  '--color-accent': '#121212',
};

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

  const frontConfigure = pluginConfigureElement(plugin.id);

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

      {frontConfigure ? (
        <Suspense fallback={<p className={styles.hint}>{w.loadError}</p>}>{frontConfigure}</Suspense>
      ) : plugin.manifest.kind === 'theme' ? (
        <ThemeForm
          labels={w}
          tokens={themeTokens}
          onChange={(tokens) => {
            setThemeTokens(tokens);
            applyThemeTokens(tokens);
          }}
          onSave={() => void save((token) => patchAdminStore(token, { theme: { tokens: themeTokens } }))}
        />
      ) : (
        <SettingsForm
          labels={w}
          plugin={plugin}
          onSave={(settings) => void save((token) => patchAdminPlugin(token, plugin.id, { settings }))}
        />
      )}
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
