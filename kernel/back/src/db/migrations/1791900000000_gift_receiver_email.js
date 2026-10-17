/** Receiver email on a gift offer, collected when the recipient confirms.
 * Encrypted at rest; HMAC lookup like giver_email. Null until confirm.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE public.gift_offers ADD COLUMN receiver_email text`);
  pgm.sql(`ALTER TABLE public.gift_offers ADD COLUMN receiver_email_lookup text`);
  pgm.sql(
    `CREATE INDEX gift_offers_receiver_email_lookup_idx ON public.gift_offers USING btree (receiver_email_lookup) WHERE (receiver_email_lookup IS NOT NULL)`,
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS public.gift_offers_receiver_email_lookup_idx`);
  pgm.sql(`ALTER TABLE public.gift_offers DROP COLUMN IF EXISTS receiver_email_lookup`);
  pgm.sql(`ALTER TABLE public.gift_offers DROP COLUMN IF EXISTS receiver_email`);
};
