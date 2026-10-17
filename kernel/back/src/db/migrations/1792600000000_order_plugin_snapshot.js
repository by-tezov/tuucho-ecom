/** Plugin bag on the order snapshot. History and invoice read this JSON,
 * not live plugin state, so disabling a plugin later does not rewrite old
 * orders. Historical voucher_code / loyalty_credit / gift_snapshot columns
 * stay for rows confirmed before this opening.

 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.orders
      ADD COLUMN IF NOT EXISTS plugin_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
  `);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE public.orders DROP COLUMN IF EXISTS plugin_snapshot`);
};
