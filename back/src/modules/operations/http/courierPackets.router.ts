import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { withTransaction } from '../../../platform/db/transaction.js';

import { packetMeasurements } from '../application/courierImport.js';

export const courierPacketsRouter = Router();

/** Imports manager's global data-packet.json. It is deliberately not tied to
 * a courier: identical physical parcels can be labelled by several carriers. */
courierPacketsRouter.post('/packet-measurements', async (req, res) => {
  const measurements = packetMeasurements(req.body?.measurements);
  if (!measurements) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  await withTransaction(pool, async (client) => {
    await client.query('delete from shipping_packet_measurements');
    for (const entry of measurements)
      await client.query(
        'insert into shipping_packet_measurements (quantity, weight, length, width, depth) values ($1, $2, $3, $4, $5)',
        [entry.quantity, entry.weight, entry.length, entry.width, entry.depth],
      );
  });
  res.json({ success: true, count: measurements.length });
});
