import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/config/env', () => ({
  shopConfig: { facebookAppId: '1234', facebookOauthReturnUrl: 'https://shop.example/facebook-return' },
}));

import {
  beginFacebookOAuthReturn,
  createFacebookOAuthState,
  facebookBrowserOAuthUrl,
  facebookLoginDialogOptions,
  parseFacebookRedirectResponse,
  stashFacebookLinkAccessToken,
  takeFacebookLinkAccessToken,
  takeFacebookOAuthReturnPending,
} from '../../../src/state/facebookOAuthReturn';

describe('Facebook OAuth return', () => {
  it('creates a fresh 256-bit hex state each time', () => {
    const first = createFacebookOAuthState();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(createFacebookOAuthState()).not.toBe(first);
  });

  it('restores the pending context once and rejects an unknown purpose', () => {
    beginFacebookOAuthReturn({ resumePath: '/fr/login', purpose: 'link', oauthState: 'abc' });
    expect(takeFacebookOAuthReturnPending()).toEqual({
      resumePath: '/fr/login',
      purpose: 'link',
      oauthState: 'abc',
    });
    expect(takeFacebookOAuthReturnPending()).toBeNull();

    window.sessionStorage.setItem(
      'psn-facebook-oauth-return-v1',
      JSON.stringify({ resumePath: '/fr', purpose: 'other' }),
    );
    expect(takeFacebookOAuthReturnPending()).toBeNull();
  });

  it('builds the browser OAuth URL with the CSRF state and registered redirect', () => {
    const url = new URL(facebookBrowserOAuthUrl('state-xyz') ?? '');
    expect(url.origin + url.pathname).toMatch(/^https:\/\/www\.facebook\.com\/v\d+\.\d+\/dialog\/oauth$/);
    expect(url.searchParams.get('client_id')).toBe('1234');
    expect(url.searchParams.get('redirect_uri')).toBe('https://shop.example/facebook-return');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('state')).toBe('state-xyz');
    expect(facebookLoginDialogOptions()).toEqual({
      scope: 'public_profile,email',
      return_scopes: true,
      fallback_redirect_uri: 'https://shop.example/facebook-return',
    });
  });

  it('parses a token from the fragment and a denial from the query', () => {
    expect(
      parseFacebookRedirectResponse('https://shop.example/facebook-return#access_token=%20tok%20&state=s1'),
    ).toEqual({ accessToken: 'tok', denied: false, errorMessage: null, oauthState: 's1' });

    expect(
      parseFacebookRedirectResponse(
        'https://shop.example/facebook-return?error=access_denied&error_reason=user_denied&state=s2',
      ),
    ).toEqual({ accessToken: null, denied: true, errorMessage: null, oauthState: 's2' });

    expect(parseFacebookRedirectResponse('https://shop.example/r?error=server_error').errorMessage).toBe(
      'server_error',
    );
    expect(parseFacebookRedirectResponse('not a url').accessToken).toBeNull();
  });

  it('keeps the link access token in memory for exactly one read', () => {
    stashFacebookLinkAccessToken(' token ');
    expect(window.sessionStorage.length).toBe(0);
    expect(takeFacebookLinkAccessToken()).toBe('token');
    expect(takeFacebookLinkAccessToken()).toBeNull();
  });
});
