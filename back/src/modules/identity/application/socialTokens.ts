/**
 * Identity's public contract for short-lived social sign-in tokens.
 *
 * `auth`'s sign-up flows and `account`'s link flows both issue and consume
 * these, and neither may reach into another module's `infrastructure/`. This
 * is that boundary: the storage shape stays private to identity, and what
 * other modules may do with it is stated here.
 */
export {
  consumeSocialLinkToken,
  consumeSocialSignupToken,
  issueSocialLinkToken,
  issueSocialSignupToken,
} from '../infrastructure/socialTokenStore.js';
export type {
  SocialLinkTokenDefinition,
  SocialSignupTokenDefinition,
} from '../infrastructure/socialTokenStore.js';
