/**
 * Product codes are 1 to 20 characters. Existing LL-LL-DDD values already fit.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.products
      ADD CONSTRAINT products_product_uid_length_check
      CHECK (char_length(product_uid) BETWEEN 1 AND 20)
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_uid_length_check`);
};
