import { useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { AdminCataloguePhotoPreview } from '../../api/admin/catalogue';
import styles from './AdminProductEditor.module.css';

export function samePhoto(left: AdminCataloguePhotoPreview, right: AdminCataloguePhotoPreview): boolean {
  return (
    left.photo === right.photo &&
    left.shapeKey === right.shapeKey &&
    left.lengthKey === right.lengthKey &&
    left.variationKey === right.variationKey &&
    left.hash === right.hash
  );
}

export function samePhotoGroup(left: AdminCataloguePhotoPreview, right: AdminCataloguePhotoPreview): boolean {
  return (
    left.shapeKey === right.shapeKey && left.lengthKey === right.lengthKey && left.variationKey === right.variationKey
  );
}

function storedTileId(photo: AdminCataloguePhotoPreview): string {
  return `s:${photo.shapeKey}/${photo.lengthKey}/${photo.variationKey}/${photo.photo}/${photo.hash}`;
}

function pendingTileId(file: File): string {
  return `p:${file.name}/${file.size}/${file.lastModified}`;
}

/** Move `from` to the slot of `to` inside one shape/length/variation. Other groups stay put. */
function reorderStoredPhotos(
  list: AdminCataloguePhotoPreview[],
  from: AdminCataloguePhotoPreview,
  to: AdminCataloguePhotoPreview,
): AdminCataloguePhotoPreview[] {
  if (!samePhotoGroup(from, to) || samePhoto(from, to)) return list;
  const indexes: number[] = [];
  list.forEach((item, index) => {
    if (samePhotoGroup(item, from)) indexes.push(index);
  });
  const group = indexes.map((index) => list[index]!);
  const fromIndex = group.findIndex((item) => samePhoto(item, from));
  const toIndex = group.findIndex((item) => samePhoto(item, to));
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;
  const [moved] = group.splice(fromIndex, 1);
  group.splice(toIndex, 0, moved!);
  const next = list.slice();
  indexes.forEach((index, i) => {
    next[index] = group[i]!;
  });
  return next;
}

const DRAG_THRESHOLD_PX = 6;

type PhotoDrag = { fromId: string; x: number; y: number; overId: string | null; src: string | null };

interface PhotoTileProps {
  tileId: string;
  src: string | null;
  name: string;
  enlargeLabel: string;
  removeLabel: string;
  reorderLabel: string;
  draggable: boolean;
  dragging: boolean;
  dragOver: boolean;
  disabled: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
}

function PlusIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PhotoTile({
  tileId,
  src,
  name,
  enlargeLabel,
  removeLabel,
  reorderLabel,
  draggable,
  dragging,
  dragOver,
  disabled,
  onOpen,
  onRemove,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: PhotoTileProps) {
  return (
    <div
      className={[
        styles.photoCard,
        draggable && styles.photoCardDraggable,
        dragging && styles.photoDragging,
        dragOver && styles.photoDragOver,
      ]
        .filter(Boolean)
        .join(' ')}
      data-photo-tile={tileId}
      onPointerDown={draggable ? onPointerDown : undefined}
      onPointerMove={draggable ? onPointerMove : undefined}
      onPointerUp={draggable ? onPointerUp : undefined}
      onPointerCancel={draggable ? onPointerCancel : undefined}
    >
      <div className={styles.photoFrame}>
        {src ? (
          <button
            type="button"
            className={styles.photoOpen}
            onClick={onOpen}
            aria-label={draggable ? `${enlargeLabel}. ${reorderLabel}` : enlargeLabel}
            title={enlargeLabel}
            disabled={disabled}
          >
            <img className={styles.photoThumb} src={src} alt="" draggable={false} loading="lazy" decoding="async" />
          </button>
        ) : (
          <div className={styles.photoMissing} aria-hidden="true" />
        )}
        <button
          type="button"
          className={styles.photoRemove}
          aria-label={removeLabel}
          title={removeLabel}
          disabled={disabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M2 3.5H12M5.4 3.5V2.2C5.4 1.9 5.6 1.7 5.9 1.7H8.1C8.4 1.7 8.6 1.9 8.6 2.2V3.5M3.6 3.5 4.1 11.9C4.1 12.2 4.4 12.4 4.6 12.4H9.4C9.7 12.4 9.9 12.2 9.9 11.9L10.4 3.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <span className={styles.photoName}>{name}</span>
    </div>
  );
}

export interface AdminProductPhotoStripProps {
  photos: AdminCataloguePhotoPreview[];
  pendingPreviews: Array<{ file: File; url: string }>;
  busy: boolean;
  enlargeLabel: string;
  reorderLabel: string;
  addLabel: string;
  removeLabel: (name: string) => string;
  onOpen: (src: string) => void;
  onRemoveStored: (photo: AdminCataloguePhotoPreview) => void;
  onRemovePending: (file: File, url: string) => void;
  onAddFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onReorderStored: (next: AdminCataloguePhotoPreview[]) => void;
}

/** Photo tiles for one product. Drag reorders inside one shape, length, and variation. */
export function AdminProductPhotoStrip({
  photos,
  pendingPreviews,
  busy,
  enlargeLabel,
  reorderLabel,
  addLabel,
  removeLabel,
  onOpen,
  onRemoveStored,
  onRemovePending,
  onAddFiles,
  onReorderStored,
}: AdminProductPhotoStripProps) {
  const pointerRef = useRef<{
    pointerId: number;
    fromId: string;
    startX: number;
    startY: number;
    active: boolean;
    src: string | null;
  } | null>(null);
  const suppressOpenRef = useRef(false);
  const [drag, setDrag] = useState<PhotoDrag | null>(null);

  function openTile(src: string) {
    if (suppressOpenRef.current) {
      suppressOpenRef.current = false;
      return;
    }
    onOpen(src);
  }

  function tileAt(x: number, y: number): string | null {
    return document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-photo-tile]')?.dataset.photoTile ?? null;
  }

  function endPhotoDrag(event: PointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
    return pointer;
  }

  function onTilePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (busy || event.button !== 0 || !event.isPrimary) return;
    const fromId = event.currentTarget.dataset.photoTile;
    if (!fromId) return;
    suppressOpenRef.current = false;
    pointerRef.current = {
      pointerId: event.pointerId,
      fromId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      src: event.currentTarget.querySelector('img')?.getAttribute('src') ?? null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onTilePointerMove(event: PointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (!pointer.active) {
      const dx = event.clientX - pointer.startX;
      const dy = event.clientY - pointer.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      pointer.active = true;
    }
    event.preventDefault();
    setDrag({
      fromId: pointer.fromId,
      x: event.clientX,
      y: event.clientY,
      overId: tileAt(event.clientX, event.clientY),
      src: pointer.src,
    });
  }

  function acceptsDrop(fromId: string, toId: string): boolean {
    if (fromId === toId || !fromId.startsWith('s:') || !toId.startsWith('s:')) return false;
    const from = photos.find((photo) => storedTileId(photo) === fromId);
    const to = photos.find((photo) => storedTileId(photo) === toId);
    return Boolean(from && to && samePhotoGroup(from, to));
  }

  function applyPhotoReorder(fromId: string, toId: string) {
    if (!acceptsDrop(fromId, toId)) return;
    const from = photos.find((photo) => storedTileId(photo) === fromId);
    const to = photos.find((photo) => storedTileId(photo) === toId);
    if (!from || !to) return;
    const next = reorderStoredPhotos(photos, from, to);
    if (next !== photos) onReorderStored(next);
  }

  function onTilePointerUp(event: PointerEvent<HTMLDivElement>) {
    const pointer = endPhotoDrag(event);
    if (!pointer?.active) return;
    suppressOpenRef.current = true;
    const toId = tileAt(event.clientX, event.clientY);
    if (toId) applyPhotoReorder(pointer.fromId, toId);
  }

  function onTilePointerCancel(event: PointerEvent<HTMLDivElement>) {
    endPhotoDrag(event);
  }

  const tilePointer = {
    onPointerDown: onTilePointerDown,
    onPointerMove: onTilePointerMove,
    onPointerUp: onTilePointerUp,
    onPointerCancel: onTilePointerCancel,
  };

  return (
    <div className={styles.photos}>
      <div className={styles.photoStrip}>
        {photos.map((photo) => {
          const large = photo.modal || photo.small || null;
          const tileId = storedTileId(photo);
          const group = photos.filter((item) => samePhotoGroup(item, photo)).length;
          return (
            <PhotoTile
              key={tileId}
              tileId={tileId}
              src={photo.small || large}
              name={photo.photo}
              enlargeLabel={enlargeLabel}
              removeLabel={removeLabel(photo.photo)}
              reorderLabel={reorderLabel}
              draggable={!busy && group > 1}
              dragging={drag?.fromId === tileId}
              dragOver={drag != null && drag.overId === tileId && acceptsDrop(drag.fromId, tileId)}
              disabled={busy}
              onOpen={() => {
                if (large) openTile(large);
              }}
              onRemove={() => onRemoveStored(photo)}
              {...tilePointer}
            />
          );
        })}
        {pendingPreviews.map(({ file, url }) => {
          const tileId = pendingTileId(file);
          return (
            <PhotoTile
              key={tileId}
              tileId={tileId}
              src={url}
              name={file.name}
              enlargeLabel={enlargeLabel}
              removeLabel={removeLabel(file.name)}
              reorderLabel={reorderLabel}
              draggable={false}
              dragging={drag?.fromId === tileId}
              dragOver={drag != null && drag.overId === tileId && acceptsDrop(drag.fromId, tileId)}
              disabled={busy}
              onOpen={() => openTile(url)}
              onRemove={() => onRemovePending(file, url)}
              {...tilePointer}
            />
          );
        })}
        <label className={styles.photoAdd}>
          <input
            className={styles.fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            disabled={busy}
            onChange={onAddFiles}
          />
          <PlusIcon />
          <span className="visuallyHidden">{addLabel}</span>
        </label>
      </div>
      {drag?.src &&
        createPortal(
          <img className={styles.photoGhost} src={drag.src} alt="" style={{ left: drag.x, top: drag.y }} />,
          document.body,
        )}
    </div>
  );
}
