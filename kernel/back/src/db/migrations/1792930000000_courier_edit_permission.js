/** Permission to edit courier texts, delivery times, prices and parcel sizes.
 *
 * Enabling a courier or a country stays on `preferences`. This grant does not
 * create or delete couriers, countries, networks or packet keys.
 * Seeded on `manager`. `preparator` does not receive it.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(
    `INSERT INTO public.permissions (code, label, sort_order)
     VALUES ('courier_edit', 'Modifier un transporteur', 165)`,
  );
  pgm.sql(
    `INSERT INTO public.role_permissions (role_code, permission_code)
     SELECT 'manager', 'courier_edit'
      WHERE EXISTS (SELECT 1 FROM public.roles WHERE code = 'manager')`,
  );
};

exports.down = false;
