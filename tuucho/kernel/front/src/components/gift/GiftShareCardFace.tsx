import type { CSSProperties, Ref } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadGiftShareFonts } from '../../assets/fonts/giftShareFonts';
import { SHARE_CARD_ART } from './shareCardArt';
import { giftShareCardTheme, type GiftShareCardStyle, type GiftShareCardTheme } from './giftShareCardThemes';
import { VALENTIN_HEART_BOTTOM, withValentinHeartLift } from './shareCardValentin';
import styles from './GiftShareCardPreview.module.css';

interface GiftShareCardFaceProps {
  style: GiftShareCardStyle;
  message: string;
  giverDisplayName: string;
  receiverName: string;
  scanLabel: string;
  qrAlt: string;
  occasionLabel: string;
}

function themeVars(theme: GiftShareCardTheme): CSSProperties {
  const [pt, pr, pb, pl] = theme.pad;
  const nail = theme.nail;
  return {
    '--card-bg': theme.bg,
    '--card-ink': theme.ink,
    '--card-soft': theme.soft,
    '--card-accent': theme.accent,
    '--card-msg': theme.msg,
    '--card-cap': theme.cap,
    '--card-qr-dark': theme.qrDark,
    '--card-qr-light': theme.qrLight,
    '--card-pad': `${pt}cqw ${pr}cqw ${pb}cqw ${pl}cqw`,
    '--pad-r': `${pr}cqw`,
    '--pad-l': `${pl}cqw`,
    '--brand-nudge': `${theme.brandNudge ?? 0}cqw`,
    '--brand-pin-top': `${theme.brandPinTop ?? 1}cqw`,
    '--nail-top': nail.top == null ? 'auto' : `${nail.top}cqw`,
    '--nail-right': nail.right == null ? 'auto' : `${nail.right}cqw`,
    '--nail-bottom': nail.bottom == null ? 'auto' : `${nail.bottom}cqw`,
    '--nail-left': nail.left == null ? 'auto' : `${nail.left}cqw`,
    '--nail-w': `${nail.w ?? 20}cqw`,
    '--nail-h': `${nail.h ?? 18}cqw`,
  } as CSSProperties;
}

function PreviewQr({ className, alt }: { className?: string | undefined; alt: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" role="img" aria-label={alt}>
      <rect width="40" height="40" fill="var(--card-qr-light)" />
      <rect x="2" y="2" width="12" height="12" fill="var(--card-qr-dark)" />
      <rect x="5" y="5" width="6" height="6" fill="var(--card-qr-light)" />
      <rect x="7" y="7" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="26" y="2" width="12" height="12" fill="var(--card-qr-dark)" />
      <rect x="29" y="5" width="6" height="6" fill="var(--card-qr-light)" />
      <rect x="31" y="7" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="2" y="26" width="12" height="12" fill="var(--card-qr-dark)" />
      <rect x="5" y="29" width="6" height="6" fill="var(--card-qr-light)" />
      <rect x="7" y="31" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="16" y="4" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="20" y="4" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="16" y="8" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="18" y="12" width="4" height="2" fill="var(--card-qr-dark)" />
      <rect x="16" y="16" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="20" y="16" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="24" y="16" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="28" y="16" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="16" y="20" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="22" y="20" width="4" height="2" fill="var(--card-qr-dark)" />
      <rect x="30" y="20" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="16" y="24" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="20" y="24" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="26" y="26" width="4" height="4" fill="var(--card-qr-dark)" />
      <rect x="32" y="26" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="26" y="32" width="2" height="2" fill="var(--card-qr-dark)" />
      <rect x="32" y="32" width="4" height="4" fill="var(--card-qr-dark)" />
    </svg>
  );
}

function nameClass(theme: GiftShareCardTheme): string {
  if (theme.nameFace === 'sans') return styles.nameSans ?? '';
  if (theme.nameFace === 'script') return styles.nameScript ?? '';
  if (theme.nameFace === 'cinzel') return styles.nameCinzel ?? '';
  return '';
}

function CopyBlock({
  theme,
  occasionLabel,
  receiver,
  text,
  grow,
  hideName,
  nameRef,
}: {
  theme: GiftShareCardTheme;
  occasionLabel: string;
  receiver: string;
  text: string;
  grow: boolean;
  hideName?: boolean;
  nameRef?: Ref<HTMLSpanElement>;
}) {
  return (
    <div className={`${styles.copy} ${grow ? styles.copyGrow : ''}`}>
      {theme.occasion === 'script' && occasionLabel ? (
        <span className={styles.occasionScript}>{occasionLabel}</span>
      ) : null}
      {theme.occasion === 'cinzel' && occasionLabel ? (
        <span className={styles.occasionCinzel}>{occasionLabel}</span>
      ) : null}
      {hideName ? null : (
        <span
          ref={nameRef}
          className={`${styles.name} ${nameClass(theme)} ${receiver ? '' : styles.placeholder}`}
        >
          {receiver || '…'}
        </span>
      )}
      {theme.rule ? <span className={styles.ruleLine} aria-hidden="true" /> : null}
      <p
        className={`${styles.msg} ${theme.nameFace === 'sans' ? styles.msgSans : ''} ${text ? '' : styles.placeholder}`}
      >
        {text || '…'}
      </p>
    </div>
  );
}

