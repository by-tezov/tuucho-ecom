import { useEffect, useState } from 'react';
import {
  getCourierCatalog,
  putCourierCatalogCountry,
  putCourierCatalogCourier,
  putCourierCatalogMeasurements,
  putCourierCatalogNetwork,
  type CourierCatalogDocument,
} from '../api/admin/courierCatalog';
import { ApiError } from '../api/errors';
import { useAdminStrings } from '../assets/i18n/admin';
import { useLang } from '../assets/i18n';
import { AdminDetailBar } from '../components/admin/AdminDetailBar';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { LoadingModal } from '../components/ui/LoadingModal';
import { shopConfig } from '../config/env';
import { useAuthSession } from '../state/AuthContext';
import { adminPath } from '../utils/adminRoute';
import {
  CourierJsonFormatError,
  courierEditorDocument,
  formatCourierJson,
  parseCourierJson,
  type CourierEditor,
} from '../utils/courierCatalogJson';
import { withMinDuration } from '../utils/withMinDuration';
import styles from './AdminCourierCatalogPage.module.css';

function SectionRule({ title }: { title: string }) {
  return (
    <h2 className={styles.rule}>
      <span>{title}</span>
    </h2>
  );
}

function FormatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M7 3.25c-1.15 0-1.75.7-1.75 1.7v1.35c0 .62-.28.95-.9 1.2.62.25.9.58.9 1.2v1.35c0 1 .6 1.7 1.75 1.7M11 3.25c1.15 0 1.75.7 1.75 1.7v1.35c0 .62.28.95.9 1.2-.62.25-.9.58-.9 1.2v1.35c0 1-.6 1.7-1.75 1.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KeyList({ keys, onOpen }: { keys: readonly string[]; onOpen: (key: string) => void }) {
  return (
    <ul className={styles.keys}>
      {keys.map((key) => (
        <li key={key}>
          <button type="button" className={styles.key} onClick={() => onOpen(key)}>
            {key}
          </button>
        </li>
      ))}
    </ul>
  );
}

function entryTitle(editor: CourierEditor, measurements: string): string {
  if (editor.kind === 'measurements') return measurements;
  return editor.code;
}

/** One JSON document per courier, country, network, and the parcel file. */
export function AdminCourierCatalogPage() {
  const { t } = useLang();
  const a = useAdminStrings();
  const c = a.courier;
  const pe = a.productEditor;
  const { authedRequest } = useAuthSession();
  const [catalog, setCatalog] = useState<CourierCatalogDocument | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<CourierEditor | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editor) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setIndexError(null);
      try {
        const result = await withMinDuration(
          authedRequest((token) => getCourierCatalog(token)),
          shopConfig.loadingMinMs.normal,
        );
        if (!cancelled) setCatalog(result);
      } catch {
        if (!cancelled) setIndexError(c.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, editor, c.loadError]);

  function openEditor(next: CourierEditor) {
    if (!catalog) return;
    setEditor(next);
    setFieldError(null);
    setJsonText(formatCourierJson(JSON.stringify(courierEditorDocument(next, catalog))));
  }

  function onFormat() {
    try {
      setJsonText(formatCourierJson(jsonText));
      setFieldError(null);
    } catch (error) {
      if (error instanceof CourierJsonFormatError) setFieldError(pe.formatError);
    }
  }

  async function onSave() {
    if (!editor) return;
    let body: Record<string, unknown>;
    try {
      body = parseCourierJson(jsonText);
    } catch (error) {
      if (error instanceof CourierJsonFormatError) setFieldError(pe.formatError);
      return;
    }
    setSaving(true);
    setFieldError(null);
    try {
      const fresh = await withMinDuration(
        authedRequest(async (token) => {
          if (editor.kind === 'courier') await putCourierCatalogCourier(token, editor.code, body);
          else if (editor.kind === 'country') await putCourierCatalogCountry(token, editor.code, body);
          else if (editor.kind === 'network') await putCourierCatalogNetwork(token, editor.code, body);
          else await putCourierCatalogMeasurements(token, body);
          return getCourierCatalog(token);
        }),
        shopConfig.loadingMinMs.normal,
      );
      setCatalog(fresh);
      setJsonText(formatCourierJson(JSON.stringify(courierEditorDocument(editor, fresh))));
    } catch (error) {
      setFieldError(error instanceof ApiError && error.serverMessage ? error.serverMessage : c.saveError);
    } finally {
      setSaving(false);
    }
  }

  const busy = loading || saving;

  return (
    <section className={styles.page}>
      <Seo title={a.nav.courierLabel} description={c.seoDescription} path={adminPath('/couriers')} noindex />
      {editor ? (
        <>
          <h1 className="visuallyHidden">{entryTitle(editor, c.measurements)}</h1>
          <AdminDetailBar
            backLabel={a.nav.courierLabel}
            onBack={() => setEditor(null)}
            disabled={busy}
            end={
              <button
                type="button"
                className={`${styles.formatButton} ${styles.formatInBar}`}
                onClick={onFormat}
                disabled={busy}
                aria-label={pe.format}
                title={pe.format}
              >
                <FormatIcon />
              </button>
            }
          />
          <p className={styles.entry}>{entryTitle(editor, c.measurements)}</p>
          <p className={styles.hint}>{c.hint}</p>
          <div>
            <div className={styles.fieldHead}>
              <button
                type="button"
                className={styles.formatButton}
                onClick={onFormat}
                disabled={busy}
                aria-label={pe.format}
                title={pe.format}
              >
                <FormatIcon />
              </button>
            </div>
            <textarea
              className={styles.jsonInput}
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              spellCheck={false}
              disabled={busy}
              rows={18}
              aria-label={pe.jsonLabel}
            />
          </div>
          {fieldError && (
            <p className={styles.error} role="alert">
              {fieldError}
            </p>
          )}
          <div className={styles.actions}>
            <Button type="button" onClick={() => void onSave()} disabled={busy}>
              {pe.save}
            </Button>
          </div>
        </>
      ) : (
        <>
          <h1>{a.nav.courierLabel}</h1>
          <p className={styles.intro}>{c.intro}</p>
          <p className={styles.hint}>{c.importHint}</p>
          {indexError && (
            <p className={styles.error} role="alert">
              {indexError}
            </p>
          )}
          <section className={styles.block}>
            <SectionRule title={c.couriers} />
            <KeyList
              keys={(catalog?.couriers ?? []).map((item) => item.code)}
              onOpen={(code) => openEditor({ kind: 'courier', code })}
            />
            {(catalog?.couriers ?? []).length === 0 && !loading && <p className={styles.empty}>{c.empty}</p>}
          </section>
          <section className={styles.block}>
            <SectionRule title={c.countries} />
            <KeyList
              keys={(catalog?.countries ?? []).map((item) => item.code)}
              onOpen={(code) => openEditor({ kind: 'country', code })}
            />
          </section>
          <section className={styles.block}>
            <SectionRule title={c.networks} />
            <KeyList
              keys={(catalog?.networks ?? []).map((item) => item.code)}
              onOpen={(code) => openEditor({ kind: 'network', code })}
            />
          </section>
          {catalog && (
            <section className={styles.block}>
              <SectionRule title={c.measurements} />
              <ul className={styles.keys}>
                <li>
                  <button
                    type="button"
                    className={styles.key}
                    onClick={() => openEditor({ kind: 'measurements' })}
                  >
                    {c.measurements}
                  </button>
                </li>
              </ul>
            </section>
          )}
        </>
      )}
      {busy && <LoadingModal message={saving ? t.admin.actionLoading : t.admin.contentLoading} />}
    </section>
  );
}
