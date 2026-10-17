import type { PoolClient } from 'pg';

/**
 * Empty `public` so the next migration run recreates the schema from scratch.
 *
 * Local Docker often lets the app role `DROP SCHEMA public CASCADE`. Managed
 * hosts (LWS preprod/prod) typically leave `public` owned by the cluster
 * admin, so that fails with `must be owner of schema public`. In that case
 * drop every object inside `public` instead — same empty slate, no schema
 * ownership required. SQL kept PG10-compatible (LWS managed Postgres).
 */
export async function resetPublicSchema(client: PoolClient): Promise<'schema' | 'objects'> {
  const ownership = await client.query<{ owns: boolean }>(
    `select pg_catalog.pg_get_userbyid(n.nspowner) = current_user as owns
       from pg_catalog.pg_namespace n
      where n.nspname = 'public'`,
  );
  const ownsPublic = ownership.rows[0]?.owns === true;

  if (ownsPublic) {
    await client.query('drop schema public cascade');
    await client.query('create schema public');
    await client.query('grant all on schema public to public');
    await client.query('grant all on schema public to current_user');
    return 'schema';
  }

  // Schema-owned-by-admin path: wipe contents only.
  await client.query(`
    do $reset$
    declare
      r record;
    begin
      for r in (select tablename as name from pg_tables where schemaname = 'public') loop
        execute format('drop table if exists public.%I cascade', r.name);
      end loop;

      for r in (select sequence_name as name from information_schema.sequences where sequence_schema = 'public') loop
        execute format('drop sequence if exists public.%I cascade', r.name);
      end loop;

      for r in (select viewname as name from pg_views where schemaname = 'public') loop
        execute format('drop view if exists public.%I cascade', r.name);
      end loop;

      for r in (select matviewname as name from pg_matviews where schemaname = 'public') loop
        execute format('drop materialized view if exists public.%I cascade', r.name);
      end loop;

      for r in (
        select p.oid::regprocedure as sig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
      ) loop
        execute format('drop function if exists %s cascade', r.sig);
      end loop;

      for r in (
        select t.typname as name
        from pg_type t
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public'
          and t.typtype in ('e', 'c', 'd')
          and not exists (
            select 1 from pg_depend d
            where d.objid = t.oid and d.deptype = 'i'
          )
      ) loop
        execute format('drop type if exists public.%I cascade', r.name);
      end loop;
    end
    $reset$;
  `);
  return 'objects';
}
