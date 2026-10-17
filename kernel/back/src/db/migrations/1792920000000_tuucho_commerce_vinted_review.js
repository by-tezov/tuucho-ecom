/** Vinted-only reviews plugin: remap generic reviews ids.

 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO public.plugins (id, enabled, settings, schema_version, updated_at)
    SELECT replace(id, 'tuucho-commerce-reviews', 'tuucho-commerce-vinted-review'),
           enabled, settings, schema_version, updated_at
      FROM public.plugins
     WHERE id IN ('tuucho-commerce-reviews', 'tuucho-commerce-reviews-locale-fr')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.plugins (id, enabled, settings, schema_version, updated_at)
    SELECT replace(id, 'commerce-reviews', 'tuucho-commerce-vinted-review'),
           enabled, settings, schema_version, updated_at
      FROM public.plugins
     WHERE id IN ('commerce-reviews', 'commerce-reviews-locale-fr')
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.plugins_schema_migrations
       SET plugin_id = replace(plugin_id, 'tuucho-commerce-reviews', 'tuucho-commerce-vinted-review')
     WHERE plugin_id IN ('tuucho-commerce-reviews', 'tuucho-commerce-reviews-locale-fr');

    UPDATE public.plugins_schema_migrations
       SET plugin_id = replace(plugin_id, 'commerce-reviews', 'tuucho-commerce-vinted-review')
     WHERE plugin_id IN ('commerce-reviews', 'commerce-reviews-locale-fr');

    DELETE FROM public.plugins
     WHERE id IN (
       'tuucho-commerce-reviews',
       'tuucho-commerce-reviews-locale-fr',
       'commerce-reviews',
       'commerce-reviews-locale-fr'
     );

    UPDATE public.app_preferences
       SET value = (
         SELECT COALESCE(jsonb_agg(
           CASE
             WHEN jsonb_typeof(elem->'pluginId') <> 'string' THEN elem
             WHEN elem->>'pluginId' IN ('tuucho-commerce-reviews', 'tuucho-commerce-reviews-locale-fr')
               THEN jsonb_set(
                 elem,
                 '{pluginId}',
                 to_jsonb(replace(elem->>'pluginId', 'tuucho-commerce-reviews', 'tuucho-commerce-vinted-review'))
               )
             WHEN elem->>'pluginId' IN ('commerce-reviews', 'commerce-reviews-locale-fr')
               THEN jsonb_set(
                 elem,
                 '{pluginId}',
                 to_jsonb(replace(elem->>'pluginId', 'commerce-reviews', 'tuucho-commerce-vinted-review'))
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
