import { Router } from 'express';
import { config } from '@kernel/back/config/env';
import { pool } from '@kernel/back/db/pool';
import { authRateLimiter } from '@kernel/back/middleware/rateLimiters';
import {
  giftPinRateLimiter,
  giftShareCardDownloadRateLimiter,
  giftShareCardEmailRateLimiter,
  giftShareCardUpdateRateLimiter,
} from './giftRateLimiters.js';
import { optionalAuth } from '@kernel/back/middleware/optionalAuth';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import { accountCreatedSpyEmail, sendMail, spyTo } from '@kernel/back/modules/messaging/application/email';
import * as cart from '@kernel/back/modules/cart/application/cart';
import {
  accessTokenExpiresAt,
  createRefreshToken,
  revokeRefreshToken,
  signAccessToken,
} from '@kernel/back/platform/security/token';
import { toPublicUser } from '@kernel/back/modules/identity/application/users';
import {
  clearRefreshTokenCookie,
  getRefreshTokenCookie,
  serializeRefreshTokenCookie,
} from '@kernel/back/utils/cookies';
import { boundedVoucherCode } from '@kernel/back/utils/fieldLimits';
import { isNonEmptyString } from '@kernel/back/utils/validate';
import { giverPortalPayload } from '../application/giverPortal.js';
import { cancelGiftOffer, extendGiftOffer } from '../application/giverActions.js';
import {
  parseShareCardFormat,
  parseShareCardPatch,
  renderShareCardFile,
  resendShareCardMail,
  updateShareCard,
} from '../application/shareCardManage.js';
import { openGiftPay } from '../application/openPay.js';
import { unlockGiverCart } from '../application/unlockGiverCart.js';
import { loadGiverOffer } from '../application/loadOffer.js';
import { assertGiverCheckoutUser } from '../application/giftCheckout.js';
import { setGiftCartCheckout } from '../infrastructure/giftCart.js';
import { failGift } from '../domain/errors.js';
import { rawPathToken, withGiftErrors } from './giftErrors.js';
import { unlockGiftPin } from '../application/giftPin.js';
import { requireGiftPin } from './giftPinGuard.js';
import {
  giftPinBodySchema,
  giftShareCardFormatQuerySchema,
  giftShareCardPatchBodySchema,
  parseGiftSchema,
} from './giftSchemas.js';

export const giftGiverRouter = Router();

giftGiverRouter.post('/giver/:token/pin', giftPinRateLimiter, async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadGiverOffer(pool, token);
    const pinBody = parseGiftSchema(giftPinBodySchema, req.body ?? {});
    const unlocked = await unlockGiftPin(pool, offer, 'giver', pinBody?.pin);
    res.json({ success: true, pinToken: unlocked.pinToken, expiresAt: unlocked.expiresAt.toISOString() });
  });
});

giftGiverRouter.use('/giver/:token', optionalAuth, requireGiftPin('giver'));

giftGiverRouter.get('/giver/:token', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadGiverOffer(pool, token);
    res.json({ success: true, ...(await giverPortalPayload(pool, offer)) });
  });
});

giftGiverRouter.post('/giver/:token/open-pay', authRateLimiter, async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const result = await openGiftPay(pool, token);
    // Refresh cookies are Path=/auth, so a remembered login is usually not
    // on this request. The shop must POST /auth/logout first; this revoke
    // is only a backstop if a cookie is ever sent here.
    const presented = getRefreshTokenCookie(req);
    if (presented) await revokeRefreshToken(pool, presented);
    const accessToken = signAccessToken({ sub: result.user.id, email: result.user.email });
    const refresh = await createRefreshToken(pool, result.user.id, false, {
      ip: req.ip,
      userAgent: req.header('user-agent'),
    });
    res.setHeader('Set-Cookie', [
      clearRefreshTokenCookie(config.isDevelopment),
      serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, false, config.isDevelopment),
    ]);
    res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      cartId: result.cartId,
      offerId: result.offer.id,
      user: toPublicUser(result.user),
      accessToken,
      accessTokenExpiresAt: accessTokenExpiresAt(),
    });
    if (result.created) {
      void spyTo('account_created')
        .then((to) => {
          if (!to) return;
          return sendMail({
            to,
            ...accountCreatedSpyEmail({ email: result.user.email, userId: result.user.id }),
          });
        })
        .catch((error) => console.error('[gift] spy notification failed', error));
    }
  });
});

