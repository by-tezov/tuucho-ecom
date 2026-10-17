import type { AuthUser } from '../../../api/identity';

export type AuthedRequest = <T>(fn: (accessToken: string) => Promise<T>) => Promise<T>;

export interface AccountUserSectionProps {
  t: import('../../../assets/i18n/types').Strings;
  user: AuthUser;
  setUser: (user: AuthUser) => void;
  authedRequest: AuthedRequest;
}
