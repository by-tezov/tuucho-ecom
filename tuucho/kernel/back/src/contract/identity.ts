/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/identity.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  pendingEmail: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: 'active' | 'pending_deletion' | 'deleted' | 'locked';
  /** `user` (customer), `super-admin`, or a staff role code. Any role other than
   * `user` opens the administration area; `GET /admin/access` returns what
   * it may do there. */
  role: string;
  deletionScheduledFor: string | null;
  /** False for OTP-created accounts until they set a password. Older
   * backends may omit it — treat missing as true. */
  hasPassword?: boolean;
  /** True when Sign in with Google is linked. Older backends may omit it —
   * treat missing as false until the next profile/session refresh. */
  hasGoogle?: boolean;
  /** Google profile email when linked (may equal `email`). */
  googleEmail?: string | null;
  /** True when Sign in with Apple is linked. */
  hasApple?: boolean;
  /** Apple profile email when linked (may equal `email`). */
  appleEmail?: string | null;
  /** True when Facebook Login is linked. */
  hasFacebook?: boolean;
  /** Facebook profile email when linked (may equal `email`). */
  facebookEmail?: string | null;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: string;
  reactivated?: boolean;
  /** True when this call just created the account (`201`) — OTP signup,
   * loginOrRegister's password create-or-connect branch, or Google signup. */
  created?: boolean;
}

export interface GoogleSignInNeedsConsent {
  success: true;
  needsConsent: true;
  googleSignupToken: string;
}

export interface SocialSignInNeedsAccountChoice {
  success: true;
  needsAccountChoice: true;
  socialPendingToken: string;
  provider: 'google' | 'apple' | 'facebook';
  socialEmail: string | null;
}

export type GoogleSignInResult = AuthSession | GoogleSignInNeedsConsent | SocialSignInNeedsAccountChoice;

export interface AppleSignInNeedsConsent {
  success: true;
  needsConsent: true;
  appleSignupToken: string;
}

export type AppleSignInResult = AuthSession | AppleSignInNeedsConsent | SocialSignInNeedsAccountChoice;

export interface FacebookSignInNeedsConsent {
  success: true;
  needsConsent: true;
  facebookSignupToken: string;
}

export type FacebookSignInResult = AuthSession | FacebookSignInNeedsConsent | SocialSignInNeedsAccountChoice;

export interface RefreshedSession {
  /** Present on current backends — same public user shape as login/register.
   * Older deploy overlap may omit it; AuthContext falls back to getProfile. */
  user?: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export type AuthOtpPurpose = 'signup' | 'login';

export type FacebookDataDeletionStatus =
  'received' | 'facebook_unlinked' | 'account_deletion_scheduled' | 'no_matching_account';

export type ManageGuestOrderResult =
  (AuthSession & { alreadyManaged?: false }) | { success: true; alreadyManaged: true };
