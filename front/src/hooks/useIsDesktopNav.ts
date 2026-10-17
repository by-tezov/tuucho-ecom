import { useEffect, useState } from 'react';

const QUERY = '(min-width: 1024px)';

/** Same breakpoint Header.tsx/.module.css already use to collapse the nav
 * into a hamburger — used here to decide whether "My Account" opens as a
 * modal (desktop) or navigates to a dedicated page (mobile). */
export function useIsDesktopNav(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
