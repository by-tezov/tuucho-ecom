import { CloseIcon } from '../ui/CloseIcon';
import { Fragment, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { ModalScrollBody } from '../ui/ModalScrollBody';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import type { Strings } from '../../assets/i18n/types';
import styles from '../ui/ModalShell.module.css';
// The line list below reuses CartLine's own row classes (.variantList,
// .variantRow, .variantChips, .variantText) verbatim — same dotted
// separator between rows, same quantity-before-size order — rather than a
// new lookalike, so this modal's "current lines" section is the real cart
// row, not an approximation of it.
import cartStyles from './CartFeature.module.css';
import ownStyles from './VariantAxisModal.module.css';

interface VariantAxisOption {
  key: string;
  label: string;
  /** Zero stock across every size for this candidate. */
  muted: boolean;
}

interface VariantAxisLine {
  /** The size this cart line already has — its identity for resolving. */
  size: string;
  quantity: number;
}

interface ResolvedVariantLine {
  originalSize: string;
  /** Same as originalSize unless that size has no stock under the new
   * shape/length and the customer picked a replacement here. */
  newSize: string;
  quantity: number;
}

interface VariantAxisModalProps {
  t: Strings;
  /** "Forme" or "Longueur". */
  axisLabel: string;
  title: string;
  photo: string | null | undefined;
  /** Alt text for the photo only — nothing here shows it as visible text. */
  itemTitle: string;
  options: VariantAxisOption[];
  currentKey: string;
  /** One entry per size line currently in this shape+length group. */
  lines: VariantAxisLine[];
  /** Stock for one candidate key + one size — the other axis stays fixed
   * (the group's shape when picking length, or the candidate's own default
   * length when picking shape — see CartLine.tsx). */
  availableQuantityForCandidate: (candidateKey: string, size: string) => number;
  /** In-stock sizes for one candidate key, offered as a replacement once a
   * line's own size has none. */
  availableSizesForCandidate: (candidateKey: string) => string[];
  onConfirm: (newKey: string, mode: 'new' | 'replace', resolvedLines: ResolvedVariantLine[]) => void;
  onCancel: () => void;
}

/** Shape/length sibling of SelectionPickerModal's shape axis, for a group
 * that can hold several size lines at once: picking a new shape or length
 * can affect every one of them differently (one loses a bit of quantity,
 * another loses its size outright), so this shows the whole group's lines
 * below the picker instead of just the one chip grid — a light gray note
 * where quantity would shrink, a hard error plus an inline replacement-size
 * pick where a size would disappear entirely. One bulk New item / Replace
 * confirms every line's resolution together; both stay disabled while any
 * line still needs a replacement size. */
export function VariantAxisModal({
  t,
  axisLabel,
  title,
  photo,
  itemTitle,
  options,
  currentKey,
  lines,
  availableQuantityForCandidate,
  availableSizesForCandidate,
  onConfirm,
  onCancel,
}: VariantAxisModalProps) {
  const { lang } = useLang();
  const [selected, setSelected] = useState(currentKey);
  /** Replacement size chosen for a line whose own size has no stock under
   * `selected` — keyed by the line's original size. */
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLockBodyScroll();
  const requestClose = useHistoryBackClose(onCancel);
  useFocusTrap(panelRef, { onEscape: requestClose });

  function selectOption(key: string) {
    setSelected(key);
    setReplacements({});
  }

  const resolvedLines = lines.map((line) => {
    const effectiveSize = replacements[line.size] ?? line.size;
    const available = availableQuantityForCandidate(selected, effectiveSize);
    const needsReplacement = available === 0;
    const quantity = Math.min(line.quantity, available);
    return { line, effectiveSize, available, needsReplacement, quantity };
  });
  const hasUnresolved = resolvedLines.some((entry) => entry.needsReplacement);
  const changed = selected !== currentKey;

  function confirm(mode: 'new' | 'replace') {
    onConfirm(
      selected,
      mode,
      resolvedLines.map((entry) => ({
        originalSize: entry.line.size,
        newSize: entry.effectiveSize,
        quantity: entry.quantity,
      })),
    );
  }

  return createPortal(
    <ModalBackdrop
      className={`${styles.backdrop} ${styles.bottomSheetBackdrop}`}
      label={title}
      onClose={requestClose}
    >
      <div ref={panelRef} className={`${styles.dialog} ${styles.dialogScrollable} ${styles.bottomSheet}`}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={requestClose}
          aria-label={t.gallery.close}
        >
          <CloseIcon size={14} />
        </button>

        <ModalScrollBody contentKey={selected}>
          <p className={styles.title}>{title}</p>

          <div className={styles.pickerGroup} role="group" aria-label={axisLabel}>
            {options.map((option) => (
              <Chip
                key={option.key}
                className={ownStyles.axisOptionChip}
                active={option.key === selected}
                current={option.key === currentKey}
                muted={option.muted}
                srState={
                  [
                    option.muted && t.product.outOfStock,
                    option.key === currentKey && t.cart.pickerCurrentOption,
                  ]
                    .filter(Boolean)
                    .join(', ') || undefined
                }
                data-testid="cart-variant-axis-option"
                onClick={() => selectOption(option.key)}
              >
                {option.label}
              </Chip>
            ))}
          </div>

          {/* Always visible, from the moment the modal opens — it starts by
              showing the group's current lines exactly as they already are
              (selected === currentKey, so nothing is reduced and nothing
              needs a replacement yet), then updates in place as soon as a
              different shape/length is picked above. Photo on the left,
              same as CartLine's own .photoCol next to .variantList. */}
          <div className={ownStyles.linesWithPhoto}>
            {photo && <img src={photo} alt={itemTitle} className={cartStyles.photo} />}
            <div className={cartStyles.variantList}>
              {resolvedLines.map(({ line, effectiveSize, needsReplacement, quantity }) => (
                <Fragment key={line.size}>
                  <div className={cartStyles.variantRow}>
                    <span className={cartStyles.variantText}>{line.quantity} ×</span>
                    <div className={cartStyles.variantChips}>
                      <Chip>{line.size}</Chip>
                    </div>
                  </div>
                  {needsReplacement ? (
                    <>
                      <p className={ownStyles.errorNotice} data-testid="cart-variant-axis-error">
                        {t.cart.variantSizeUnavailableNotice}
                      </p>
                      <div className={ownStyles.replacementGrid}>
                        {availableSizesForCandidate(selected).map((size) => (
                          <Chip
                            key={size}
                            active={size === effectiveSize}
                            onClick={() => setReplacements((current) => ({ ...current, [line.size]: size }))}
                          >
                            {size}
                          </Chip>
                        ))}
                      </div>
                    </>
                  ) : (
                    quantity < line.quantity && (
                      <p className={ownStyles.reducedNotice}>
                        {t.cart.quantityReducedNotice} {quantity}
                      </p>
                    )
                  )}
                </Fragment>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <Button type="button" disabled={!changed || hasUnresolved} onClick={() => confirm('new')}>
              {t.cart.addAsNewLineButton}
            </Button>
            <Button
              variant="ghost"
              type="button"
              disabled={!changed || hasUnresolved}
              onClick={() => confirm('replace')}
            >
              {t.cart.changeThisLineButton}
            </Button>
          </div>

          <Link
            to={localizedPath('/sizes', lang)}
            className={`${styles.textLink} ${ownStyles.sizeGuideLink}`}
          >
            {t.gallery.sizeGuideLink} <span aria-hidden="true">→</span>
          </Link>
        </ModalScrollBody>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