giftGiverRouter.post('/giver/:token/cancel', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await cancelGiftOffer(pool, token);
    res.json({ success: true, status: offer.status });
  });
});

giftGiverRouter.post('/giver/:token/extend', giftShareCardUpdateRateLimiter, async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const { offer, canExtend } = await extendGiftOffer(pool, token);
    res.json({
      success: true,
      offerExpiresAt: offer.offerExpiresAt?.toISOString() ?? null,
      canExtend,
    });
  });
});

giftGiverRouter.patch('/giver/:token/share-card', giftShareCardUpdateRateLimiter, async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const patch = parseGiftSchema(giftShareCardPatchBodySchema, req.body ?? {});
    const parsed = patch ? parseShareCardPatch(patch) : null;
    if (!parsed) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await updateShareCard(pool, token, parsed);
    res.json({
      success: true,
      receiverName: offer.receiverName,
      giverComment: offer.giverComment,
      shareCardStyle: offer.shareCardStyle,
    });
  });
});

giftGiverRouter.get('/giver/:token/share-card/download', giftShareCardDownloadRateLimiter, async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const query = parseGiftSchema(giftShareCardFormatQuerySchema, req.query ?? {});
    const format = parseShareCardFormat(query?.format);
    const file = await renderShareCardFile(pool, token, format);
    res.setHeader('content-type', file.contentType);
    res.setHeader('content-disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  });
});

giftGiverRouter.post('/giver/:token/share-card/email', giftShareCardEmailRateLimiter, async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    await resendShareCardMail(pool, token);
    res.json({ success: true });
  });
});

giftGiverRouter.post('/giver/:token/unlock-cart', requireAuth, async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    await unlockGiverCart(pool, token, req.user!.id);
    res.json({ success: true });
  });
});

giftGiverRouter.get('/giver/:token/cart', requireAuth, async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadGiverOffer(pool, token);
    await assertGiverCheckoutUser(offer, req.user!.id);
    const row = await cart.getCartForUser(pool, req.user!.id, offer.cartId!);
    if (!row) failGift('not_found');
    const items = await cart.listItemsForCart(pool, row.id);
    res.json({
      success: true,
      cart: {
        id: row.id,
        name: row.name,
        kind: row.kind,
        isActive: row.is_active,
      },
      selection: {
        addressId: row.address_id,
        courierCode: row.courier_code,
        express: row.express,
        billingAddressId: row.billing_address_id,
        sameAsBilling: row.same_as_billing,
        paymentMethodId: row.payment_method_id,
        voucherCode: row.voucher_code,
        applyLoyalty: row.apply_loyalty,
      },
      items: items.map((item) => ({
        productId: item.product_id,
        shapeKey: item.shape_key,
        lengthKey: item.length_key,
        size: item.size,
        packKey: item.pack_key,
        quantity: item.quantity,
        origin: item.origin,
        locked: item.locked,
      })),
    });
  });
});

giftGiverRouter.put('/giver/:token/cart', requireAuth, async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadGiverOffer(pool, token);
    await assertGiverCheckoutUser(offer, req.user!.id);
    const body = req.body ?? {};
    await setGiftCartCheckout(pool, offer.cartId!, {
      addressId:
        body.addressId === undefined ? undefined : isNonEmptyString(body.addressId) ? body.addressId : null,
      billingAddressId:
        body.billingAddressId === undefined
          ? undefined
          : isNonEmptyString(body.billingAddressId)
            ? body.billingAddressId
            : null,
      courierCode:
        body.courierCode === undefined
          ? undefined
          : isNonEmptyString(body.courierCode)
            ? body.courierCode
            : null,
      voucherCode:
        body.voucherCode === undefined
          ? undefined
          : (boundedVoucherCode(body.voucherCode) ??
            (body.voucherCode === null || body.voucherCode === '' ? null : undefined)),
      applyLoyalty: typeof body.applyLoyalty === 'boolean' ? body.applyLoyalty : undefined,
      express: typeof body.express === 'boolean' ? body.express : undefined,
    });
    res.json({ success: true });
  });
});
