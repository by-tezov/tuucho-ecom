import { useNavigate } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { backFallbackPath, canGoBackOnShop } from '../../utils/mobileBackNavigation';
import styles from './LegalPageBackLink.module.css';

type LegalPageBackLinkProps = {
  /** Defaults to `top` (margin below). Use `bottom` after the page body. */
  placement?: 'top' | 'bottom';
};

/** Mobile-only history back for content/legal/account pages. Stays on
 *  Shop when the previous document is another site (or a new tab);
 *  gallery on mobile, Accueil on desktop. */
export function LegalPageBackLink({ placement = 'top' }: LegalPageBackLinkProps) {
  const { t } = useLang();
  const navigate = useNavigate();

  function handleBack() {
    if (canGoBackOnShop()) {
      navigate(-1);
      return;
    }
    navigate(backFallbackPath());
  }

  return (
    <button
      type="button"
      className={`${styles.backLink} ${placement === 'bottom' ? styles.bottom : ''}`}
      data-testid="legal-back"
      data-placement={placement}
      onClick={handleBack}
    >
      <span aria-hidden="true">←</span> {t.backLink}
    </button>
  );
}
