import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { setPriceIfChanged } from '../../catalog/application/prices.js';
import { dbPackPrices, dbPacks, jsonRecordEqual } from '../../catalog/domain/accessoryPacks.js';
import type { AccessoryType } from '../../catalog/domain/accessoryPacks.js';
import { recordAdminActivity } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';

import { requestedPage, requestedStockPageSize } from './adminPagination.js';
import {
  adminAccessoryStock,
  productUidMatchesSearch,
  requestedStockFilters,
  setStockProductHidden,
  stockRowMatchesFilters,
} from './adminStockSupport.js';

export const adminAccessoryStockRouter = Router();

adminAccessoryStockRouter.get('/accessory-stock', requireAuth, requirePermission('accessory_stock'), async (req, res) => {
  const page = requestedPage(req.query.page);
  const pageSize = requestedStockPageSize(req.query.limit);
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const filters = requestedStockFilters(req.query);
  const rows = (await adminAccessoryStock()).filter(
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

adminAccessoryStockRouter.patch(
  '/accessory-stock/:productUid/hidden',
  requireAuth,
  requirePermission('accessory_stock'),
  async (req, res) => {
    await setStockProductHidden(req, res, 'accessory');
  },
);

adminAccessoryStockRouter.patch(
  '/accessory-stock/:productUid',
  requireAuth,
  requirePermission('accessory_stock'),
  async (req, res) => {
    const productUid = typeof req.params.productUid === 'string' ? req.params.productUid.trim() : '';
    if (!productUid) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }

    const availableRaw = req.body?.available;
    let available: number | undefined;
    if (availableRaw !== undefined && availableRaw !== null) {
      available = typeof availableRaw === 'number' ? availableRaw : Number(availableRaw);
      if (!Number.isSafeInteger(available) || available < 0) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
    }

    const unitPriceRaw = req.body?.unitPrice;
    let unitPrice: number | undefined;
    if (unitPriceRaw !== undefined && unitPriceRaw !== null) {
      unitPrice = typeof unitPriceRaw === 'number' ? unitPriceRaw : Number(unitPriceRaw);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
    }

    let packPrices: Record<string, number> | undefined;
    if (req.body?.packPrices !== undefined) {
      if (
        !req.body.packPrices ||
        typeof req.body.packPrices !== 'object' ||
        Array.isArray(req.body.packPrices)
      ) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      packPrices = {};
      for (const [key, raw] of Object.entries(req.body.packPrices as Record<string, unknown>)) {
        const value = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(value) || value < 0) {
          res.status(400).json({ success: false, error: { code: 'invalid_request' } });
          return;
        }
        packPrices[key] = value;
      }
    }

    if (available === undefined && unitPrice === undefined && packPrices === undefined) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    if (unitPrice !== undefined && packPrices !== undefined) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }

    const { rows: productRows } = await pool.query<{
      id: string;
      accessory_type: AccessoryType;
      accessory_packs: unknown;
      accessory_pack_prices: unknown;
    }>(
      `select id, accessory_type, accessory_packs, accessory_pack_prices
       from products
      where product_uid = $1 and product_type = 'accessory'`,
      [productUid],
    );
    const product = productRows[0];
    if (!product) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }

    const existingPacks = dbPacks(product.accessory_packs);
    const existingPackPrices = dbPackPrices(product.accessory_pack_prices);
    const usesPackPrices =
      product.accessory_type === 'byQuantity' && Object.keys(existingPackPrices).length > 0;

    if (packPrices !== undefined) {
      if (!usesPackPrices) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      const packKeys = Object.keys(existingPacks).sort();
      const priceKeys = Object.keys(packPrices).sort();
      if (
        packKeys.length === 0 ||
        packKeys.length !== priceKeys.length ||
        packKeys.some((key, index) => key !== priceKeys[index])
      ) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
    }
    if (unitPrice !== undefined && usesPackPrices) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows: availRows } = await client.query<{ quantity: number }>(
        `select quantity from product_availability
          where product_id = $1 and shape_key = '' and length_key = '' and size = ''`,
        [product.id],
      );
      const { rows: priceRows } = await client.query<{ price: string }>(
        `select price from product_prices
          where product_id = $1 and effective_at <= now()
          order by effective_at desc limit 1`,
        [product.id],
      );
      const before = {
        available: Number(availRows[0]?.quantity ?? 0),
        unitPrice: priceRows[0] ? Number(priceRows[0].price) : null,
        packPrices: existingPackPrices,
      };
      if (unitPrice !== undefined) await setPriceIfChanged(client, product.id, unitPrice);
      if (packPrices !== undefined && !jsonRecordEqual(packPrices, existingPackPrices)) {
        await client.query(
          `update products set accessory_pack_prices = $2::jsonb, updated_at = now() where id = $1`,
          [product.id, JSON.stringify(packPrices)],
        );
      }
      if (available !== undefined) {
        await client.query(
          `delete from product_availability
          where product_id = $1 and shape_key = '' and length_key = '' and size = ''`,
          [product.id],
        );
        if (available > 0) {
          await client.query(
            `insert into product_availability (product_id, shape_key, length_key, size, quantity)
           values ($1, '', '', '', $2)`,
            [product.id, available],
          );
        }
      }
      const after = {
        available: available !== undefined ? available : before.available,
        unitPrice: unitPrice !== undefined ? unitPrice : before.unitPrice,
        packPrices: packPrices !== undefined ? packPrices : before.packPrices,
      };
      const { changes, changeSummary, detail } = activityChangeDetail({}, before, after);
      await recordAdminActivity(client, req.user!, {
        category: 'catalogue',
        action: 'catalogue.stock',
        summary:
          changes.length === 0
            ? `Stock accessoire ${productUid}: aucun changement`
            : `Stock accessoire ${productUid}: ${changeSummary}`,
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

    const row = (await adminAccessoryStock()).find((entry) => entry.productUid === productUid);
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    res.json({ success: true, row });
  },
);
