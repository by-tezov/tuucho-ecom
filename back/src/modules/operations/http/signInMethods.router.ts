import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import {
  patchAppPreferences,
  readShopSignInMethodsSnapshot,
  type ShopSignInMethodsSnapshot,
} from '../../settings/application/appPreferences.js';
import { recordOperatorActivityBestEffort } from '../../activity/application/recordOperatorActivity.js';

/** OPS-only shop-wide third-party sign-in controls. Mounted at
 * `/operation/sign-in-methods`, never on the public application router. */
export const signInMethodsRouter = Router();

const FLAG_FIELDS = [
  'google',
  'facebook',
  'apple',
  'facebookMobileDirectOAuthEnabled',
  'googleVerbose',
  'facebookVerbose',
  'appleVerbose',
] as const satisfies ReadonlyArray<keyof ShopSignInMethodsSnapshot>;

signInMethodsRouter.get('/', async (_req, res) => {
  res.json({ success: true, signInMethods: await readShopSignInMethodsSnapshot(pool) });
});

signInMethodsRouter.patch('/', async (req, res) => {
  const body = req.body ?? {};
  if (FLAG_FIELDS.some((field) => body[field] !== undefined && typeof body[field] !== 'boolean')) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (!FLAG_FIELDS.some((field) => typeof body[field] === 'boolean')) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  await patchAppPreferences(
    pool,
    {
      ...(typeof body.google === 'boolean' ? { signInGoogleEnabled: body.google } : {}),
      ...(typeof body.facebook === 'boolean' ? { signInFacebookEnabled: body.facebook } : {}),
      ...(typeof body.apple === 'boolean' ? { signInAppleEnabled: body.apple } : {}),
      ...(typeof body.facebookMobileDirectOAuthEnabled === 'boolean'
        ? { facebookMobileDirectOAuthEnabled: body.facebookMobileDirectOAuthEnabled }
        : {}),
      ...(typeof body.googleVerbose === 'boolean' ? { signInGoogleVerboseEnabled: body.googleVerbose } : {}),
      ...(typeof body.facebookVerbose === 'boolean'
        ? { signInFacebookVerboseEnabled: body.facebookVerbose }
        : {}),
      ...(typeof body.appleVerbose === 'boolean' ? { signInAppleVerboseEnabled: body.appleVerbose } : {}),
    },
    null,
  );
  const signInMethods = await readShopSignInMethodsSnapshot(pool);
  await recordOperatorActivityBestEffort(pool, {
    category: 'settings',
    action: 'sign_in_method.patch',
    summary: 'Mise a jour methodes de connexion',
    detail: { patch: body, signInMethods },
  });
  res.json({ success: true, signInMethods });
});
