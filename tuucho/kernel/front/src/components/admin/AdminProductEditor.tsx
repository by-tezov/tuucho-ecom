import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  createAdminCatalogueProduct,
  deleteAdminCatalogueProduct,
  getAdminCatalogueProduct,
  getAdminCatalogueTemplate,
  replaceAdminCatalogueProduct,
  type AdminCatalogueKind,
  type AdminCataloguePhotoPreview,
} from '../../api/admin/catalogue';
import { ApiError } from '../../api/errors';
import { useAdminStrings } from '../../assets/i18n/admin';
import { useLang } from '../../assets/i18n';
import { useAuthSession } from '../../state/AuthContext';
import { shopConfig } from '../../config/env';
import { withMinDuration } from '../../utils/withMinDuration';
import {
  addCataloguePhoto,
  CatalogueJsonFormatError,
  formatCatalogueJson,
  removeCataloguePhoto,
  removeUnhashedCataloguePhoto,
  reorderCataloguePhotos,
} from '../../utils/formatCatalogueJson';
import { Seo } from '../seo/Seo';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Lightbox } from '../ui/Lightbox';
import { LoadingModal } from '../ui/LoadingModal';
import { AdminDetailBar } from './AdminDetailBar';
import { AdminProductPhotoStrip, samePhoto, samePhotoGroup } from './AdminProductPhotoStrip';
import { StockSection } from './AdminStockFields';
import styles from './AdminProductEditor.module.css';

export interface AdminProductEditorProps {
  catalogue: AdminCatalogueKind;
  /** Absent when creating. */
  productUid?: string | null;
  /** Back control label: the list this page returns to. */
  backLabel: string;
  seoTitle: string;
  seoDescription: string;
  seoPath: string;
  onClose: () => void;
  onSaved: () => void;
}

function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '');
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

