/** @param {import('pg').PoolClient} client */
exports.up = async (client) => {
  await client.query(`
    create table plugin_tuucho_mail_spy_channels (
      channel_id text primary key,
      enabled boolean not null default true,
      updated_at timestamptz not null default now()
    )
  `);
  await client.query(`
    create table plugin_tuucho_mail_spy_recipients (
      id uuid primary key,
      channel_id text not null references plugin_tuucho_mail_spy_channels (channel_id) on delete cascade,
      filter_type text not null check (filter_type in ('role', 'email')),
      filter_value text not null,
      created_at timestamptz not null default now(),
      unique (channel_id, filter_type, filter_value)
    )
  `);
};

/** @param {import('pg').PoolClient} client */
exports.down = async (client) => {
  await client.query(`drop table if exists plugin_tuucho_mail_spy_recipients`);
  await client.query(`drop table if exists plugin_tuucho_mail_spy_channels`);
};
