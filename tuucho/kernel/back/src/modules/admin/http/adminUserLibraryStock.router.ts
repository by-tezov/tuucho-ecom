import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { listLibrarySets } from '../../operations/application/libraryList.js';
import { replaceUserLibraryUsers } from '../../operations/application/libraryImport.js';
import {
  InvalidLibrarySet,
  resolveUserLibraryUsers,
} from '../../operations/application/librarySetImport.js';
import { setPriceIfChanged } from '../../catalog/application/prices.js';
import { recordAdminActivity } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';
import { ACTIVITY_CHANGE_LABELS } from '../../activity/domain/changes.js';

import { requestedPage, requestedStockPageSize } from './adminPagination.js';
import {
  STOCK_SIZES,
  adminUserLibraryStock,
  productUidMatchesSearch,
  readNailVariantSnapshot,
  requestedStockFilters,
  setStockProductHidden,
  shapeLengthLabels,
  stockRowMatchesFilters,
  toLibraryStockVariantRow,
  type AdminLibraryStockSizes,
} from './adminStockSupport.js';

export const adminUserLibraryStockRouter = Router();

const gate = [requireAuth, requirePermission('user_library_stock')] as const;

adminUserLibraryStockRouter.get('/user-library-stock', ...gate, async (req, res) => {
  const page = requestedPage(req.query.page);
  const pageSize = requestedStockPageSize(req.query.limit);
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const filters = requestedStockFilters(req.query);
  const rows = (await adminUserLibraryStock()).filter(
    (row) => productUidMatchesSearch(row.productUid, q) && stockRowMatchesFilters(row, filters),
  );
  res.json({
    success: true,
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: {
      page,
      pageSize,
      total: rows.length,
      totalPages: Math.ceil(rows.length / pageSize),
    },
  });
});

adminUserLibraryStockRouter.patch('/user-library-stock/:productUid/hidden', ...gate, async (req, res) => {
  await setStockProductHidden(req, res, 'nail', 'user-library');
});

adminUserLibraryStockRouter.patch('/user-library-stock/:productUid', ...gate, async (req, res) => {
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

  let ownerIds: string[] | undefined;
  if (req.body?.owners !== undefined) {
    if (!Array.isArray(req.body.owners)) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    try {
      ownerIds = await resolveUserLibraryUsers(req.body.owners);
    } catch (error) {
      if (error instanceof InvalidLibrarySet) {
        res.status(400).json({ success: false, error: { code: 'invalid_request', message: error.message } });
        return;
      }
      throw error;
    }
  }

  if (price === undefined && sizes === undefined && ownerIds === undefined) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const { rows: productRows } = await pool.query<{ id: string }>(
    `select id from products where product_uid = $1 and product_type = 'nail' and audience = 'user-library'`,
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
    const beforeStock = await readNailVariantSnapshot(client, product.id, shapeKey, lengthKey);
    const { rows: ownerRows } = await client.query<{ email: string }>(
      `select u.email from product_user_library_users pulu
         join users u on u.id = pulu.user_id
        where pulu.product_id = $1
        order by u.email`,
      [product.id],
    );
    const beforeOwners = ownerRows.map((row) => row.email).join(', ');
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
    if (ownerIds) await replaceUserLibraryUsers(client, product.id, ownerIds);
    const afterOwners = ownerIds
      ? (
          await client.query<{ email: string }>(
            `select u.email from product_user_library_users pulu
               join users u on u.id = pulu.user_id
              where pulu.product_id = $1
              order by u.email`,
            [product.id],
          )
        ).rows.map((row) => row.email).join(', ')
      : beforeOwners;
    const { changes, changeSummary, detail } = activityChangeDetail(
      { shapeKey, lengthKey },
      { ...beforeStock, owners: beforeOwners },
      {
        price: price !== undefined ? price : beforeStock.price,
        sizes: sizes ?? beforeStock.sizes,
        owners: afterOwners,
      },
      { ...ACTIVITY_CHANGE_LABELS, owners: 'Comptes' },
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

  const [sets, labels] = await Promise.all([
    listLibrarySets(pool, 'nail', 'user-library'),
    shapeLengthLabels(),
  ]);
  const set = sets.find((entry) => entry.productUid === productUid);
  if (!set) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({
    success: true,
    row: {
      ...toLibraryStockVariantRow(
        set,
        shapeKey,
        lengthKey,
        labels.shapes.get(shapeKey) ?? shapeKey,
        labels.lengths.get(`${shapeKey}::${lengthKey}`) ?? lengthKey,
      ),
      owners: set.users,
    },
  });
});