/** Full-product JSON page: create, replace, or delete one catalogue item. */
export function AdminProductEditor({
  catalogue,
  productUid,
  backLabel,
  seoTitle,
  seoDescription,
  seoPath,
  onClose,
  onSaved,
}: AdminProductEditorProps) {
  const { t } = useLang();
  const a = useAdminStrings();
  const pe = a.productEditor;
  const { authedRequest } = useAuthSession();
  const creating = !productUid;
  const [jsonText, setJsonText] = useState('');
  const [photos, setPhotos] = useState<AdminCataloguePhotoPreview[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const pendingUrls = useRef(new Map<File, string>());
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoToRemove, setPhotoToRemove] = useState<
    | { kind: 'stored'; photo: AdminCataloguePhotoPreview; name: string }
    | { kind: 'pending'; file: File; url: string; name: string }
    | null
  >(null);
  const busy = loading || saving;

  const pendingPreviews = pendingFiles.map((file) => {
    let url = pendingUrls.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      pendingUrls.current.set(file, url);
    }
    return { file, url };
  });

  useEffect(() => {
    const map = pendingUrls.current;
    const live = new Set(pendingFiles);
    for (const [file, url] of map) {
      if (!live.has(file)) {
        URL.revokeObjectURL(url);
        map.delete(file);
      }
    }
  }, [pendingFiles]);

  useEffect(() => {
    const map = pendingUrls.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFieldError(null);
      setPreview(null);
      try {
        const result = await withMinDuration(
          authedRequest((token) =>
            creating
              ? getAdminCatalogueTemplate(token, catalogue)
              : getAdminCatalogueProduct(token, catalogue, productUid!),
          ),
          shopConfig.loadingMinMs.short,
        );
        if (cancelled) return;
        setJsonText(formatCatalogueJson(JSON.stringify(result.document)));
        setPhotos('photos' in result && Array.isArray(result.photos) ? result.photos : []);
        setPendingFiles([]);
      } catch {
        if (!cancelled) setFieldError(pe.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, catalogue, creating, pe.loadError, productUid]);

  function onFormat() {
    try {
      setJsonText(formatCatalogueJson(jsonText));
      setFieldError(null);
    } catch (error) {
      const message = error instanceof CatalogueJsonFormatError ? error.message : pe.formatError;
      setFieldError(message);
    }
  }

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    setPendingFiles((current) => {
      const next = [...current];
      for (const file of files) {
        if (!next.some((entry) => entry.name === file.name && entry.size === file.size)) {
          next.push(file);
        }
      }
      return next;
    });
    try {
      let next = jsonText;
      for (const file of files) next = addCataloguePhoto(next, fileStem(file.name));
      setJsonText(next);
      setFieldError(null);
    } catch (error) {
      const message = error instanceof CatalogueJsonFormatError ? error.message : pe.formatError;
      setFieldError(message);
      setActionError(message);
    }
    event.target.value = '';
  }

  function openPhoto(src: string) {
    setPreview((current) => (current === src ? null : src));
  }

  function commitStoredOrder(next: AdminCataloguePhotoPreview[]) {
    const changed = next.find((photo, index) => photos[index] !== photo);
    if (!changed) return;
    try {
      setJsonText(
        reorderCataloguePhotos(
          jsonText,
          { shapeKey: changed.shapeKey, lengthKey: changed.lengthKey, variationKey: changed.variationKey },
          next.filter((photo) => samePhotoGroup(photo, changed)).map((photo) => photo.photo),
        ),
      );
      setPhotos(next);
      setFieldError(null);
    } catch (error) {
      setFieldError(error instanceof CatalogueJsonFormatError ? error.message : pe.formatError);
    }
  }

  function removeStoredPhoto(photo: AdminCataloguePhotoPreview) {
    try {
      setJsonText((current) => removeCataloguePhoto(current, photo));
      setFieldError(null);
    } catch (error) {
      setFieldError(error instanceof CatalogueJsonFormatError ? error.message : pe.formatError);
      return;
    }
    const src = photo.modal || photo.small;
    setPhotos((current) => current.filter((item) => !samePhoto(item, photo)));
    setPendingFiles((current) => current.filter((file) => fileStem(file.name) !== photo.photo));
    if (src) setPreview((current) => (current === src ? null : current));
  }

  function removePendingFile(file: File, url: string) {
    setPendingFiles((current) => current.filter((entry) => !(entry.name === file.name && entry.size === file.size)));
    setPreview((current) => (current === url ? null : current));
    try {
      setJsonText((current) => removeUnhashedCataloguePhoto(current, fileStem(file.name)));
      setFieldError(null);
    } catch (error) {
      const message = error instanceof CatalogueJsonFormatError ? error.message : pe.formatError;
      setFieldError(message);
      setActionError(message);
    }
  }

  function confirmPhotoRemoval() {
    if (!photoToRemove) return;
    if (photoToRemove.kind === 'stored') removeStoredPhoto(photoToRemove.photo);
    else removePendingFile(photoToRemove.file, photoToRemove.url);
    setPhotoToRemove(null);
  }

  async function onSave() {
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
        authedRequest((token) =>
          creating
            ? createAdminCatalogueProduct(token, catalogue, document, pendingFiles)
            : replaceAdminCatalogueProduct(token, catalogue, productUid!, document, pendingFiles),
        ),
        shopConfig.loadingMinMs.normal,
      );
      onSaved();
      onClose();
    } catch (error) {
      const message = error instanceof ApiError && error.serverMessage ? error.serverMessage : pe.saveError;
      setFieldError(message);
      setActionError(message);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!productUid) return;
    setConfirmDelete(false);
    setSaving(true);
    setFieldError(null);
    try {
      await withMinDuration(
        authedRequest((token) => deleteAdminCatalogueProduct(token, catalogue, productUid)),
        shopConfig.loadingMinMs.normal,
      );
      onSaved();
      onClose();
    } catch {
      setFieldError(pe.deleteError);
      setActionError(pe.deleteError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.page}>
      <Seo title={seoTitle} description={seoDescription} path={seoPath} />
      <h1 className="visuallyHidden">{creating ? pe.createTitle : pe.editTitle}</h1>
      <AdminDetailBar
        backLabel={backLabel}
        onBack={onClose}
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
      <div>
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
      <StockSection title={pe.photos}>
        <AdminProductPhotoStrip
          photos={photos}
          pendingPreviews={pendingPreviews}
          busy={busy}
          enlargeLabel={t.admin.openPhotoPreview}
          reorderLabel={pe.reorderPhoto}
          addLabel={pe.addPhotos}
          removeLabel={pe.removeFile}
          onOpen={openPhoto}
          onRemoveStored={(photo) => setPhotoToRemove({ kind: 'stored', photo, name: photo.photo })}
          onRemovePending={(file, url) => setPhotoToRemove({ kind: 'pending', file, url, name: file.name })}
          onAddFiles={onPickFiles}
          onReorderStored={commitStoredOrder}
        />
      </StockSection>
      <div className={styles.actions}>
        {!creating && (
          <Button type="button" variant="ghostDanger" disabled={busy} onClick={() => setConfirmDelete(true)}>
            {pe.delete}
          </Button>
        )}
        <Button type="button" onClick={() => void onSave()} disabled={busy}>
          {pe.save}
        </Button>
      </div>
      {preview && (
        <Lightbox src={preview} alt="" onClose={() => setPreview(null)} closeLabel={t.admin.closePhotoPreview} />
      )}
      {busy && <LoadingModal message={saving ? t.admin.actionLoading : t.admin.contentLoading} />}
      {photoToRemove && (
        <ConfirmModal
          title={pe.removePhotoTitle}
          message={pe.removePhotoMessage(photoToRemove.name)}
          confirmLabel={pe.removePhotoConfirm}
          closeLabel={t.gallery.close}
          confirmDanger
          onConfirm={confirmPhotoRemoval}
          onCancel={() => setPhotoToRemove(null)}
        />
      )}
      {actionError ? (
        <ConfirmModal
          variant="dialog"
          title={actionError}
          message={null}
          confirmLabel={a.whiteLabel.applyDismiss}
          closeIcon={false}
          onConfirm={() => setActionError(null)}
          onCancel={() => setActionError(null)}
        />
      ) : null}
      {confirmDelete && (
        <ConfirmModal
          title={pe.deleteTitle}
          message={pe.deleteMessage}
          confirmLabel={pe.deleteConfirm}
          closeLabel={t.gallery.close}
          confirmDanger
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}
