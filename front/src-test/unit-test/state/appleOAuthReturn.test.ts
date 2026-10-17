import { describe, expect, it } from 'vitest';
import {
  stashAppleLinkCredential,
  takeAppleLinkCredential,
  takeAppleOAuthReturnBridge,
  takeAppleOAuthReturnPending,
} from '../../../src/state/appleOAuthReturn';

const PENDING_KEY = 'psn-apple-oauth-return-v1';
const BRIDGE_KEY = 'psn-apple-oauth-return-bridge-v1';

const validPending = {
  resumePath: '/fr/cart',
  purpose: 'signIn',
  state: 'state-1',
  nonce: 'nonce-1',
};

describe('Apple OAuth return pending context', () => {
  it('is read once, then gone', () => {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(validPending));
    expect(takeAppleOAuthReturnPending()).toEqual(validPending);
    expect(takeAppleOAuthReturnPending()).toBeNull();
  });

  it('migrates the legacy key and still consumes it', () => {
    window.sessionStorage.setItem('pamsurin.appleOAuthReturn', JSON.stringify(validPending));
    expect(takeAppleOAuthReturnPending()?.state).toBe('state-1');
    expect(window.sessionStorage.getItem('pamsurin.appleOAuthReturn')).toBeNull();
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it.each([
    ['an absolute resume URL (open redirect)', { resumePath: 'https://evil.example/' }],
    ['an unknown purpose', { purpose: 'delete' }],
    ['a missing state', { state: '' }],
    ['a missing nonce', { nonce: undefined }],
  ])('rejects %s and still clears storage', (_label, override) => {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...validPending, ...override }));
    expect(takeAppleOAuthReturnPending()).toBeNull();
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });
});

describe('Apple link credential', () => {
  it('round-trips trimmed values exactly once', () => {
    stashAppleLinkCredential({ idToken: ' id ', unlockToken: ' unlock ', nonce: ' n ' });
    expect(takeAppleLinkCredential()).toEqual({ idToken: 'id', unlockToken: 'unlock', nonce: 'n' });
    expect(takeAppleLinkCredential()).toBeNull();
  });

  it('rejects a credential missing any part', () => {
    stashAppleLinkCredential({ idToken: 'id', unlockToken: '  ', nonce: 'n' });
    expect(takeAppleLinkCredential()).toBeNull();
  });
});

describe('Apple form_post bridge', () => {
  it('returns the token or the error written by apple-return.php, once', () => {
    window.sessionStorage.setItem(BRIDGE_KEY, JSON.stringify({ idToken: ' tok ', state: ' s ' }));
    expect(takeAppleOAuthReturnBridge()).toEqual({ idToken: 'tok', state: 's', error: null });
    expect(takeAppleOAuthReturnBridge()).toBeNull();

    window.sessionStorage.setItem(BRIDGE_KEY, JSON.stringify({ error: 'user_cancelled_authorize' }));
    expect(takeAppleOAuthReturnBridge()).toEqual({
      idToken: null,
      state: null,
      error: 'user_cancelled_authorize',
    });
  });

  it('ignores a bridge that carries neither a token nor an error', () => {
    window.sessionStorage.setItem(BRIDGE_KEY, JSON.stringify({ state: 's' }));
    expect(takeAppleOAuthReturnBridge()).toBeNull();
    window.sessionStorage.setItem(BRIDGE_KEY, 'not json');
    expect(takeAppleOAuthReturnBridge()).toBeNull();
  });
});
