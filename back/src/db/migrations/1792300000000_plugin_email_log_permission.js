/** Plugin-owned email journal permission, split from api_log.

 * journal-email registers `email_log`. Existing roles that could open the
 * e-mail journal (they held `api_log`) keep that access.

 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(
    `INSERT INTO public.permissions (code, label, sort_order)
     VALUES ('email_log', 'Journal des e-mails', 195)
     ON CONFLICT (code) DO NOTHING`,
  );
  pgm.sql(
    `INSERT INTO public.role_permissions (role_code, permission_code, granted, dominant)
     SELECT role_code, 'email_log', granted, dominant
       FROM public.role_permissions
      WHERE permission_code = 'api_log'
     ON CONFLICT (role_code, permission_code) DO NOTHING`,
  );
};

exports.down = false;
