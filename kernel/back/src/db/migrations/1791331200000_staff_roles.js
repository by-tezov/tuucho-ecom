/** Staff roles, permissions, inheritance and delegated role assignment, in
 * their final shape (squashed: see docs/schema/migration-history.md).
 *
 * - `roles` gains `system` (the built-in `user` and `super-admin`, never
 *   edited or deleted), timestamps, and the dominance flags of the two
 *   delegation lists. The built-in administrator role is `super-admin`
 *   ("Super-administrateur"); accounts holding `admin` move to it.
 * - `permissions`: the administration sections a role can be granted.
 * - `role_permissions`: per role and permission, on/off and dominant or not.
 * - `role_parents`: a role inherits every grant of its parents.
 * - `user_roles`: the staff roles an account holds (none = customer);
 *   backfilled from `users.role`, which stays as a compatible summary.
 * - `role_assignable_roles` / `role_targetable_roles`: which roles a role's
 *   holders may give or take away, and on which accounts.
 * - Seeds `preparator` (orders and stock) and `manager` (catalogue, inherits
 *   `preparator`).
 * - Upper-cases chat, contact and product-request public ids and keeps them
 *   so (NOT VALID check).
 *
 * Not compatible with a rollback to a version that checks
 * `users.role = 'admin'`: see docs/schema/migration-history.md.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE public.roles ADD COLUMN system boolean DEFAULT false NOT NULL`);
  pgm.sql(`ALTER TABLE public.roles ADD COLUMN created_at timestamp with time zone DEFAULT now() NOT NULL`);
  pgm.sql(`ALTER TABLE public.roles ADD COLUMN updated_at timestamp with time zone DEFAULT now() NOT NULL`);
  pgm.sql(`ALTER TABLE public.roles ADD COLUMN assignable_dominant boolean DEFAULT false NOT NULL`);
  pgm.sql(`ALTER TABLE public.roles ADD COLUMN targetable_dominant boolean DEFAULT false NOT NULL`);
  pgm.sql(`UPDATE public.roles SET system = true WHERE code = 'user'`);

  // `admin` becomes `super-admin`. No foreign key to roles(code) cascades on
  // update: insert the new row, move the accounts, drop the old row.
  pgm.sql(
    `INSERT INTO public.roles (code, label, system) VALUES ('super-admin', 'Super-administrateur', true)`,
  );
  pgm.sql(`UPDATE public.users SET role = 'super-admin', updated_at = now() WHERE role = 'admin'`);
  pgm.sql(`DELETE FROM public.roles WHERE code = 'admin'`);

  pgm.sql(
    `CREATE TABLE public.permissions (
       code text NOT NULL,
       label text NOT NULL,
       sort_order integer NOT NULL,
       CONSTRAINT permissions_pkey PRIMARY KEY (code)
     )`,
  );
  pgm.sql(
    `INSERT INTO public.permissions (code, label, sort_order) VALUES
       ('stats', 'Statistiques', 10),
       ('orders', 'Commandes', 20),
       ('product_requests', 'Demandes produit', 30),
       ('messages', 'Messages', 40),
       ('users', 'Utilisateurs', 50),
       ('impersonate', 'Se connecter en tant que client', 60),
       ('reviews', 'Avis clients', 70),
       ('library_stock', 'Stock bibliothèque', 80),
       ('accessory_stock', 'Stock accessoires', 90),
       ('user_library_stock', 'Stock créations clientes', 100),
       ('nail_availability', 'Disponibilité des ongles', 110),
       ('cart_rules', 'Règles panier', 120),
       ('vouchers', 'Bons de réduction', 130),
       ('loyalty', 'Fidélité', 140),
       ('gift', 'Cadeaux', 150),
       ('preferences', 'Préférences', 160),
       ('activity', 'Journal d''activité', 170),
       ('cron_logs', 'Journaux des crons', 180),
       ('api_log', 'Journal API', 190)`,
  );

  pgm.sql(
    `CREATE TABLE public.role_permissions (
       role_code text NOT NULL,
       permission_code text NOT NULL,
       granted_at timestamp with time zone DEFAULT now() NOT NULL,
       granted boolean DEFAULT true NOT NULL,
       dominant boolean DEFAULT false NOT NULL,
       CONSTRAINT role_permissions_pkey PRIMARY KEY (role_code, permission_code),
       CONSTRAINT role_permissions_role_fkey FOREIGN KEY (role_code)
         REFERENCES public.roles(code) ON DELETE CASCADE,
       CONSTRAINT role_permissions_permission_fkey FOREIGN KEY (permission_code)
         REFERENCES public.permissions(code) ON DELETE CASCADE
     )`,
  );

  pgm.sql(
    `CREATE TABLE public.role_parents (
       role_code text NOT NULL,
       parent_code text NOT NULL,
       created_at timestamp with time zone DEFAULT now() NOT NULL,
       CONSTRAINT role_parents_pkey PRIMARY KEY (role_code, parent_code),
       CONSTRAINT role_parents_not_self_chk CHECK (role_code <> parent_code),
       CONSTRAINT role_parents_role_fkey FOREIGN KEY (role_code)
         REFERENCES public.roles(code) ON DELETE CASCADE,
       CONSTRAINT role_parents_parent_fkey FOREIGN KEY (parent_code)
         REFERENCES public.roles(code)
     )`,
  );
  pgm.sql(`CREATE INDEX role_parents_parent_idx ON public.role_parents (parent_code)`);

  pgm.sql(
    `CREATE TABLE public.user_roles (
       user_id uuid NOT NULL,
       role_code text NOT NULL,
       assigned_at timestamp with time zone DEFAULT now() NOT NULL,
       CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_code),
       CONSTRAINT user_roles_user_fkey FOREIGN KEY (user_id)
         REFERENCES public.users(id) ON DELETE CASCADE,
       CONSTRAINT user_roles_role_fkey FOREIGN KEY (role_code)
         REFERENCES public.roles(code),
       CONSTRAINT user_roles_not_customer_chk CHECK (role_code <> 'user')
     )`,
  );
  pgm.sql(`CREATE INDEX user_roles_role_idx ON public.user_roles (role_code)`);
  pgm.sql(
    `INSERT INTO public.user_roles (user_id, role_code)
     SELECT id, role FROM public.users WHERE role <> 'user'`,
  );

  pgm.sql(
    `CREATE TABLE public.role_assignable_roles (
       role_code text NOT NULL,
       assignable_code text NOT NULL,
       created_at timestamp with time zone DEFAULT now() NOT NULL,
       CONSTRAINT role_assignable_roles_pkey PRIMARY KEY (role_code, assignable_code),
       CONSTRAINT role_assignable_roles_role_fkey FOREIGN KEY (role_code)
         REFERENCES public.roles(code) ON DELETE CASCADE,
       CONSTRAINT role_assignable_roles_assignable_fkey FOREIGN KEY (assignable_code)
         REFERENCES public.roles(code) ON DELETE CASCADE,
       CONSTRAINT role_assignable_roles_staff_chk CHECK (assignable_code NOT IN ('super-admin', 'user'))
     )`,
  );
  pgm.sql(`CREATE INDEX role_assignable_roles_assignable_idx ON public.role_assignable_roles (assignable_code)`);

  pgm.sql(
    `CREATE TABLE public.role_targetable_roles (
       role_code text NOT NULL,
       target_code text NOT NULL,
       created_at timestamp with time zone DEFAULT now() NOT NULL,
       CONSTRAINT role_targetable_roles_pkey PRIMARY KEY (role_code, target_code),
       CONSTRAINT role_targetable_roles_role_fkey FOREIGN KEY (role_code)
         REFERENCES public.roles(code) ON DELETE CASCADE,
       CONSTRAINT role_targetable_roles_target_fkey FOREIGN KEY (target_code)
         REFERENCES public.roles(code) ON DELETE CASCADE,
       CONSTRAINT role_targetable_roles_not_super_admin_chk CHECK (target_code <> 'super-admin')
     )`,
  );
  pgm.sql(`CREATE INDEX role_targetable_roles_target_idx ON public.role_targetable_roles (target_code)`);

  pgm.sql(
    `INSERT INTO public.roles (code, label, system) VALUES
       ('preparator', 'Préparateur', false),
       ('manager', 'Manager', false)`,
  );
  pgm.sql(
    `INSERT INTO public.role_permissions (role_code, permission_code)
     SELECT 'preparator', code FROM public.permissions
      WHERE code IN ('orders', 'library_stock', 'accessory_stock', 'user_library_stock', 'nail_availability')`,
  );
  pgm.sql(
    `INSERT INTO public.role_parents (role_code, parent_code) VALUES ('manager', 'preparator')`,
  );
  pgm.sql(
    `INSERT INTO public.role_permissions (role_code, permission_code)
     SELECT 'manager', code FROM public.permissions
      WHERE code IN ('library_stock', 'accessory_stock', 'user_library_stock', 'nail_availability')`,
  );

  // Public ids are upper-case. The application mints every chat, contact and
  // product-request public_id upper-case and looks them up upper-cased; rows
  // inserted by hand in lower case were listed but could never be opened or
  // closed. Normalize them (skipping any whose upper-case form is taken) and
  // add a NOT VALID check so new or updated rows cannot regress.
  for (const table of ['chat_sessions', 'unconnected_contacts', 'product_requests']) {
    pgm.sql(
      `UPDATE public.${table} t SET public_id = upper(t.public_id)
        WHERE t.public_id <> upper(t.public_id)
          AND NOT EXISTS (SELECT 1 FROM public.${table} o WHERE o.public_id = upper(t.public_id))`,
    );
    pgm.sql(
      `ALTER TABLE public.${table}
         ADD CONSTRAINT ${table}_public_id_upper_chk CHECK (public_id = upper(public_id)) NOT VALID`,
    );
  }
};

exports.down = false;
