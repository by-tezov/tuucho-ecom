/** Permission to create, edit and delete a product in any of the four stocks.
 *
 * Stock quantity and price stay on `library_stock`, `accessory_stock`,
 * `user_library_stock` and `nail_availability`. `catalogue_edit` is the one
 * extra grant for the product editor, shared by those four sections.
 * Seeded on `manager` (catalogue). `preparator` keeps stock only.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(
    `INSERT INTO public.permissions (code, label, sort_order)
     VALUES ('catalogue_edit', 'Modifier un produit', 115)`,
  );
  pgm.sql(
    `INSERT INTO public.role_permissions (role_code, permission_code)
     SELECT 'manager', 'catalogue_edit'
      WHERE EXISTS (SELECT 1 FROM public.roles WHERE code = 'manager')`,
  );
};

exports.down = false;
