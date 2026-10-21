/**
 * Plugin load isolation (`compatibility_status`) and gift share-card CHECK
 * without the historical shop-brand default.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.plugins
      ADD COLUMN IF NOT EXISTS compatibility_status text DEFAULT 'ok' NOT NULL
  `);
  pgm.sql(`
    ALTER TABLE public.plugins
      ADD COLUMN IF NOT EXISTS compatibility_detail text
  `);
  pgm.sql(`
    DO $$
    DECLARE
      rec record;
    BEGIN
      FOR rec IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'public.gift_offers'::regclass
           AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%share_card_style%'
      LOOP
        EXECUTE format('ALTER TABLE public.gift_offers DROP CONSTRAINT %I', rec.conname);
      END LOOP;
    END
    $$
  `);
  pgm.sql(`
    UPDATE public.gift_offers
       SET share_card_style = 'classic'
     WHERE share_card_style = 'pamsurin'
  `);
  pgm.sql(`
    ALTER TABLE public.gift_offers
      ALTER COLUMN share_card_style SET DEFAULT 'classic'
  `);
  pgm.sql(`
    ALTER TABLE public.gift_offers
      ADD CONSTRAINT gift_offers_share_card_style_check
      CHECK (share_card_style = ANY (ARRAY[
        'classic'::text,
        'anniversaire'::text,
        'mariage'::text,
        'fete'::text,
        'noel'::text,
        'valentin'::text,
        'meres'::text,
        'merci'::text,
        'diplome'::text,
        'amitie'::text,
        'minimal'::text,
        'coquin'::text,
        'manga'::text,
        'halloween'::text,
        'nouvelan'::text,
        'artdeco'::text,
        'botanique'::text,
        'neon'::text,
        'celeste'::text,
        'fantastique'::text
      ]))
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE public.gift_offers DROP CONSTRAINT IF EXISTS gift_offers_share_card_style_check`);
  pgm.sql(`
    ALTER TABLE public.gift_offers
      ADD CONSTRAINT gift_offers_share_card_style_check
      CHECK (share_card_style = ANY (ARRAY[
        'pamsurin'::text,
        'anniversaire'::text,
        'mariage'::text,
        'fete'::text,
        'noel'::text,
        'valentin'::text,
        'meres'::text,
        'merci'::text,
        'diplome'::text,
        'amitie'::text,
        'minimal'::text,
        'coquin'::text,
        'manga'::text,
        'halloween'::text,
        'nouvelan'::text,
        'artdeco'::text,
        'botanique'::text,
        'neon'::text,
        'celeste'::text,
        'fantastique'::text
      ]))
  `);
  pgm.sql(`
    UPDATE public.gift_offers
       SET share_card_style = 'pamsurin'
     WHERE share_card_style = 'classic'
  `);
  pgm.sql(`
    ALTER TABLE public.gift_offers
      ALTER COLUMN share_card_style SET DEFAULT 'pamsurin'
  `);
  pgm.sql(`ALTER TABLE public.plugins DROP COLUMN IF EXISTS compatibility_detail`);
  pgm.sql(`ALTER TABLE public.plugins DROP COLUMN IF EXISTS compatibility_status`);
};
