import { useEffect, useState, type FormEvent } from 'react';
import {
  deleteCatalogueLibraryPart,
  deleteCatalogueNailAxis,
  deleteCatalogueNailOption,
  getCatalogueLibraryPart,
  getCatalogueNailAxis,
  getCatalogueNailOption,
  getCatalogueVocabulary,
  putCatalogueLibraryPart,
  putCatalogueNailAxis,
  putCatalogueNailOption,
  type CatalogueLibraryPart,
  type CatalogueVocabularyIndex,
} from '../api/admin/catalogueVocabulary';
import { ApiError } from '../api/errors';
import { useAdminStrings, type AdminUiStrings } from '../assets/i18n/admin';
import { useLang } from '../assets/i18n';
import { Seo } from '../components/seo/Seo';
import { AdminDetailBar } from '../components/admin/AdminDetailBar';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingModal } from '../components/ui/LoadingModal';
import { shopConfig } from '../config/env';
import { useAuthSession } from '../state/AuthContext';
import { adminPath } from '../utils/adminRoute';
import { CatalogueJsonFormatError, formatCatalogueJson } from '../utils/formatCatalogueJson';
import { withMinDuration } from '../utils/withMinDuration';
import styles from './AdminCatalogueVocabularyPage.module.css';

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Editor =
  | { kind: 'library'; part: CatalogueLibraryPart; key: string; creating: boolean }
  | { kind: 'axis'; axis: string; creating: boolean }
  | { kind: 'option'; axis: string; option: string; creating: boolean };

function validKey(key: string): boolean {
  return KEY.test(key) && key.length <= 64;
}

function template(editor: Editor): Record<string, unknown> {
  if (editor.kind === 'library' && editor.part === 'shape') {
    return { title: { fr: '' }, gender: {}, attributive: { fr: '' }, length: ['$medium'] };
  }
  if (editor.kind === 'library' && editor.part === 'length') {
    return { value: '', title: { fr: '' }, gender: {} };
  }
  if (editor.kind === 'axis') return { title: { fr: '' } };
  return { fr: '' };
}

function entryTitle(editor: Editor, v: AdminUiStrings['vocabulary']): string {
  if (editor.kind === 'library') {
    const part = editor.part === 'shape' ? v.shapes : editor.part === 'length' ? v.lengths : v.colors;
    return `${part}: ${editor.key}`;
  }
  if (editor.kind === 'axis') return `${v.variationTitle}: ${editor.axis}`;
  return `${editor.axis}.${editor.option}`;
}

function entryHint(editor: Editor, v: AdminUiStrings['vocabulary']): string | null {
  if (editor.kind === 'library' && editor.part === 'shape') return v.shapeHint;
  if (editor.kind === 'library' && editor.part === 'length') return v.lengthHint;
  if (editor.kind === 'library') return v.colorHint;
  if (editor.kind === 'axis') return v.variationHint;
  return v.optionHint;
}

function entryName(editor: Editor): string {
  if (editor.kind === 'library') return editor.key;
  if (editor.kind === 'axis') return editor.axis;
  return `${editor.axis}.${editor.option}`;
}

function partLabel(part: CatalogueLibraryPart, v: AdminUiStrings['vocabulary']): string {
  if (part === 'shape') return v.shapes;
  if (part === 'length') return v.lengths;
  return v.colors;
}

