import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { getLoyaltyAdminStats } from '../../plugins/application/pluginBridges.js';

import { STOCK_SIZES, adminAccessoryStock, adminLibraryStock } from './adminStockSupport.js';

export const adminStatsRouter = Router();

adminStatsRouter.get('/stats', requireAuth, requirePermission('stats'), async (_req, res) => {
  const [libraryRows, accessoryRows, orderResult, loyaltyStats] = await Promise.all([
    adminLibraryStock(),
    adminAccessoryStock(),
    pool.query<{
      confirmed: string;
      sent: string;
      received: string;
      cancelled: string;
      merchandise: string;
      shipping: string;
      grand_total: string;
    }>(
      `select
         -- Confirmed is the pre-dispatch queue: confirmed, in preparation,
         -- and ready to send.
         count(*) filter (where status in ('confirmed', 'in_preparation', 'to_send'))::text as confirmed,
         -- A pickup-point parcel remains dispatched while awaiting collection.
         count(*) filter (where status in ('sent', 'disponible'))::text as sent,
         count(*) filter (where status = 'received')::text as received,
         count(*) filter (where status = 'cancelled')::text as cancelled,
      coalesce(sum(total - shipping_fee) filter (where status not in ('cancelled', 'need_review', 'return_review')), 0)::text as merchandise,
      coalesce(sum(shipping_fee) filter (where status not in ('cancelled', 'need_review', 'return_review')), 0)::text as shipping,
      coalesce(sum(total) filter (where status not in ('cancelled', 'need_review', 'return_review')), 0)::text as grand_total
       from orders`,
    ),
    getLoyaltyAdminStats(pool),
  ]);

  const libraryBySize = {
    XS: { quantity: 0, stockValue: 0 },
    S: { quantity: 0, stockValue: 0 },
    M: { quantity: 0, stockValue: 0 },
    L: { quantity: 0, stockValue: 0 },
  };
  let libraryQuantity = 0;
  let libraryStockValue = 0;
  let libraryMinUnitPrice: number | null = null;
  let libraryMaxUnitPrice: number | null = null;
  for (const row of libraryRows) {
    for (const size of STOCK_SIZES) {
      const quantity = row.sizes[size];
      libraryBySize[size].quantity += quantity;
      if (row.price !== null) libraryBySize[size].stockValue += row.price * quantity;
    }
    libraryQuantity += row.total;
    if (row.stockValue !== null) libraryStockValue += row.stockValue;
    // Min/max among in-stock priced variants (same unit price as stock valuation).
    if (row.price !== null && row.total > 0) {
      libraryMinUnitPrice =
        libraryMinUnitPrice === null ? row.price : Math.min(libraryMinUnitPrice, row.price);
      libraryMaxUnitPrice =
        libraryMaxUnitPrice === null ? row.price : Math.max(libraryMaxUnitPrice, row.price);
    }
  }

  let accessoryQuantity = 0;
  let accessoryStockValue = 0;
  for (const row of accessoryRows) {
    accessoryQuantity += row.available;
    if (row.stockValue !== null) accessoryStockValue += row.stockValue;
  }

  const orderRow = orderResult.rows[0];
  res.json({
    success: true,
    library: {
      quantity: libraryQuantity,
      stockValue: libraryStockValue,
      averageUnitPrice: libraryQuantity > 0 ? libraryStockValue / libraryQuantity : null,
      minUnitPrice: libraryMinUnitPrice,
      maxUnitPrice: libraryMaxUnitPrice,
      bySize: libraryBySize,
    },
    accessories: {
      quantity: accessoryQuantity,
      stockValue: accessoryStockValue,
      averageUnitPrice: accessoryQuantity > 0 ? accessoryStockValue / accessoryQuantity : null,
    },
    orders: {
      confirmed: Number(orderRow?.confirmed ?? 0),
      sent: Number(orderRow?.sent ?? 0),
      received: Number(orderRow?.received ?? 0),
      cancelled: Number(orderRow?.cancelled ?? 0),
      merchandiseSold: Number(orderRow?.merchandise ?? 0),
      shippingPaid: Number(orderRow?.shipping ?? 0),
      totalSold: Number(orderRow?.grand_total ?? 0),
    },
    loyalty: loyaltyStats,
  });
});

/** Customer-account cards for the browser administration dashboard. This is
 * deliberately a separate surface from `/operation/users`: a bearer admin
 * gets only the customer-management capabilities it needs, never OPS_TOKEN
 * infrastructure access. */
