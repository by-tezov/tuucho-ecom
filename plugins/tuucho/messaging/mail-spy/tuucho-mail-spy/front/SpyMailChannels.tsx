import { useMemo, useState } from 'react';
import { Button, SegmentedSwitch, ToggleSwitch } from '@kernel/front/ui';
import { AdminFilterSelect } from '@kernel/front/components/admin/AdminFilterSelect';
import { useLang } from '@kernel/front/assets/i18n';
import type { SpyMailChannel, SpyMailStaffRole } from './api';
import { spyMailCopy } from './copy';
import styles from './AdminSpyMailPage.module.css';

export type SpyMailCopy = typeof spyMailCopy;

type AddMode = 'role' | 'email';

function addModes(channel: SpyMailChannel, staffRoles: SpyMailStaffRole[]): AddMode[] {
  const modes: AddMode[] = [];
  if (channel.filters.includes('role') && staffRoles.length > 0) modes.push('role');
  if (channel.filters.includes('email')) modes.push('email');
  return modes;
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2 3.5H12M5.4 3.5V2.2C5.4 1.9 5.6 1.7 5.9 1.7H8.1C8.4 1.7 8.6 1.9 8.6 2.2V3.5M3.6 3.5 4.1 11.9C4.1 12.2 4.4 12.4 4.6 12.4H9.4C9.7 12.4 9.9 12.2 9.9 11.9L10.4 3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function channelSearchBlob(channel: SpyMailChannel): string {
  return [channel.title, channel.description, channel.pluginId, channel.id].join(' ').toLowerCase();
}

export function SpyMailChannels({
  channels,
  staffRoles,
  copy,
  showPluginId = true,
  showSearch = false,
  busyId,
  onToggle,
  onAdd,
  onRemove,
}: {
  channels: SpyMailChannel[];
  staffRoles: SpyMailStaffRole[];
  copy: SpyMailCopy;
  showPluginId?: boolean;
  showSearch?: boolean;
  busyId: string | null;
  onToggle: (channel: SpyMailChannel, enabled: boolean) => void;
  onAdd: (channel: SpyMailChannel, filter: 'role' | 'email', value: string) => void;
  onRemove: (id: string, channelId: string) => void;
}) {
  const { t } = useLang();
  const [search, setSearch] = useState('');
  const [draftEmail, setDraftEmail] = useState<Record<string, string>>({});
  const [draftRole, setDraftRole] = useState<Record<string, string>>({});
  const [addMode, setAddMode] = useState<Record<string, AddMode>>({});
  const roleOptions = staffRoles.map((role) => ({ value: role.code, label: role.label }));
  const visible = useMemo(() => {
    if (!showSearch) return channels;
    const needle = search.trim().toLowerCase();
    if (!needle) return channels;
    return channels.filter((channel) => channelSearchBlob(channel).includes(needle));
  }, [channels, search, showSearch]);

  return (
    <>
      {showSearch ? (
        <label className={styles.searchField}>
          <span>{copy.searchLabel}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={copy.searchPlaceholder}
            autoComplete="off"
          />
        </label>
      ) : null}
      {showSearch && visible.length === 0 ? <p className={styles.noneYet}>{copy.searchEmpty}</p> : null}
      {visible.map((channel) => {
        const modes = addModes(channel, staffRoles);
        const mode = addMode[channel.id] ?? modes[0];
        const roleValue = draftRole[channel.id] ?? staffRoles[0]?.code ?? '';
        const emailValue = draftEmail[channel.id] ?? '';
        const busy = busyId === channel.id;
        return (
          <article key={channel.id} className={styles.panel}>
            <h2 className={styles.panelTitle}>{channel.title}</h2>
            <p className={styles.panelHint}>{channel.description}</p>
            {showPluginId ? (
              <p className={styles.panelHint}>
                {copy.plugin}: {channel.pluginId} · {channel.id}
              </p>
            ) : (
              <p className={styles.panelHint}>{channel.id}</p>
            )}
            <div className={styles.toggleRow}>
              <div className={styles.toggleText}>
                <strong>{copy.enabled}</strong>
              </div>
              <ToggleSwitch
                checked={channel.enabled}
                disabled={busy}
                onChange={(checked) => onToggle(channel, checked)}
                aria-label={copy.enabled}
              />
            </div>
            <p className={styles.panelHint}>{copy.recipients}</p>
            {channel.recipients.length === 0 ? (
              <p className={styles.noneYet}>{copy.noneYet}</p>
            ) : (
              <ul className={styles.recipientList}>
                {channel.recipients.map((recipient) => (
                  <li key={recipient.id} className={styles.recipientRow}>
                    <span className={styles.recipientLabel}>
                      {recipient.filter === 'role' ? copy.filterRole : copy.filterEmail}: {recipient.value}
                    </span>
                    <button
                      type="button"
                      className={styles.removeButton}
                      disabled={busy}
                      onClick={() => onRemove(recipient.id, channel.id)}
                      aria-label={`${copy.remove} ${recipient.value}`}
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {modes.length > 0 ? (
              <div className={styles.addBlock}>
                {modes.length > 1 && mode ? (
                  <SegmentedSwitch
                    className={styles.modeSwitch}
                    ariaLabel={copy.recipientType}
                    options={modes.map((entry) => ({
                      key: entry,
                      label: entry === 'role' ? copy.filterRole : copy.filterEmail,
                    }))}
                    activeKey={mode}
                    onSelect={(key) =>
                      setAddMode((current) => ({ ...current, [channel.id]: key as AddMode }))
                    }
                  />
                ) : null}
                <div className={styles.addControls}>
                  {mode === 'role' ? (
                    <AdminFilterSelect
                      label={copy.filterRole}
                      options={roleOptions}
                      value={roleValue}
                      onChange={(value) => setDraftRole((current) => ({ ...current, [channel.id]: value }))}
                      closeLabel={t.gallery.close}
                      disabled={busy}
                      filter={{
                        label: copy.roleSearch,
                        placeholder: copy.roleSearch,
                        empty: copy.roleSearchEmpty,
                      }}
                    />
                  ) : (
                    <label className={styles.field}>
                      <span>{copy.filterEmail}</span>
                      <input
                        type="email"
                        value={emailValue}
                        placeholder={copy.emailPlaceholder}
                        autoComplete="off"
                        disabled={busy}
                        onChange={(event) =>
                          setDraftEmail((current) => ({ ...current, [channel.id]: event.target.value }))
                        }
                      />
                    </label>
                  )}
                  <div className={styles.addActions}>
                    <Button
                      variant="primary"
                      type="button"
                      disabled={busy || (mode === 'role' ? !roleValue : !emailValue.trim())}
                      onClick={() => {
                        if (mode === 'role') onAdd(channel, 'role', roleValue);
                        else {
                          onAdd(channel, 'email', emailValue);
                          setDraftEmail((current) => ({ ...current, [channel.id]: '' }));
                        }
                      }}
                    >
                      {copy.add}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </>
  );
}
