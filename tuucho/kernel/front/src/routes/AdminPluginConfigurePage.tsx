import { Suspense, useEffect, useId, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingModal } from '../components/ui/LoadingModal';
import { StatusModal } from '../components/ui/StatusModal';
import { ColorField } from '../components/ui/ColorField';
import { Field } from '../components/ui/Field';
import { FormSection } from '../components/ui/FormSection';
import { SecretField } from '../components/ui/SecretField';
import { SelectField } from '../components/ui/SelectField';
import { TextareaField } from '../components/ui/TextareaField';
import { TextField } from '../components/ui/TextField';
import { SegmentedSwitch } from '../components/ui/SegmentedSwitch';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { AdminDetailBar } from '../components/admin/AdminDetailBar';
import { AdminPluginConfigFiles } from './AdminPluginConfigFiles';
import { useAuthSession } from '../state/AuthContext';
import { useAdminStrings } from '../assets/i18n/admin';
import { pluginConfigureElement, pluginConfigureTab } from '../plugins/PluginHost';
import { pluginHasConfigure } from './pluginConfigure';
import { groupSettingsFields, settingFieldKeys, type SettingsFieldSpec } from './pluginSettingsForm';
import {
  getAdminPlugin,
  getAdminStore,
  patchAdminPlugin,
  patchAdminStore,
  type AdminPlugin,
} from '../api/admin/shopSetup';
import { shopConfig } from '../config/env';
import { withMinDuration } from '../utils/withMinDuration';
import { useRefreshStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import { adminPath } from '../utils/adminRoute';
import { NotFoundPage } from './NotFoundPage';
import styles from './AdminPlugins.module.css';

type ActionResult = { tone: 'success' | 'error'; message: string };

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
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<ActionResult | null>(null);
  const [themeTokens, setThemeTokens] = useState(DEFAULT_THEME_TOKENS);
  const [configureTab, setConfigureTab] = useState<'settings' | 'extra'>('settings');

  async function reload() {
    if (!pluginId) return;
    try {
      const result = await authedRequest((token) => getAdminPlugin(token, pluginId));
      setPlugin(result.plugin);
      setMissing(false);
      if (result.plugin.manifest.kinds.includes('theme')) {
        const store = await authedRequest((token) => getAdminStore(token));
        setThemeTokens({ ...DEFAULT_THEME_TOKENS, ...(store.theme.tokens ?? {}) });
      }
    } catch {
      setMissing(true);
    }
  }

  useEffect(() => {
    setConfigureTab('settings');
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authedRequest, pluginId]);

  useEffect(() => {
    function onSaved(event: Event) {
      const detail = (event as CustomEvent<{ pluginId?: string }>).detail;
      if (detail?.pluginId === pluginId) void reload();
    }
    window.addEventListener('tuucho-plugin-config-saved', onSaved);
    return () => window.removeEventListener('tuucho-plugin-config-saved', onSaved);
    // Same as the load effect: reload is stable for this pluginId session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId]);

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
  const extraTabFallback = pluginConfigureTab(plugin.id);
  const extraTabLabel = extraTabFallback
    ? ((a as { configureTabs?: Record<string, string> }).configureTabs?.[plugin.id] ?? extraTabFallback)
    : null;

  if (!pluginHasConfigure(plugin)) return <Navigate to={adminPath('/plugins')} replace />;

  async function save(work: (token: string) => Promise<unknown>) {
    setSaveResult(null);
    setSaving(true);
    try {
      await withMinDuration(authedRequest(work), shopConfig.loadingMinMs.short);
      await reload();
      refreshBootstrap();
      setSaveResult({ tone: 'success', message: w.saved });
    } catch {
      setSaveResult({ tone: 'error', message: w.saveError });
    } finally {
      setSaving(false);
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
      {saving ? <LoadingModal message={w.savingPlugin} /> : null}
      {saveResult && !saving ? (
        saveResult.tone === 'success' ? (
          <StatusModal message={saveResult.message} onClose={() => setSaveResult(null)} />
        ) : (
          <ConfirmModal
            variant="dialog"
            title={saveResult.message}
            message={null}
            confirmLabel={w.applyDismiss}
            closeIcon={false}
            onConfirm={() => setSaveResult(null)}
            onCancel={() => setSaveResult(null)}
          />
        )
      ) : null}

      <AdminPluginConfigFiles
        plugin={plugin}
        onReloaded={(next) => {
          setPlugin(next);
          refreshBootstrap();
        }}
      />
      {extraTabLabel ? (
        <SegmentedSwitch
          ariaLabel={plugin.manifest.name}
          activeKey={configureTab}
          onSelect={(key) => setConfigureTab(key === 'extra' ? 'extra' : 'settings')}
          options={[
            { key: 'settings', label: w.settings },
            { key: 'extra', label: extraTabLabel },
          ]}
        />
      ) : null}
      {plugin.manifest.kinds.includes('theme') ? (
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
        <>
          {configureTab === 'settings' || !extraTabLabel ? (
            <SettingsForm
              labels={w}
              plugin={plugin}
              onSave={(settings) => void save((token) => patchAdminPlugin(token, plugin.id, { settings }))}
            />
          ) : null}
          {frontConfigure && (configureTab === 'extra' || !extraTabLabel) ? (
            <Suspense fallback={<p className={styles.hint}>{w.loadError}</p>}>{frontConfigure}</Suspense>
          ) : null}
        </>
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
    <>
      <FormSection title={labels.tabTheme} description={labels.themeIntro}>
        {fields.map(([token, label]) => (
          <ColorField
            key={token}
            label={label}
            value={tokens[token] ?? DEFAULT_THEME_TOKENS[token] ?? '#121212'}
            hexLabel={labels.hex}
            onChange={(next) => onChange({ ...tokens, [token]: next })}
          />
        ))}
      </FormSection>
      <div className={styles.toolbar}>
        <Button type="button" onClick={onSave}>
          {labels.saveAction}
        </Button>
      </div>
    </>
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
  const keys = settingFieldKeys(plugin);
  const [draft, setDraft] = useState<Record<string, unknown>>(plugin.settings ?? {});
  const [secretDraft, setSecretDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft(plugin.settings ?? {});
    setSecretDraft({});
  }, [plugin]);
  if (keys.length === 0) return null;
  const groups = groupSettingsFields(keys, schema, labels.settings);

  function commit() {
    const payload: Record<string, unknown> = { ...draft };
    for (const [key, spec] of Object.entries(schema)) {
      if (spec?.hidden) delete payload[key];
    }
    for (const key of keys) {
      if (schema[key]?.type !== 'secret') continue;
      const next = secretDraft[key]?.trim() ?? '';
      if (next) payload[key] = next;
      else delete payload[key];
    }
    onSave(payload);
  }

  return (
    <>
      {groups.map((group) => (
        <FormSection key={group.id || 'settings'} title={group.title} description={group.description}>
          {group.keys.map((key) => (
            <SettingControl
              key={key}
              fieldKey={key}
              spec={schema[key]}
              value={draft[key]}
              secretValue={secretDraft[key] ?? ''}
              secretIsSet={plugin.secretKeys?.includes(key) === true}
              labels={labels}
              onChange={(next) => setDraft({ ...draft, [key]: next })}
              onSecretChange={(next) => setSecretDraft({ ...secretDraft, [key]: next })}
            />
          ))}
        </FormSection>
      ))}
      <div className={styles.toolbar}>
        <Button type="button" onClick={commit}>
          {labels.saveAction}
        </Button>
      </div>
    </>
  );
}

function SettingControl({
  fieldKey,
  spec,
  value,
  secretValue,
  secretIsSet,
  labels,
  onChange,
  onSecretChange,
}: {
  fieldKey: string;
  spec: SettingsFieldSpec | undefined;
  value: unknown;
  secretValue: string;
  secretIsSet: boolean;
  labels: ReturnType<typeof useAdminStrings>['whiteLabel'];
  onChange: (value: unknown) => void;
  onSecretChange: (value: string) => void;
}) {
  const id = `${useId()}-${fieldKey}`;
  const label = spec?.label?.trim() || fieldKey;
  const description = spec?.description?.trim() || undefined;
  const describedBy = description ? `${id}-hint` : undefined;
  const type = spec?.type;

  if (type === 'boolean' || (type == null && typeof value === 'boolean')) {
    return (
      <Field label={label} description={description} layout="inline">
        <ToggleSwitch
          checked={Boolean(value)}
          aria-label={label}
          onChange={(checked) => onChange(checked)}
        />
      </Field>
    );
  }

  if (type === 'secret') {
    return (
      <SecretField
        label={label}
        description={description}
        isSet={secretIsSet}
        value={secretValue}
        onChange={onSecretChange}
        long={spec?.long === true}
        setLabel={labels.secretSet}
        notSetLabel={labels.secretNotSet}
        placeholder={spec?.placeholder ?? labels.secretReplacePlaceholder}
      />
    );
  }

  if (type === 'number' || (type == null && typeof value === 'number')) {
    return (
      <Field label={label} description={description} htmlFor={id}>
        <TextField
          id={id}
          type="number"
          value={typeof value === 'number' || typeof value === 'string' ? String(value) : '0'}
          onChange={(next) => onChange(next === '' ? 0 : Number(next))}
          aria-describedby={describedBy}
        />
      </Field>
    );
  }

  if (spec?.options && spec.options.length > 0) {
    return (
      <SelectField
        label={label}
        description={description}
        options={spec.options}
        value={String(value ?? spec.options[0]?.value ?? '')}
        onChange={onChange}
      />
    );
  }

  if (type === 'text') {
    const shown = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
    return (
      <Field label={label} description={description} htmlFor={id}>
        <TextareaField
          id={id}
          value={shown}
          onChange={onChange}
          placeholder={spec?.placeholder}
          size="compact"
          aria-describedby={describedBy}
        />
      </Field>
    );
  }

  const inputType = type === 'url' ? 'url' : type === 'email' ? 'email' : 'text';
  return (
    <Field label={label} description={description} htmlFor={id}>
      <TextField
        id={id}
        type={inputType}
        value={String(value ?? '')}
        onChange={onChange}
        placeholder={spec?.placeholder}
        spellCheck={false}
        aria-describedby={describedBy}
      />
    </Field>
  );
}

function applyThemeTokens(tokens: Record<string, string>): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(tokens)) {
    if (!name.startsWith('--') || !value) continue;
    root.style.setProperty(name, value);
  }
}
