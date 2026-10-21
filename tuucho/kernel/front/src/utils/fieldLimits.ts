/**
 * Customer input field ceilings — mirrors kernel public JSON `fieldLimits`.
 * Keep in sync when those defaults change; the server still enforces.
 */
export const FIELD_EMAIL_MAX = 254;
export const FIELD_PASSWORD_MAX = 128;
export const FIELD_FIRST_NAME_MAX = 80;
export const FIELD_LAST_NAME_MAX = 80;
export const FIELD_PHONE_MAX = 32;
export const FIELD_CONTACT_IDENTITY_MAX = 160;
export const FIELD_CONTACT_MESSAGE_MAX = 5000;
/** Mirrors back-end `GIFT_COMMENT_MAX_LENGTH`. */
export const FIELD_GIFT_COMMENT_MAX = 500;
/** Mirrors back-end `GIFT_COMMENT_MAX_LINES` (share-card print). */
export const FIELD_GIFT_COMMENT_MAX_LINES = 6;
/** Mirrors back-end `FIELD_PRODUCT_REQUEST_COMMENT_MAX`. */
export const FIELD_PRODUCT_REQUEST_COMMENT_MAX = 500;
export const FIELD_ADDRESS_LABEL_MAX = 60;
export const FIELD_RECIPIENT_NAME_MAX = 100;
export const FIELD_COMPANY_NAME_MAX = 120;
export const FIELD_ADDRESS_LINE_MAX = 120;
export const FIELD_DELIVERY_NOTES_MAX = 200;
export const FIELD_POSTAL_CODE_MAX = 16;
export const FIELD_CITY_MAX = 80;
export const FIELD_CARDHOLDER_NAME_MAX = 100;
export const FIELD_VOUCHER_CODE_MAX = 64;
/** Mirrors back-end `FIELD_CART_NAME_MAX` (also re-exported as CART_NAME_MAX_LENGTH). */
export const FIELD_CART_NAME_MAX = 50;
/** Mirrors back-end `FIELD_CART_QUANTITY_MAX` — the per-line ceiling. Used
 * where there's no stock figure to clamp to, e.g. asking for a sold-out
 * size to be made (SizeRequestModal). */
export const FIELD_CART_QUANTITY_MAX = 99;
