/** Stamped on new accounts (password register, OTP signup, Google and
 * Facebook signup, and guest-order manage-link account creation). Guest
 * checkout only requires `gdprConsent.accepted`; this is the version those
 * later account inserts record. Keep in lockstep with the live privacy
 * policy date. */
export const GDPR_CONSENT_VERSION = '2026-08-26';
