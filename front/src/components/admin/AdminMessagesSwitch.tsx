import { useNavigate } from 'react-router-dom';
import { useAdminStrings } from '../../assets/i18n/admin';
import { SegmentedSwitch } from '../ui/SegmentedSwitch';
import { adminPath } from '../../utils/adminRoute';
import type { AdminAttentionCounts } from '../../hooks/useAdminAttentionCounts';
import styles from './AdminMessagesSwitch.module.css';

function withCount(label: string, count: number | null) {
  return count && count > 0 ? `${label} (${count})` : label;
}

/** The two inboxes behind the admin "Contact" entry: conversations with
 * registered customers ("Inscrits") and contact-form messages from visitors
 * without an account ("Invités"). One switch on both pages, one nav entry. */
export function AdminMessagesSwitch({
  active,
  counts,
}: {
  active: 'chats' | 'contacts';
  counts: AdminAttentionCounts;
}) {
  const navigate = useNavigate();
  const a = useAdminStrings();
  return (
    <SegmentedSwitch
      className={styles.switch ?? ''}
      ariaLabel={a.nav.contactLabel}
      activeKey={active}
      options={[
        { key: 'chats', label: withCount(a.messages.registered, counts.chatsOpen) },
        { key: 'contacts', label: withCount(a.messages.guests, counts.contactsNew) },
      ]}
      onSelect={(key) => {
        if (key === active) return;
        navigate(adminPath(key === 'chats' ? '/chats' : '/unconnected-contacts'));
      }}
    />
  );
}
