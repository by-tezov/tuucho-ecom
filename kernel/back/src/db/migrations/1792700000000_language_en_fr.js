/** Restrict stored language columns to English and French.

 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%language%'
          AND pg_get_constraintdef(oid) LIKE '%''th''%'
      LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
        IF r.def LIKE '%IS NULL%' THEN
          EXECUTE format(
            'ALTER TABLE %s ADD CONSTRAINT %I CHECK ((language IS NULL) OR (language = ANY (ARRAY[''en''::text, ''fr''::text])))',
            r.tbl,
            r.conname
          );
        ELSE
          EXECUTE format(
            'ALTER TABLE %s ADD CONSTRAINT %I CHECK (language = ANY (ARRAY[''en''::text, ''fr''::text]))',
            r.tbl,
            r.conname
          );
        END IF;
      END LOOP;
    END $$;
  `);
};

exports.down = () => undefined;
