import { useMemo } from 'react';
import { useAdminStrings } from '@kernel/front/assets/i18n/admin';
import type { SpyMailCopy } from './copy';

export type { SpyMailCopy };

export function useSpyMailCopy(): SpyMailCopy {
  const a = useAdminStrings() as ReturnType<typeof useAdminStrings> & { spyMail?: SpyMailCopy };
  const copy = a.spyMail;
  return useMemo(() => {
    if (!copy) {
      throw new Error('Spy mail admin copy missing: enable tuucho-mail-spy-locale-en or locale-fr');
    }
    return copy;
  }, [copy]);
}

export function spyMailLoadError(status: number, copy: SpyMailCopy): string {
  if (status === 403) return copy.forbidden;
  if (status === 404) return copy.missingRoute;
  return copy.loadError;
}
