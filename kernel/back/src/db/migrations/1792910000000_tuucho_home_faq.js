/** Home FAQ is a home slot, not a page: remap tuucho-page-faq* ids.

 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO public.plugins (id, enabled, settings, schema_version, updated_at)
    SELECT replace(id, 'tuucho-page-faq', 'tuucho-home-faq'), enabled, settings, schema_version, updated_at
      FROM public.plugins
     WHERE id IN ('tuucho-page-faq', 'tuucho-page-faq-locale-fr')
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.plugins_schema_migrations
       SET plugin_id = replace(plugin_id, 'tuucho-page-faq', 'tuucho-home-faq')
     WHERE plugin_id IN ('tuucho-page-faq', 'tuucho-page-faq-locale-fr');

    DELETE FROM public.plugins
     WHERE id IN ('tuucho-page-faq', 'tuucho-page-faq-locale-fr');

    UPDATE public.app_preferences
       SET value = (
         SELECT COALESCE(jsonb_agg(
           CASE
             WHEN jsonb_typeof(elem->'pluginId') <> 'string' THEN elem
             WHEN elem->>'pluginId' IN ('tuucho-page-faq', 'tuucho-page-faq-locale-fr')
               THEN jsonb_set(
                 elem,
                 '{pluginId}',
                 to_jsonb(replace(elem->>'pluginId', 'tuucho-page-faq', 'tuucho-home-faq'))
               )
             ELSE elem
           END
         ), '[]'::jsonb)
         FROM jsonb_array_elements(value) AS elem
       ),
           updated_at = now()
     WHERE key = 'store.menus'
       AND jsonb_typeof(value) = 'array';
  `);
};

exports.down = () => undefined;
