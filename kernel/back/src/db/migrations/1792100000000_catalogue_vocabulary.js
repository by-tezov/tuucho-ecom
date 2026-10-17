/** Shared length table and length order on a shape.
 *
 * Length titles live once in `vocabulary_lengths` and are copied onto every
 * `shape_lengths` row that offers that length. `sort_order` keeps the order
 * of a shape's `$length` list.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql('alter table public.shape_lengths add column sort_order integer not null default 0');
  pgm.sql(
    `create table public.vocabulary_lengths (
      key text primary key,
      value text not null default '',
      label jsonb not null,
      gender jsonb not null default '{}'::jsonb
    )`,
  );
  pgm.sql(
    `insert into public.vocabulary_lengths (key, value, label, gender)
     select distinct on (length_key) length_key, value, label, gender
     from public.shape_lengths
     order by length_key, shape_key`,
  );
};

exports.down = false;
