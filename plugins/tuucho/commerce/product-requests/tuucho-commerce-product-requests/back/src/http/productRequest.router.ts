import { Router } from 'express';
import { config } from '@kernel/back/config/env';
import { pool } from '@kernel/back/db/pool';
import { optionalAuth } from '@kernel/back/middleware/optionalAuth';
import { contactRateLimiter } from '@kernel/back/middleware/rateLimiters';
import { productRequestSpyEmail, sendMail, spyTo } from '@kernel/back/modules/messaging/application/email';
import { insertProductRequest } from '../application/productRequest.js';
import type { PartialTrilingual, Size } from '@kernel/back/types';
import { boundedEmail, boundedPrintable, isPositiveIntegerAtMost } from '@kernel/back/utils/fieldLimits';
import { localize, requestLanguage } from '@kernel/back/utils/language';
import { requirePluginEnabled } from '@kernel/back/middleware/requirePluginEnabled';

export const productRequestRouter = Router();
productRequestRouter.use(requirePluginEnabled('tuucho-commerce-product-requests'));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIZES: Size[] = ['XS', 'S', 'M', 'L'];
/** Shape/length keys are short slugs from a closed vocabulary (see the
 * `shapes` / `shape_lengths` tables). This only stops an oversized body
 * from reaching the query; the lookup below is what actually validates them. */
const VARIANT_KEY_MAX = 64;

interface RequestedProduct {
  productUid: string;
  title: PartialTrilingual;
  price: number;
  photoPath: string | null;
  /** Null when the product doesn't (or no longer) offers the requested
   * shape — the raw key is reported instead, since the request is still
   * worth forwarding rather than rejecting. */
  shapeLabel: PartialTrilingual | null;
}

/** Same audience rule as products.service.ts's getProductsByIds: public
 * products for everyone, user-library ones only for an assigned account. */
async function findRequestedProduct(
  productId: string,
  shapeKey: string,
  userId: string | null,
): Promise<RequestedProduct | undefined> {
  const { rows } = await pool.query<{
    product_uid: string;
    title: PartialTrilingual;
    price: string;
    photo_path: string | null;
    shape_label: PartialTrilingual | null;
  }>(
    `select p.product_uid, p.title,
            (select price from product_prices where product_id = p.id and effective_at <= now() order by effective_at desc limit 1) as price,
            s.label as shape_label,
            (select small_path from product_photos where product_id = p.id and shape_key = $2 order by position limit 1) as photo_path
     from products p
     left join product_shapes ps on ps.product_id = p.id and ps.shape_key = $2
     left join shapes s on s.key = ps.shape_key
     where p.id = $1
       and (p.audience = 'public' or ($3::uuid is not null and exists (
         select 1 from product_user_library_users pulu
         where pulu.product_id = p.id and pulu.user_id = $3
       )))`,
    [productId, shapeKey, userId],
  );
  const row = rows[0];
  if (!row) return undefined;
  return {
    productUid: row.product_uid,
    title: row.title,
    price: Number(row.price),
    photoPath: row.photo_path,
    shapeLabel: row.shape_label,
  };
}

/** "This size is sold out — ask us to make it." Optional auth: a signed-in
 * customer's address and id are taken from the token (never the body), a
 * guest supplies the address the answer should go to. The row is stored
 * (`requested`) so ops can list / set-status; the spy email still fires
 * with replyTo so answering the customer is a plain reply. */
productRequestRouter.post('/product-request', contactRateLimiter, optionalAuth, async (req, res) => {
  const body = req.body ?? {};
  const productId =
    typeof body.productId === 'string' && UUID_RE.test(body.productId) ? body.productId : undefined;
  const shapeKey = boundedPrintable(body.shapeKey, VARIANT_KEY_MAX);
  const lengthKey = boundedPrintable(body.lengthKey, VARIANT_KEY_MAX);
  const size = SIZES.find((candidate) => candidate === body.size);
  const email = req.user ? req.user.email : boundedEmail(body.email);
  // Absent means one — the cart's own request entry points don't ask for a
  // quantity, only the gallery's "demander votre taille" dialog does.
  const quantity = body.quantity === undefined ? 1 : body.quantity;
  let comment: string | undefined;
  if (body.comment !== undefined && body.comment !== null) {
    if (typeof body.comment !== 'string') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    if (body.comment.trim().length > 0) {
      comment = boundedPrintable(body.comment, config.fieldLimits.productRequestCommentMax);
      if (!comment) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
    }
  }
  if (
    !productId ||
    !shapeKey ||
    !lengthKey ||
    !size ||
    !email ||
    !isPositiveIntegerAtMost(quantity, config.fieldLimits.cartQuantityMax)
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const product = await findRequestedProduct(productId, shapeKey, req.user?.id ?? null);
  if (!product) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }

  const titleFr = localize(product.title, 'fr');
  const shapeLabelFr = product.shapeLabel ? localize(product.shapeLabel, 'fr') : shapeKey;
  const request = await insertProductRequest(pool, {
    userId: req.user?.id ?? null,
    email,
    productId,
    productUid: product.productUid,
    titleFr,
    shapeKey,
    shapeLabelFr,
    lengthKey,
    size,
    quantity,
    unitPrice: product.price,
    photoPath: product.photoPath,
    comment: comment ?? null,
    language: requestLanguage(req),
  });

  const to = await spyTo('product_request');
  if (to) {
    try {
      await sendMail({
        to,
        ...productRequestSpyEmail({
          publicId: request.publicId,
          email,
          userId: req.user?.id ?? null,
          productUid: product.productUid,
          // The owner reads these, so the owner's own language — the customer
          // never sees this email.
          title: titleFr,
          shapeLabel: shapeLabelFr,
          lengthKey,
          size,
          quantity,
          ...(comment ? { comment } : {}),
        }),
      });
    } catch (error) {
      console.error('[product-request] delivery failed', error);
      // The request is already durable and is handled in the admin queue.
      // A mailbox outage must never tell the customer their request failed.
    }
  }

  res.status(201).json({ success: true });
});
