import { useState, type CSSProperties } from 'react';
import { FilterSheet } from '../gallery/FilterSheet';
import { GiftShareCardFace } from './GiftShareCardFace';
import { SHARE_CARD_ART } from './shareCardArt';
import { GIFT_SHARE_CARD_STYLES, giftShareCardTheme, type GiftShareCardStyle } from './giftShareCardThemes';
import styles from './GiftShareCardPreview.module.css';

export { GIFT_SHARE_CARD_STYLES, type GiftShareCardStyle };

interface GiftShareCardPreviewProps {
  style: GiftShareCardStyle;
  message: string;
  giverDisplayName: string;
  receiverName: string;
  scanLabel: string;
  qrAlt: string;
  occasionLabel: string;
}

export function GiftShareCardPreview({
  style,
  message,
  giverDisplayName,
  receiverName,
  scanLabel,
  qrAlt,
  occasionLabel,
}: GiftShareCardPreviewProps) {
  return (
    <GiftShareCardFace
      style={style}
      message={message}
      giverDisplayName={giverDisplayName}
      receiverName={receiverName}
      scanLabel={scanLabel}
      qrAlt={qrAlt}
      occasionLabel={occasionLabel}
    />
  );
}

interface GiftShareCardStylePickerProps {
  value: GiftShareCardStyle;
  onChange: (style: GiftShareCardStyle) => void;
  labels: Record<GiftShareCardStyle, string>;
  title: string;
}

function SelectChevron() {
  return (
    <svg
      className={styles.selectTriggerChevron}
      width="10"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 1L5 5L9 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function chipVars(id: GiftShareCardStyle): CSSProperties {
  const theme = giftShareCardTheme(id);
  return {
    '--card-bg': theme.bg,
    '--card-accent': theme.accent,
    '--card-qr-light': theme.qrLight,
    '--card-qr-dark': theme.qrDark,
  } as CSSProperties;
}

export function GiftShareCardStylePicker({ value, onChange, labels, title }: GiftShareCardStylePickerProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const options = GIFT_SHARE_CARD_STYLES.map((id) => ({ value: id, label: labels[id] }));

  return (
    <>
      <button
        type="button"
        className={styles.selectTrigger}
        data-testid="gift-share-card-style"
        aria-haspopup="listbox"
        aria-expanded={sheetOpen}
        aria-labelledby="gift-share-card-style-label"
        onClick={() => setSheetOpen(true)}
      >
        <span className={styles.selectTriggerValue}>{labels[value]}</span>
        <SelectChevron />
      </button>
      {sheetOpen ? (
        <FilterSheet
          label={title}
          options={options}
          value={value}
          onChange={(next) => onChange(next as GiftShareCardStyle)}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
      <div className={styles.swatches}>
        {GIFT_SHARE_CARD_STYLES.map((id) => {
          const active = id === value;
          return (
            <button
              key={id}
              type="button"
              className={`${styles.swatch} ${active ? styles.swatchActive : ''}`}
              aria-pressed={active}
              aria-label={labels[id]}
              onClick={() => onChange(id)}
            >
              <span className={styles.chip} style={chipVars(id)}>
                <span
                  className={styles.chipArt}
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: SHARE_CARD_ART[id].art }}
                />
                <span className={styles.chipQr} aria-hidden="true" />
              </span>
              <span className={styles.swatchName}>{labels[id]}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
