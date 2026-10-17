import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@kernel/front/api/errors';
import { useAuthSession } from '@kernel/front/state/AuthContext';
import { withMinDuration } from '@kernel/front/utils/withMinDuration';
import {
  addAdminSpyMailRecipient,
  deleteAdminSpyMailRecipient,
  getAdminSpyMail,
  patchAdminSpyMailChannel,
  type SpyMailChannel,
  type SpyMailStaffRole,
} from './api';
import { spyMailCopy } from './copy';
import { spyMailLoadError, useSpyMailCopy, type SpyMailCopy } from './useSpyMailCopy';

export function useSpyMailAdmin(channelIds?: ReadonlySet<string>): {
  copy: SpyMailCopy;
  channels: SpyMailChannel[];
  staffRoles: SpyMailStaffRole[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  reload: () => Promise<void>;
  toggle: (channel: SpyMailChannel, enabled: boolean) => Promise<void>;
  addFilter: (channel: SpyMailChannel, filter: 'role' | 'email', value: string) => Promise<void>;
  remove: (id: string, channelId: string) => Promise<void>;
} {
  const copy = useSpyMailCopy();
  const { authedRequest } = useAuthSession();
  const [channels, setChannels] = useState<SpyMailChannel[]>([]);
  const [staffRoles, setStaffRoles] = useState<SpyMailStaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await authedRequest((token) => getAdminSpyMail(token));
    const list = channelIds ? data.channels.filter((channel) => channelIds.has(channel.id)) : data.channels;
    setChannels(list);
    setStaffRoles(data.staffRoles);
  }, [authedRequest, channelIds]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void withMinDuration(reload(), 250)
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = err instanceof ApiError ? err.status : 0;
        setError(spyMailLoadError(status, spyMailCopy));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function toggle(channel: SpyMailChannel, enabled: boolean) {
    setBusyId(channel.id);
    setError(null);
    try {
      await authedRequest((token) => patchAdminSpyMailChannel(token, channel.id, enabled));
      await reload();
    } catch {
      setError(copy.saveError);
    } finally {
      setBusyId(null);
    }
  }

  async function addFilter(channel: SpyMailChannel, filter: 'role' | 'email', value: string) {
    setBusyId(channel.id);
    setError(null);
    try {
      await authedRequest((token) => addAdminSpyMailRecipient(token, channel.id, filter, value));
      await reload();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'not_staff_account') setError(copy.notStaff);
      else if (code === 'invalid_role') setError(copy.invalidRole);
      else setError(copy.saveError);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, channelId: string) {
    setBusyId(channelId);
    setError(null);
    try {
      await authedRequest((token) => deleteAdminSpyMailRecipient(token, id));
      await reload();
    } catch {
      setError(copy.saveError);
    } finally {
      setBusyId(null);
    }
  }

  return { copy, channels, staffRoles, loading, error, busyId, reload, toggle, addFilter, remove };
}
