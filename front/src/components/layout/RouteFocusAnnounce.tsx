import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { announce } from '../../state/liveAnnouncer';

/**
 * After a shop route change, politely announce the new document title. Does
 * not move focus (programmatic parking on `#main` felt like a random
 * selection). Skips the first paint and ignores hash-only updates (in-page
 * anchors).
 *
 * This effect runs before the new page's `Seo` effect (it sits earlier in the
 * tree), and a lazy route only sets its title once its chunk arrives. So the
 * title is read after the page has had a frame to commit, then again on the
 * next `<title>` change; reading it on the spot announced the page just left.
 */
export function RouteFocusAnnounce() {
  const location = useLocation();
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    const pathKey = `${location.pathname}${location.search}`;
    const previous = previousPathRef.current;
    previousPathRef.current = pathKey;
    if (previous == null || previous === pathKey) return;

    const titleBefore = document.title.trim();
    let announced = false;
    const announceIfChanged = () => {
      const title = document.title.trim();
      if (announced || !title || title === titleBefore) return;
      announced = true;
      announce(title);
    };

    const frame = window.requestAnimationFrame(announceIfChanged);
    const titleElement = document.head.querySelector('title');
    const observer = titleElement ? new MutationObserver(announceIfChanged) : null;
    if (titleElement)
      observer?.observe(titleElement, { childList: true, characterData: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [location.pathname, location.search]);

  return null;
}
