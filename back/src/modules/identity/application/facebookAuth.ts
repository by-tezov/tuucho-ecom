import { config } from '../../../config/env.js';

export interface VerifiedFacebookProfile {
  userId: string;
  email: string;
}

export function isFacebookSignInConfigured(): boolean {
  return Boolean(config.facebook.appId && config.facebook.appSecret);
}

interface DebugTokenResponse {
  data?: {
    app_id?: string;
    is_valid?: boolean;
    user_id?: string;
    scopes?: string[];
  };
  error?: { message?: string };
}

interface MeResponse {
  id?: string;
  email?: string;
  error?: { message?: string; type?: string; code?: number };
}

/** Verifies a short-lived Facebook user access token from the JS SDK. */
export async function verifyFacebookAccessToken(accessToken: string): Promise<VerifiedFacebookProfile> {
  const appId = config.facebook.appId;
  const appSecret = config.facebook.appSecret;
  if (!appId || !appSecret) {
    throw new Error('facebook_sign_in_disabled');
  }

  const appAccessToken = `${appId}|${appSecret}`;
  const debugUrl = new URL('https://graph.facebook.com/debug_token');
  debugUrl.searchParams.set('input_token', accessToken);
  debugUrl.searchParams.set('access_token', appAccessToken);

  const debugRes = await fetch(debugUrl);
  const debugJson = (await debugRes.json()) as DebugTokenResponse;
  if (
    !debugRes.ok ||
    !debugJson.data?.is_valid ||
    debugJson.data.app_id !== appId ||
    !debugJson.data.user_id
  ) {
    throw new Error('invalid_facebook_token');
  }

  const scopes = debugJson.data.scopes ?? [];
  if (!scopes.includes('email')) {
    throw new Error('facebook_email_required');
  }

  const meUrl = new URL('https://graph.facebook.com/me');
  meUrl.searchParams.set('fields', 'id,email');
  meUrl.searchParams.set('access_token', accessToken);

  const meRes = await fetch(meUrl);
  const meJson = (await meRes.json()) as MeResponse;
  if (!meRes.ok || meJson.error || !meJson.id) {
    throw new Error('invalid_facebook_token');
  }

  const email = meJson.email?.trim().toLowerCase();
  if (!email) {
    throw new Error('facebook_email_required');
  }

  if (meJson.id !== debugJson.data.user_id) {
    throw new Error('invalid_facebook_token');
  }

  return { userId: meJson.id, email };
}
