import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { BottomSheet } from '../ui/BottomSheet';
import { useDragCarousel } from '../../hooks/useDragCarousel';
import { heroImageForShape } from '../../data/capsuleLengths';
import { availableLengths, lengthTextFor } from '../../data/capsuleLengthTable';
import type { CapsuleForm } from '../../data/capsuleForms';
import styles from './CapsuleLengths.module.css';

/** Slack before an edge counts as "at the edge" — same idea as
 *  useScrollHint's vertical version, sub-pixel layout leaves scrollLeft a
 *  hair off zero at rest. */
const EDGE_SLACK_PX = 4;

interface CapsuleLengthsProps {
  forms: CapsuleForm[];
}

/** The second half of the shape guide. A hero carousel sits right under the
 *  heading, with the shape picker sitting in its top-left corner on the
 *  same line as the dots. Under it, the mm table lists every shape on its
 *  own row and every length as its own column ("base ± variation"). */
export function CapsuleLengths({ forms }: CapsuleLengthsProps) {
  const { t, lang } = useLang();
  const [index, setIndex] = useState(0);
  const [shapeSheetOpen, setShapeSheetOpen] = useState(false);
  const [tableScrollHint, setTableScrollHint] = useState({ left: false, right: false });
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableDragRef = useRef<{ startX: number; startScrollLeft: number; captured: boolean } | null>(null);
  const heroSlides = forms
    .map((form) => ({ key: form.key, image: heroImageForShape(form.key) }))
    .filter((slide): slide is { key: typeof slide.key; image: string } => Boolean(slide.image));
  const { isDragging, dragOffset, trackRef, next, prev, goTo, canPrev, canNext, trackHandlers } =
    useDragCarousel({
      count: heroSlides.length,
      index,
      onIndexChange: setIndex,
    });

  const activeSlide = heroSlides[index];
  const multi = heroSlides.length > 1;

  // One row per shape, one column per length.
  const tableRows = forms.map((form) => ({
    shape: form.key,
    values: Object.fromEntries(availableLengths.map((length) => [length, lengthTextFor(form.key, length)])),
  }));

  function pickShape(i: number) {
    goTo(i);
    setShapeSheetOpen(false);
  }

  function updateTableScrollHint() {
    const el = tableScrollRef.current;
    if (!el) return;
    const next = {
      left: el.scrollLeft > EDGE_SLACK_PX,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_SLACK_PX,
    };
    setTableScrollHint((current) =>
      current.left === next.left && current.right === next.right ? current : next,
    );
  }

  function scrollTableBy(delta: number) {
    tableScrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  }

  // Touch/pen already scroll the table natively (plain overflow-x: auto);
  // this only takes over the mouse, which has no horizontal-drag gesture of
  // its own — same press-drag-not-text-selection contract as
  // ModalScrollBody, just along the other axis.
  function onTableScrollPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse') return;
    event.preventDefault();
    tableDragRef.current = {
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      captured: false,
    };
  }

  function onTableScrollPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = tableDragRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    if (!drag.captured) {
      if (Math.abs(delta) <= 4) return;
      drag.captured = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.currentTarget.scrollLeft = drag.startScrollLeft - delta;
  }

  function onTableScrollPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = tableDragRef.current;
    if (drag?.captured) event.currentTarget.releasePointerCapture(event.pointerId);
    tableDragRef.current = null;
  }

  useLayoutEffect(() => {
    updateTableScrollHint();
    window.addEventListener('resize', updateTableScrollHint);
    return () => window.removeEventListener('resize', updateTableScrollHint);
    // Re-measured when the rows or the translated headers change width.
  }, [forms, t]);

  // Bails out only once every hook above has run. An early return placed
  // before them would change this component's hook count the first time
  // `forms` renders empty after a non-empty render, which React rejects.
  if (!activeSlide) return null;
  const activeCopy = t.capsules.forms[activeSlide.key];

  return (
    <section aria-labelledby="lengths-h" className={styles.section}>
      <div className={styles.heading}>
        <h2 id="lengths-h" className={styles.title}>
          {t.capsules.lengthsTitle}
        </h2>
        <p className={styles.sub}>{t.capsules.lengthsSub}</p>
      </div>

      <div className={styles.hero}>
        <div
          ref={trackRef}
          className={styles.heroTrack}
          style={{
            transform: `translateX(calc(${-index * 100}% + ${dragOffset}px))`,
            transition: isDragging ? 'none' : undefined,
            cursor: multi && isDragging ? 'grabbing' : undefined,
          }}
          {...(multi ? trackHandlers : {})}
          role="group"
          aria-roledescription="carousel"
          aria-label={t.capsules.shapesTitle}
        >
          {heroSlides.map((slide, i) =>
            Math.abs(i - index) <= 1 ? (
              <img
                key={slide.key}
                src={slide.image}
                alt={t.capsules.forms[slide.key].alt}
                className={styles.heroSlide}
                draggable={false}
                loading="lazy"
              />
            ) : (
              <div key={slide.key} className={styles.heroSlide} aria-hidden="true" />
            ),
          )}
        </div>

        {multi && (
          <>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowPrev}`}
              onClick={prev}
              disabled={!canPrev}
              aria-label={t.gallery.prevPhoto}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M9 2L4 7L9 12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowNext}`}
              onClick={next}
              disabled={!canNext}
              aria-label={t.gallery.nextPhoto}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M5 2L10 7L5 12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        )}

        {/* Top bar of the carousel: the shape picker is flush with the
            hero's left and top edges, the dots share its line and stay
            centred in whatever width is left. */}
        <div className={styles.heroBar}>
          <button
            type="button"
            className={styles.heroShapeTrigger}
            aria-haspopup="dialog"
            aria-expanded={shapeSheetOpen}
            aria-label={t.capsules.lengthsShapeLabel}
            disabled={!multi}
            onClick={() => setShapeSheetOpen(true)}
          >
            <span>{activeCopy.name}</span>
            {multi && (
              <span aria-hidden="true" className={styles.fieldCaret}>
                ⌄
              </span>
            )}
          </button>

          {multi && (
            <div className={styles.dots} role="group" aria-label={t.capsules.shapesTitle}>
              {heroSlides.map((slide, i) => (
                <button
                  key={slide.key}
                  type="button"
                  className={i === index ? `${styles.dot} ${styles.dotActive}` : styles.dot}
                  onClick={() => goTo(i)}
                  aria-current={i === index}
                  aria-label={t.capsules.forms[slide.key].name}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {shapeSheetOpen && (
        <BottomSheet
          title={t.capsules.lengthsShapePickerTitle}
          onClose={() => setShapeSheetOpen(false)}
          closeLabel={t.gallery.close}
        >
          <div className={styles.shapeOptions} role="listbox" aria-label={t.capsules.lengthsShapeLabel}>
            {heroSlides.map((slide, i) => (
              <button
                key={slide.key}
                type="button"
                role="option"
                aria-selected={i === index}
                className={
                  i === index ? `${styles.shapeOption} ${styles.shapeOptionActive}` : styles.shapeOption
                }
                onClick={() => pickShape(i)}
              >
                {t.capsules.forms[slide.key].name}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      <div className={styles.tableBlock}>
        <h3 id="lengths-table-h" className={styles.tableTitle}>
          {t.capsules.lengthsTableTitle}
        </h3>

        {/* Native touch/pen scroll plus a mouse press-drag (see
              onTableScrollPointer*) — one column can still outrun a
              320px screen with every length shown side by side. */}
        <div
          ref={tableScrollRef}
          className={styles.tableScroll}
          onScroll={updateTableScrollHint}
          onPointerDown={onTableScrollPointerDown}
          onPointerMove={onTableScrollPointerMove}
          onPointerUp={onTableScrollPointerUp}
          onPointerCancel={onTableScrollPointerUp}
        >
          <table className={styles.table} aria-labelledby="lengths-table-h">
            <thead>
              <tr className={styles.theadRow}>
                <th scope="col" className={styles.th}>
                  {t.capsules.lengthsShapeLabel}
                </th>
                {availableLengths.map((length) => (
                  <th key={length} scope="col" className={styles.thRight}>
                    {t.capsules.lengths[length].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.shape} className={styles.row}>
                  <th scope="row" className={styles.rowName}>
                    {t.capsules.forms[row.shape].name}
                  </th>
                  {availableLengths.map((length) => (
                    <td key={length} className={styles.value}>
                      {row.values[length] ?? (
                        <>
                          <span aria-hidden="true">-</span>
                          <span className="visuallyHidden">{t.capsules.lengthUnavailable}</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(tableScrollHint.left || tableScrollHint.right) && (
          <div className={styles.tableScrollControls}>
            <button
              type="button"
              className={styles.tableScrollArrow}
              disabled={!tableScrollHint.left}
              onClick={() => scrollTableBy(-120)}
              aria-label={t.gallery.prevPhoto}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M7.5 2.5L4 6L7.5 9.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <span className={styles.tableScrollBar} aria-hidden="true" />
            <button
              type="button"
              className={styles.tableScrollArrow}
              disabled={!tableScrollHint.right}
              onClick={() => scrollTableBy(120)}
              aria-label={t.gallery.nextPhoto}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M4.5 2.5L8 6L4.5 9.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}

        <p className={styles.note}>
          {t.capsules.lengthsNote} {t.capsules.lengthsNoteSizesBefore}
          <Link to={localizedPath('/sizes', lang)} className={styles.noteLink}>
            {t.capsules.lengthsNoteSizesLink}
          </Link>
          {t.capsules.lengthsNoteSizesAfter}
        </p>
      </div>
    </section>
  );
}
