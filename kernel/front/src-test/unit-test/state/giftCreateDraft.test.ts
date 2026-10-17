import { afterEach, describe, expect, it } from 'vitest';
import {
  clearGiftCreateDraft,
  GIFT_CREATE_DRAFT_STORAGE_KEY,
  loadGiftCreateDraft,
  saveGiftCreateDraft,
} from '@/state/giftCreateDraft';

afterEach(() => {
  window.sessionStorage.clear();
});

describe('gift create draft', () => {
  it('returns empty fields when nothing is stored', () => {
    expect(loadGiftCreateDraft().receiverName).toBe('');
    expect(loadGiftCreateDraft().shareCardStyle).toBe('pamsurin');
    expect(loadGiftCreateDraft().hidePrices).toBe(true);
  });

  it('round-trips typed fields through sessionStorage', () => {
    saveGiftCreateDraft({
      giverEmail: 'marc@example.com',
      giverDisplayName: 'Marc',
      receiverName: 'Julie',
      maxBudget: '40',
      giverComment: 'Pour toi',
      shareCardStyle: 'halloween',
      allowAccessories: true,
      maxAccessoryBudget: '5',
      hidePrices: false,
      accessPin: '1234',
      accessPinConfirm: '1234',
      gdpr: true,
    });
    expect(window.sessionStorage.getItem(GIFT_CREATE_DRAFT_STORAGE_KEY)).not.toBeNull();
    expect(loadGiftCreateDraft()).toEqual({
      giverEmail: 'marc@example.com',
      giverDisplayName: 'Marc',
      receiverName: 'Julie',
      maxBudget: '40',
      giverComment: 'Pour toi',
      shareCardStyle: 'halloween',
      allowAccessories: true,
      maxAccessoryBudget: '5',
      hidePrices: false,
      accessPin: '',
      accessPinConfirm: '',
      gdpr: true,
    });
  });

  it('clamps a stored comment to 6 lines', () => {
    window.sessionStorage.setItem(
      GIFT_CREATE_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...loadGiftCreateDraft(),
        giverComment: 'a\nb\nc\nd\ne\nf\ng',
      }),
    );
    expect(loadGiftCreateDraft().giverComment).toBe('a\nb\nc\nd\ne\nf');
  });

  it('never persists the PIN', () => {
    saveGiftCreateDraft({
      ...loadGiftCreateDraft(),
      accessPin: '1234',
      accessPinConfirm: '1234',
    });
    const stored = window.sessionStorage.getItem(GIFT_CREATE_DRAFT_STORAGE_KEY);
    expect(stored).not.toContain('1234');
    expect(loadGiftCreateDraft().accessPin).toBe('');
    expect(loadGiftCreateDraft().accessPinConfirm).toBe('');
  });

  it('clears the tab draft', () => {
    saveGiftCreateDraft({
      ...loadGiftCreateDraft(),
      receiverName: 'Julie',
    });
    clearGiftCreateDraft();
    expect(window.sessionStorage.getItem(GIFT_CREATE_DRAFT_STORAGE_KEY)).toBeNull();
    expect(loadGiftCreateDraft().receiverName).toBe('');
  });
});
