import { CloseIcon } from '../ui/CloseIcon';
import { createPortal } from 'react-dom';
import { useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import type { Strings } from '../../assets/i18n/types';
import type { RecentLogin } from '../../api/account';
import styles from './RecentLoginsModal.module.css';
import { ModalBackdrop } from '../ui/ModalBackdrop';

interface RecentLoginsModalProps {
  t: Strings;
  logins: RecentLogin[];
  formatWhen: (createdAt: string) => string;
  onClose: () => void;
}

/** The "Plus…" link's target — full recent-logins list, same bottom-sheet-
 * on-mobile/centered-on-desktop shell as AddCardModal/ConfirmModal.
 * AccountPage.tsx's own inline block only ever shows the single latest
 * entry; this shows everything the API returned (already capped server-side
 * by RECENT_LOGINS_DISPLAY_COUNT). */
export function RecentLoginsModal({ t, logins, formatWhen, onClose }: RecentLoginsModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useLockBodyScroll();
  const requestClose = useHistoryBackClose(onClose);
  useFocusTrap(panelRef, { onEscape: requestClose });
  return createPortal(
    <ModalBackdrop
      className={styles.backdrop ?? ''}
      label={t.account.recentLoginsTitle}
      onClose={requestClose}
    >
      <div ref={panelRef} className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>{t.account.recentLoginsTitle}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label={t.gallery.close}
            data-modal-close
          >
            <CloseIcon />
          </button>
        </div>
        <div className={styles.body}>
          <ul className={styles.loginList}>
            {logins.map((login, index) => (
              <li key={index} className={styles.loginRow}>
                <div className={styles.loginWhen}>{formatWhen(login.createdAt)}</div>
                <div className={styles.loginMeta}>
                  {[login.location ?? login.ip ?? t.account.recentLoginsUnknownPlace, login.device]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
