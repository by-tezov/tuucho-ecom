import { FIELD_GIFT_COMMENT_MAX, FIELD_GIFT_COMMENT_MAX_LINES } from './fieldLimits';

export function giftCommentLineCount(value: string): number {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n').length;
}

/** Caps typed gift messages to the share-card print limits. */
export function clampGiftComment(value: string): string {
  const normalized = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const byLines = normalized.split('\n').slice(0, FIELD_GIFT_COMMENT_MAX_LINES).join('\n');
  return byLines.length > FIELD_GIFT_COMMENT_MAX ? byLines.slice(0, FIELD_GIFT_COMMENT_MAX) : byLines;
}

export function giftCommentFits(value: string): boolean {
  return (
    value.length <= FIELD_GIFT_COMMENT_MAX && giftCommentLineCount(value) <= FIELD_GIFT_COMMENT_MAX_LINES
  );
}
