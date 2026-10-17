import { useLocation, useNavigate } from 'react-router-dom';
import { HOME_PATH } from '../config/paths';
import { scrollToId } from '../utils/scroll';
import { shouldReplaceMobileBackPage } from '../utils/mobileBackNavigation';

/**
 * Navigate to a HomePage section. Same-page scrolls immediately; cross-page
 * navigates to `/home` with scrollTo state so HomePage scrolls once mounted.
 */
export function useSectionNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (sectionId: string) => {
    if (location.pathname === HOME_PATH) {
      scrollToId(sectionId);
    } else {
      navigate(HOME_PATH, {
        replace: shouldReplaceMobileBackPage(location.pathname, HOME_PATH),
        state: { scrollTo: sectionId },
      });
    }
  };
}
