import { describe, expect, it } from 'vitest';
import { clampGiftComment, giftCommentFits, giftCommentLineCount } from '@/utils/giftComment';

describe('giftComment', () => {
  it('counts CRLF as one line break', () => {
    expect(giftCommentLineCount('a\r\nb\nc')).toBe(3);
  });

  it('clamps to 6 lines and keeps the first ones', () => {
    expect(clampGiftComment('a\nb\nc\nd\ne\nf\ng\nh')).toBe('a\nb\nc\nd\ne\nf');
    expect(giftCommentFits('a\nb\nc\nd\ne\nf')).toBe(true);
    expect(giftCommentFits('a\nb\nc\nd\ne\nf\ng')).toBe(false);
  });
});
