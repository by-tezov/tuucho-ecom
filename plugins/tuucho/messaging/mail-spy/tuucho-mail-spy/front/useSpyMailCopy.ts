import { useMemo } from 'react';
import { useAdminStrings } from '@kernel/front/assets/i18n/admin';
import { spyMailCopy } from './copy';

export type SpyMailCopy = typeof spyMailCopy;

export function useSpyMailCopy(): SpyMailCopy {
  const a = useAdminStrings() as ReturnType<typeof useAdminStrings> & { spyMail?: Partial<SpyMailCopy> };
  const overlay = a.spyMail;
  return useMemo(() => ({ ...spyMailCopy, ...(overlay ?? {}) }), [overlay]);
}

export function spyMailLoadError(status: number, copy: SpyMailCopy): string {
  if (status === 403) return copy.forbidden;
  if (status === 404) return copy.missingRoute;
  return copy.loadError;
}