function QrBlock({ scanLabel, qrAlt, hang }: { scanLabel: string; qrAlt: string; hang?: boolean }) {
  if (hang) {
    return (
      <div className={styles.hangCol}>
        <span className={styles.hangString} aria-hidden="true" />
        <div className={styles.hangTag}>
          <span className={styles.hangHole} aria-hidden="true" />
          <PreviewQr className={styles.qr} alt={qrAlt} />
          <span className={styles.qrCap}>{scanLabel}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.qrCol}>
      <span className={styles.qrFrame}>
        <PreviewQr className={styles.qr} alt={qrAlt} />
      </span>
      <span className={styles.qrCap}>{scanLabel}</span>
    </div>
  );
}

export function GiftShareCardFace({
  style,
  message,
  giverDisplayName,
  receiverName,
  scanLabel,
  qrAlt,
  occasionLabel,
}: GiftShareCardFaceProps) {
  const theme = giftShareCardTheme(style);
  const art = SHARE_CARD_ART[style] ?? SHARE_CARD_ART.classic;
  const receiver = receiverName.trim();
  const giver = giverDisplayName.trim();
  const text = message;
  const layout = theme.layout;
  const growUp = layout === 'spread' || layout === 'hangTag' || layout === 'packEnd' || layout === 'stack';
  const cardRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const [heartLiftSvg, setHeartLiftSvg] = useState(0);

  useEffect(() => {
    void loadGiftShareFonts();
  }, []);

  useLayoutEffect(() => {
    if (style !== 'valentin') {
      setHeartLiftSvg(0);
      return;
    }
    const card = cardRef.current;
    const nameEl = nameRef.current;
    if (!card || !nameEl) return;
    const update = (): void => {
      const cardBox = card.getBoundingClientRect();
      const nameBox = nameEl.getBoundingClientRect();
      if (cardBox.height <= 0) return;
      const gap = cardBox.width * 0.016;
      const heartBottom = cardBox.top + cardBox.height * VALENTIN_HEART_BOTTOM;
      const liftPx = Math.max(0, heartBottom + gap - nameBox.top);
      const liftSvg = Math.min(80, (liftPx / cardBox.height) * 300);
      setHeartLiftSvg((prev) => (Math.abs(prev - liftSvg) < 0.2 ? prev : liftSvg));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(card);
    ro.observe(nameEl);
    return () => ro.disconnect();
  }, [style, receiver, text, giver, occasionLabel]);

  const brand = 'Shop';
  const sig = (
    <span
      className={`${styles.sig} ${theme.nameFace === 'sans' ? styles.sigSans : ''} ${giver ? '' : styles.placeholder}`}
    >
      {giver || '…'}
    </span>
  );

  const layoutClass = {
    spread: styles.layout_spread,
    packEnd: styles.layout_packEnd,
    stack: styles.layout_stack,
    hangTag: styles.layout_hangTag,
    celeste: styles.layout_celeste,
  }[layout];
  const pinBrand = Boolean(theme.brandPin);
  const wrapName = theme.brandPin === 'topRight' || layout === 'hangTag' || Boolean(theme.nameOverQr);
  const nameAboveQr = Boolean(theme.nameAboveQr);

  return (
    <div
      ref={cardRef}
      className={`${styles.card} ${layoutClass} ${theme.qr === 'left' ? styles.qrLeft : ''} ${theme.align === 'right' ? styles.alignRight : ''} ${theme.brandPin === 'topRight' ? styles.brandPinTopRight : ''} ${theme.brandPin === 'topLeft' ? styles.brandPinTopLeft : ''} ${wrapName ? styles.nameWrap : ''} ${nameAboveQr ? styles.nameAboveQr : ''}`}
      style={themeVars(theme)}
      data-testid="gift-share-card-preview"
    >
      <div
        className={styles.art}
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          __html: style === 'valentin' ? withValentinHeartLift(art.art, heartLiftSvg) : art.art,
        }}
      />
      <span className={styles.nailmark} aria-hidden="true" dangerouslySetInnerHTML={{ __html: art.nail }} />
      {pinBrand ? <span className={styles.brand}>{brand}</span> : null}
      {layout === 'celeste' ? (
        <div className={styles.body}>
          <div className={styles.textCol}>
            <span className={styles.brand}>{brand}</span>
            <CopyBlock
              theme={theme}
              occasionLabel={occasionLabel}
              receiver={receiver}
              text={text}
              grow={false}
            />
            {sig}
          </div>
          <QrBlock scanLabel={scanLabel} qrAlt={qrAlt} />
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.textCol}>
            {layout !== 'packEnd' && !pinBrand ? <span className={styles.brand}>{brand}</span> : null}
            {nameAboveQr ? (
              <span className={`${styles.name} ${nameClass(theme)} ${receiver ? '' : styles.placeholder}`}>
                {receiver || '…'}
              </span>
            ) : null}
            {layout === 'packEnd' ? (
              <>
                <span className={styles.brand}>{brand}</span>
                <CopyBlock
                  theme={theme}
                  occasionLabel={occasionLabel}
                  receiver={receiver}
                  text={text}
                  grow={false}
                  nameRef={nameRef}
                />
                {sig}
              </>
            ) : (
              <>
                <CopyBlock
                  theme={theme}
                  occasionLabel={occasionLabel}
                  receiver={receiver}
                  text={text}
                  grow={growUp}
                  hideName={nameAboveQr}
                  nameRef={nameRef}
                />
                {sig}
              </>
            )}
          </div>
          <QrBlock scanLabel={scanLabel} qrAlt={qrAlt} hang={layout === 'hangTag'} />
        </div>
      )}
    </div>
  );
}
