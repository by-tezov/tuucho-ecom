/**
 * Identity's public contract for the short-lived handshake that carries an
 * in-flight social sign-in between the provider redirect and the callback.
 *
 * `auth` drives that flow but may not reach into identity's
 * `infrastructure/`, so what it is allowed to do is named here.
 */
export {
  consumeSocialAuthPending,
  issueSocialAuthPending,
  peekSocialAuthPending,
} from '../infrastructure/socialAuthPending.js';
export type {
  IssuedSocialAuthPending,
  SocialAuthPending,
  SocialAuthProvider,
} from '../infrastructure/socialAuthPending.js';
