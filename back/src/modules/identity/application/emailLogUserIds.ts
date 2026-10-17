import { pool } from '../../../db/pool.js';
import { emailLookupHash } from '../../../platform/security/piiCrypto.js';

const MAX_EMAILS = 32;

interface LookupRow {
  id: string;
  email_lookup: string;
  pending_email_lookup: string | null;
  google_email_lookup: string | null;
  facebook_email_lookup: string | null;
  apple_email_lookup: string | null;
}

/** Account ids for addresses about to be written to the production mail
 * journal. Main, pending and linked social addresses all count. An address
 * with no account is absent from the map and stays redacted. */
export async function userIdsByEmail(emails: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_EMAILS);
  if (unique.length === 0) return new Map();
  const hashes = unique.map((email) => emailLookupHash(email));
  const { rows } = await pool.query<LookupRow>(
    `select id, email_lookup, pending_email_lookup, google_email_lookup, facebook_email_lookup, apple_email_lookup
     from users
     where email_lookup = any($1::text[])
        or pending_email_lookup = any($1::text[])
        or google_email_lookup = any($1::text[])
        or facebook_email_lookup = any($1::text[])
        or apple_email_lookup = any($1::text[])`,
    [hashes],
  );
  const byHash = new Map<string, string>();
  for (const row of rows) {
    for (const hash of [
      row.apple_email_lookup,
      row.facebook_email_lookup,
      row.google_email_lookup,
      row.pending_email_lookup,
      row.email_lookup,
    ]) {
      if (hash) byHash.set(hash, row.id);
    }
  }
  const result = new Map<string, string>();
  unique.forEach((email, index) => {
    const id = byHash.get(hashes[index] ?? '');
    if (id) result.set(email, id);
  });
  return result;
}
