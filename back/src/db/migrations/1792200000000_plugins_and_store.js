/** Plugin registry and store-setting defaults for tuucho-ecom.

 * `plugins` holds enable/disable + JSON settings per shipped plugin.
 * Store identity, tax mode, product axes, theme tokens and menus live in
 * `app_preferences` as JSON keys (`store.*`).

 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE public.plugins (
      id text NOT NULL,
      enabled boolean NOT NULL DEFAULT true,
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`ALTER TABLE ONLY public.plugins ADD CONSTRAINT plugins_pkey PRIMARY KEY (id);`);
  pgm.sql(`
    INSERT INTO public.plugins (id, enabled)
    VALUES
      ('theme-default', true),
      ('page-home', true),
      ('page-about', true),
      ('page-guides', true),
      ('page-legal', true),
      ('payment-stripe', true),
      ('shipping-home', true),
      ('shipping-mondial-relay', true)
    ON CONFLICT (id) DO NOTHING;
  `);
  pgm.sql(`
    INSERT INTO public.app_preferences (key, value)
    VALUES (
      'composition_page_enabled',
      'false'::jsonb
    )
    ON CONFLICT (key) DO UPDATE SET value = 'false'::jsonb, updated_at = now();
  `);
};

exports.down = false;