function SectionRule({ title, level = 2 }: { title: string; level?: 2 | 3 }) {
  const Tag = level === 2 ? 'h2' : 'h3';
  return (
    <Tag className={styles.rule}>
      <span>{title}</span>
    </Tag>
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

/** Réglages page: library data-common by one entry, nail variations by one
 * title or option. */
export function AdminCatalogueVocabularyPage() {
  const { t } = useLang();
  const a = useAdminStrings();
  const v = a.vocabulary;
  const pe = a.productEditor;
  const { authedRequest } = useAuthSession();
  const [index, setIndex] = useState<CatalogueVocabularyIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [part, setPart] = useState<CatalogueLibraryPart>('shape');
  const [variation, setVariation] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [variationDraft, setVariationDraft] = useState('');
  const [optionDraft, setOptionDraft] = useState('');
  const [keyError, setKeyError] = useState<{ where: string; message: string } | null>(null);

  useEffect(() => {
    if (editor) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setIndexError(null);
      try {
        const result = await withMinDuration(
          authedRequest((token) => getCatalogueVocabulary(token)),
          shopConfig.loadingMinMs.normal,
        );
        if (!cancelled) setIndex(result);
      } catch {
        if (!cancelled) setIndexError(v.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, editor, v.loadError]);

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    (async () => {
      setFieldError(null);
      if (editor.creating) {
        setJsonText(formatCatalogueJson(JSON.stringify(template(editor))));
        return;
      }
      setLoading(true);
      try {
        const result = await withMinDuration(
          authedRequest((token) => {
            if (editor.kind === 'library') return getCatalogueLibraryPart(token, editor.part, editor.key);
            if (editor.kind === 'axis') return getCatalogueNailAxis(token, editor.axis);
            return getCatalogueNailOption(token, editor.axis, editor.option);
          }),
          shopConfig.loadingMinMs.normal,
        );
        if (!cancelled) setJsonText(formatCatalogueJson(JSON.stringify(result.document)));
      } catch (error) {
        if (!cancelled) {
          setFieldError(error instanceof ApiError && error.serverMessage ? error.serverMessage : v.loadError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, editor, v.loadError]);

  function openKey(where: string, raw: string, next: (key: string) => Editor): boolean {
    const key = raw.trim().toLowerCase();
    if (!validKey(key)) {
      setKeyError({ where, message: v.keyInvalid });
      return false;
    }
    setKeyError(null);
    setEditor(next(key));
    return true;
  }

  function onFormat() {
    try {
      setJsonText(formatCatalogueJson(jsonText));
      setFieldError(null);
    } catch (error) {
      setFieldError(error instanceof CatalogueJsonFormatError ? error.message : pe.formatError);
    }
  }

  async function onSave() {
    if (!editor) return;
    setFieldError(null);
    let document: Record<string, unknown>;
    try {
      const pretty = formatCatalogueJson(jsonText);
      setJsonText(pretty);
      document = JSON.parse(pretty) as Record<string, unknown>;
    } catch (error) {
      setFieldError(error instanceof CatalogueJsonFormatError ? error.message : pe.formatError);
      return;
    }
    setSaving(true);
    try {
      await withMinDuration(
        authedRequest((token) => {
          if (editor.kind === 'library') return putCatalogueLibraryPart(token, editor.part, editor.key, document);
          if (editor.kind === 'axis') return putCatalogueNailAxis(token, editor.axis, document);
          return putCatalogueNailOption(token, editor.axis, editor.option, document);
        }),
        shopConfig.loadingMinMs.normal,
      );
      setEditor(null);
    } catch (error) {
      setFieldError(error instanceof ApiError && error.serverMessage ? error.serverMessage : v.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!editor || editor.creating) return;
    setConfirmDelete(false);
    setSaving(true);
    setFieldError(null);
    try {
      await withMinDuration(
        authedRequest((token) => {
          if (editor.kind === 'library') return deleteCatalogueLibraryPart(token, editor.part, editor.key);
          if (editor.kind === 'axis') return deleteCatalogueNailAxis(token, editor.axis);
          return deleteCatalogueNailOption(token, editor.axis, editor.option);
        }),
        shopConfig.loadingMinMs.normal,
      );
      setEditor(null);
    } catch (error) {
      setFieldError(error instanceof ApiError && error.serverMessage ? error.serverMessage : v.deleteError);
    } finally {
      setSaving(false);
    }
  }

  const busy = loading || saving;
  const libraryKeys =
    part === 'shape' ? index?.library.shapes : part === 'length' ? index?.library.lengths : index?.library.colors;
  const nails = index?.nail ?? [];
  const selectedNail = nails.find((item) => item.key === variation) ?? nails[0] ?? null;
  const canDelete = editor != null && !editor.creating;

  return (
    <section className={styles.page}>
      <Seo
        title={a.nav.vocabularyLabel}
        description={v.seoDescription}
        path={adminPath('/catalogue-vocabulary')}
        noindex
      />
      {editor ? (
        <>
          <h1 className="visuallyHidden">{entryTitle(editor, v)}</h1>
          <AdminDetailBar
            backLabel={a.nav.vocabularyLabel}
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
          <p className={styles.entry}>{entryTitle(editor, v)}</p>
          {entryHint(editor, v) && <p className={styles.hint}>{entryHint(editor, v)}</p>}
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
              rows={16}
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
            {canDelete && (
              <Button type="button" variant="ghostDanger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                {pe.delete}
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <h1>{a.nav.vocabularyLabel}</h1>
          <p className={styles.intro}>{v.intro}</p>
          {indexError && (
            <p className={styles.error} role="alert">
              {indexError}
            </p>
          )}
          <section className={styles.block}>
            <SectionRule title={v.libraries} />
            <div className={styles.switch} role="group" aria-label={v.libraries}>
              {(['shape', 'length', 'color'] as const).map((item) => (
                <button key={item} type="button" aria-pressed={part === item} onClick={() => setPart(item)}>
                  {partLabel(item, v)}
                </button>
              ))}
            </div>
            <SectionRule title={partLabel(part, v)} level={3} />
            <ul className={styles.keys}>
              {(libraryKeys ?? []).map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    className={styles.key}
                    onClick={() => setEditor({ kind: 'library', part, key, creating: false })}
                  >
                    {key}
                  </button>
                </li>
              ))}
            </ul>
            {(libraryKeys ?? []).length === 0 && !loading && <p className={styles.empty}>{v.empty}</p>}
            <SectionRule title={v.add} level={3} />
            <form
              className={styles.add}
              noValidate
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                const exists = (libraryKeys ?? []).includes(keyDraft.trim().toLowerCase());
                if (openKey('library', keyDraft, (key) => ({ kind: 'library', part, key, creating: !exists }))) {
                  setKeyDraft('');
                }
              }}
            >
              <label>
                {v.keyLabel}
                <input
                  value={keyDraft}
                  onChange={(event) => setKeyDraft(event.target.value)}
                  placeholder={v.keyPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={keyError?.where === 'library'}
                />
              </label>
              <Button type="submit">{v.add}</Button>
            </form>
            {keyError?.where === 'library' && (
              <p className={styles.error} role="alert">
                {keyError.message}
              </p>
            )}
          </section>
          <section className={styles.block}>
            <SectionRule title={v.nails} />
            {nails.length > 0 && (
              <div className={styles.switch} role="group" aria-label={v.nails}>
                {nails.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={selectedNail?.key === item.key}
                    onClick={() => {
                      setVariation(item.key);
                      setOptionDraft('');
                      setKeyError(null);
                    }}
                  >
                    {item.key}
                  </button>
                ))}
              </div>
            )}
            {selectedNail ? (
              <>
                <SectionRule title={selectedNail.key} level={3} />
                <ul className={styles.keys} aria-label={v.options}>
                  {selectedNail.options.map((option) => (
                    <li key={option}>
                      <button
                        type="button"
                        className={styles.key}
                        onClick={() =>
                          setEditor({ kind: 'option', axis: selectedNail.key, option, creating: false })
                        }
                      >
                        {option}
                      </button>
                    </li>
                  ))}
                </ul>
                {selectedNail.options.length === 0 && !loading && <p className={styles.empty}>{v.empty}</p>}
                <SectionRule title={v.variationTitle} level={3} />
                <button
                  type="button"
                  className={styles.key}
                  onClick={() => setEditor({ kind: 'axis', axis: selectedNail.key, creating: false })}
                >
                  {selectedNail.key}
                </button>
                <SectionRule title={v.add} level={3} />
                <form
                  className={styles.add}
                  noValidate
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    const exists = selectedNail.options.includes(optionDraft.trim().toLowerCase());
                    if (
                      openKey('option', optionDraft, (key) => ({
                        kind: 'option',
                        axis: selectedNail.key,
                        option: key,
                        creating: !exists,
                      }))
                    ) {
                      setOptionDraft('');
                    }
                  }}
                >
                  <label>
                    {v.keyLabel}
                    <input
                      value={optionDraft}
                      onChange={(event) => setOptionDraft(event.target.value)}
                      placeholder={v.keyPlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={keyError?.where === 'option'}
                    />
                  </label>
                  <Button type="submit">{v.add}</Button>
                </form>
                {keyError?.where === 'option' && (
                  <p className={styles.error} role="alert">
                    {keyError.message}
                  </p>
                )}
              </>
            ) : (
              !loading && <p className={styles.empty}>{v.empty}</p>
            )}
            <SectionRule title={v.newVariation} level={3} />
            <form
              className={styles.add}
              noValidate
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                const exists = nails.some((item) => item.key === variationDraft.trim().toLowerCase());
                if (
                  openKey('new-variation', variationDraft, (key) => {
                    setVariation(key);
                    return { kind: 'axis', axis: key, creating: !exists };
                  })
                ) {
                  setVariationDraft('');
                }
              }}
            >
              <label>
                {v.keyLabel}
                <input
                  value={variationDraft}
                  onChange={(event) => setVariationDraft(event.target.value)}
                  placeholder={v.keyPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={keyError?.where === 'new-variation'}
                />
              </label>
              <Button type="submit">{v.add}</Button>
            </form>
            {keyError?.where === 'new-variation' && (
              <p className={styles.error} role="alert">
                {keyError.message}
              </p>
            )}
          </section>
        </>
      )}
      {busy && <LoadingModal message={saving ? t.admin.actionLoading : t.admin.contentLoading} />}
      {confirmDelete && editor && (
        <ConfirmModal
          title={v.removeTitle}
          message={v.removeMessage(entryName(editor))}
          confirmLabel={v.removeConfirm}
          closeLabel={t.gallery.close}
          confirmDanger
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}
