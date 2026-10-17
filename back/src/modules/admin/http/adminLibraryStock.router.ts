import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { listLibrarySets } from '../../operations/application/libraryList.js';
import { setPriceIfChanged } from '../../catalog/application/prices.js';
import { recordAdminActivity } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';

import { requestedPage, requestedStockPageSize } from './adminPagination.js';
import {
  FEATURED_DAYS,
  STOCK_SIZES,
  adminLibraryStock,
  productUidMatchesSearch,
  requestedStockFilters,
  stockRowMatchesFilters,
  setStockProductFeatured,
  setStockProductHidden,
  shapeLengthLabels,
  toLibraryStockVariantRow,
  type AdminLibraryStockSizes,
  readNailVariantSnapshot,
} from './adminStockSupport.js';

export const adminLibraryStockRouter = Router();

adminLibraryStockRouter.get('/library-stock', requireAuth, requirePermission('library_stock'), async (req, res) => {
  const page = requestedPage(req.query.page);
  const pageSize = requestedStockPageSize(req.query.limit);
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const filters = requestedStockFilters(req.query);
  const rows = (await adminLibraryStock()).filter(
    (row) => productUidMatchesSearch(row.productUid, q) && stockRowMatchesFilters(row, filters),
  );
  res.json({
    success: true,
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    // The dashboard names the window on its button; sending it keeps the
    // number defined once, here.
    featuredDays: FEATURED_DAYS,
    pagination: {
      page,
      pageSize,
      total: rows.length,
      totalPages: Math.ceil(rows.length / pageSize),
    },
  });
});

adminLibraryStockRouter.patch(
  '/library-stock/:productUid/hidden',
  requireAuth,
  requirePermission('library_stock'),
  async (req, res) => {
    await setStockProductHidden(req, res, 'nail', 'public');
  },
);

adminLibraryStockRouter.patch(
  '/library-stock/:productUid/featured',
  requireAuth,
  requirePermission('library_stock'),
  async (req, res) => {
    await setStockProductFeatured(req, res);
  },
);

adminLibraryStockRouter.patch('/library-stock/:productUid', requireAuth, requirePermission('library_stock'), async (req, res) => {
  const productUid = typeof req.params.productUid === 'string' ? req.params.productUid.trim() : '';
  const shapeKey = typeof req.body?.shapeKey === 'string' ? req.body.shapeKey : '';
  const lengthKey = typeof req.body?.lengthKey === 'string' ? req.body.lengthKey : '';
  if (!productUid || !shapeKey || !lengthKey) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const priceRaw = req.body?.price;
  let price: number | undefined;
  if (priceRaw !== undefined && priceRaw !== null) {
    price = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw);
    if (!Number.isFinite(price) || price < 0) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
  }

  let sizes: AdminLibraryStockSizes | undefined;
  if (req.body?.sizes !== undefined) {
    if (!req.body.sizes || typeof req.body.sizes !== 'object') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    sizes = { XS: 0, S: 0, M: 0, L: 0 };
    for (const size of STOCK_SIZES) {
      const value = Number(req.body.sizes[size]);
      if (!Number.isSafeInteger(value) || value < 0) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      sizes[size] = value;
    }
  }

  if (price === undefined && sizes === undefined) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const { rows: productRows } = await pool.query<{ id: string }>(
    `select id from products where product_uid = $1 and product_type = 'nail' and audience = 'public'`,
    [productUid],
  );
  const product = productRows[0];
  if (!product) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }

  const { rows: variantRows } = await pool.query<{ exists: boolean }>(
    `select true as exists
       from product_shape_lengths
      where product_id = $1 and shape_key = $2 and length_key = $3`,
    [product.id, shapeKey, lengthKey],
  );
  if (!variantRows[0]) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const before = await readNailVariantSnapshot(client, product.id, shapeKey, lengthKey);
    if (price !== undefined) await setPriceIfChanged(client, product.id, price);
    if (sizes) {
      await client.query(
        `delete from product_availability
          where product_id = $1 and shape_key = $2 and length_key = $3`,
        [product.id, shapeKey, lengthKey],
      );
      for (const size of STOCK_SIZES) {
        if (sizes[size] <= 0) continue;
        await client.query(
          `insert into product_availability (product_id, shape_key, length_key, size, quantity)
           values ($1, $2, $3, $4, $5)`,
          [product.id, shapeKey, lengthKey, size, sizes[size]],
        );
      }
    }
    const after = {
      price: price !== undefined ? price : before.price,
      sizes: sizes ?? before.sizes,
    };
    const { changes, changeSummary, detail } = activityChangeDetail(
      { shapeKey, lengthKey },
      before,
      after,
    );
    await recordAdminActivity(client, req.user!, {
      category: 'catalogue',
      action: 'catalogue.stock',
      summary:
        changes.length === 0
          ? `Stock ${productUid} (${shapeKey}/${lengthKey}): aucun changement`
          : `Stock ${productUid} (${shapeKey}/${lengthKey}): ${changeSummary}`,
      targetType: 'product',
      targetId: productUid,
      detail,
    });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  const [sets, labels] = await Promise.all([listLibrarySets(pool, 'nail', 'public'), shapeLengthLabels()]);
  const set = sets.find((entry) => entry.productUid === productUid);
  if (!set) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({
    success: true,
    row: toLibraryStockVariantRow(
      set,
      shapeKey,
      lengthKey,
      labels.shapes.get(shapeKey) ?? shapeKey,
      labels.lengths.get(`${shapeKey}::${lengthKey}`) ?? lengthKey,
    ),
  });
});
