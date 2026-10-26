/**
 * Encrypted fine-grained GitHub tokens for private core and plugin updates.
 * Not part of config.json.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE public.github_repository_access (
      repository text NOT NULL,
      token_enc text NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_by uuid,
      CONSTRAINT github_repository_access_repository_check
        CHECK (repository ~ '^https://github\\.com/[a-z0-9_.-]+/[a-z0-9_.-]+$')
    )
  `);
  pgm.sql(`
    ALTER TABLE ONLY public.github_repository_access
      ADD CONSTRAINT github_repository_access_pkey PRIMARY KEY (repository)
  `);
  pgm.sql(`
    ALTER TABLE ONLY public.github_repository_access
      ADD CONSTRAINT github_repository_access_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL
  `);
  pgm.sql(`
    CREATE INDEX github_repository_access_updated_by_idx
      ON public.github_repository_access (updated_by)
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS public.github_repository_access`);
};
