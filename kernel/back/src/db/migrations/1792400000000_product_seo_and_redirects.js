/** Kernel product SEO fields and the seo-redirects table.

 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS seo_title jsonb,
      ADD COLUMN IF NOT EXISTS seo_description jsonb,
      ADD COLUMN IF NOT EXISTS seo_canonical text,
      ADD COLUMN IF NOT EXISTS seo_robots text NOT NULL DEFAULT 'index,follow',
      ADD COLUMN IF NOT EXISTS seo_og_image text
  `);
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS public.seo_redirects (
      id uuid PRIMARY KEY,
      from_path text NOT NULL,
      to_path text NOT NULL,
      status integer NOT NULL DEFAULT 301,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS seo_redirects_from_path_uidx ON public.seo_redirects (from_path)`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS public.seo_redirects`);
  pgm.sql(`
    ALTER TABLE public.products
      DROP COLUMN IF EXISTS seo_title,
      DROP COLUMN IF EXISTS seo_description,
      DROP COLUMN IF EXISTS seo_canonical,
      DROP COLUMN IF EXISTS seo_robots,
      DROP COLUMN IF EXISTS seo_og_image
  `);
};
