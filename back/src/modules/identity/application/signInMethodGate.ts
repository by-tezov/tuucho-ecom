import type { Response } from 'express';
import {
  isShopSignInMethodEnabled,
  warmAppPreferences,
  type ShopSignInMethod,
} from '../../settings/application/appPreferences.js';
import { isAppleSignInConfigured } from './appleAuth.js';
import { isFacebookSignInConfigured } from './facebookAuth.js';
import { isGoogleSignInConfigured } from './googleAuth.js';

function isProviderConfigured(method: ShopSignInMethod): boolean {
  if (method === 'google') return isGoogleSignInConfigured();
  if (method === 'facebook') return isFacebookSignInConfigured();
  return isAppleSignInConfigured();
}

function disabledCode(method: ShopSignInMethod): string {
  if (method === 'google') return 'google_sign_in_disabled';
  if (method === 'facebook') return 'facebook_sign_in_disabled';
  return 'apple_sign_in_disabled';
}

/** Env missing → 503 with the historical code; shop admin/OPS off → 403.
 * Returns true when the response was already sent. */
export async function rejectUnavailableShopSignIn(res: Response, method: ShopSignInMethod): Promise<boolean> {
  await warmAppPreferences();
  if (!isProviderConfigured(method)) {
    res.status(503).json({
      success: false,
      error: { code: disabledCode(method) },
    });
    return true;
  }
  if (!isShopSignInMethodEnabled(method)) {
    res.status(403).json({ success: false, error: { code: 'sign_in_method_forbidden' } });
    return true;
  }
  return false;
}
