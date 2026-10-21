import { Link, type LinkProps } from 'react-router-dom';
import { beginAuthLegalDetour } from '../../state/authConsentDraft';

type AuthLegalLinkProps = LinkProps;

/**
 * CGU / privacy link from a consent step. Marks a legal detour first so the
 * pending signup draft cannot be wiped while the visitor reads the page —
 * AuthModal, /login, and cart Identification all remount from that draft.
 */
export function AuthLegalLink({ onClick, ...props }: AuthLegalLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        beginAuthLegalDetour();
        onClick?.(event);
      }}
    />
  );
}
