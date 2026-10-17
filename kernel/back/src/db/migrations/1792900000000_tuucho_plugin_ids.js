/** Prefix bundled plugin catalogue ids with tuucho- so they cannot collide
 * with user plugins. Demo user plugins and kernel chrome (core-catalog) stay.

 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO public.plugins (id, enabled, settings, schema_version, updated_at)
    SELECT 'tuucho-' || id, enabled, settings, schema_version, updated_at
      FROM public.plugins
     WHERE id NOT LIKE 'tuucho-%'
       AND id NOT LIKE 'demo-%'
       AND id <> 'core-catalog'
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.plugins_schema_migrations
       SET plugin_id = 'tuucho-' || plugin_id
     WHERE plugin_id NOT LIKE 'tuucho-%'
       AND plugin_id NOT LIKE 'demo-%'
       AND EXISTS (SELECT 1 FROM public.plugins p WHERE p.id = 'tuucho-' || plugins_schema_migrations.plugin_id);

    DELETE FROM public.plugins
     WHERE id NOT LIKE 'tuucho-%'
       AND id NOT LIKE 'demo-%'
       AND id <> 'core-catalog';

    UPDATE public.app_preferences
       SET value = (
         SELECT COALESCE(jsonb_agg(
           CASE
             WHEN jsonb_typeof(elem->'pluginId') <> 'string' THEN elem
             WHEN elem->>'pluginId' LIKE 'tuucho-%' THEN elem
             WHEN elem->>'pluginId' LIKE 'demo-%' THEN elem
             WHEN elem->>'pluginId' = 'core-catalog' THEN elem
             ELSE jsonb_set(elem, '{pluginId}', to_jsonb('tuucho-' || (elem->>'pluginId')))
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
