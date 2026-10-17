import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import styles from './ModalShell.module.css';
import { useScrollHint } from '../../hooks/useScrollHint';
import { useDragScroll } from '../../hooks/useDragScroll';

const INTERACTIVE = 'input, textarea, button, a, select, label, [contenteditable="true"], [role="textbox"]';

/** Shared scroll body for content-rich dialogs. Owns the custom scroll cue,
 * mouse press-drag-to-scroll (never text selection), and measurements —
 * same identity as FilterSheet / CartControl drawers. */
export function ModalScrollBody({
  children,
  contentKey,
  className,
}: {
  children: ReactNode;
  contentKey?: string | number | boolean;
  className?: string;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dragScroll = useDragScroll<HTMLDivElement>({ ignore: INTERACTIVE });
  const { scrollHint, updateScrollHint } = useScrollHint(bodyRef);

  useLayoutEffect(() => {
    updateScrollHint();
    window.addEventListener('resize', updateScrollHint);
    return () => window.removeEventListener('resize', updateScrollHint);
  }, [contentKey, updateScrollHint]);

  useEffect(() => {
    const container = bodyRef.current;
    const content = contentRef.current;
    if (!container || !content || typeof ResizeObserver === 'undefined') {
      updateScrollHint();
      return;
    }
    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [contentKey, updateScrollHint]);

  return (
    <div className={styles.bodyWrap}>
      <div
        ref={bodyRef}
        className={className ? `${styles.body} ${className}` : styles.body}
        onScroll={updateScrollHint}
        {...dragScroll}
      >
        <div ref={contentRef}>{children}</div>
      </div>
      {scrollHint.up && <ScrollHint className={styles.scrollHintUp!} direction="up" />}
      {scrollHint.down && <ScrollHint className={styles.scrollHintDown!} direction="down" />}
      {(scrollHint.up || scrollHint.down) && (
        <span
          className={[
            styles.scrollHintBar,
            scrollHint.up && styles.scrollHintBarFromUp,
            scrollHint.down && styles.scrollHintBarToDown,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function ScrollHint({ className, direction }: { className: string; direction: 'up' | 'down' }) {
  const path = direction === 'up' ? 'M2.5 7.5L6 4L9.5 7.5' : 'M2.5 4.5L6 8L9.5 4.5';
  return (
    <span className={className} aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d={path} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
