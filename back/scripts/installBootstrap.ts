/** Create the first super-admin after a fresh migrate. Used by the installer. */
import { createUser } from '../src/modules/identity/application/users.js';
import { hashPassword } from '../src/modules/identity/application/password.js';
import { replaceAccountRoles } from '../src/modules/identity/infrastructure/rolesStore.js';
import { GDPR_CONSENT_VERSION } from '../src/config/gdpr.js';
import { pool } from '../src/db/pool.js';
import { ensurePluginRows } from '../src/modules/plugins/application/pluginStore.js';
import { patchStoreIdentity } from '../src/modules/plugins/application/storeSettings.js';
import type { Language } from '../src/utils/language.js';

function arg(name: string, fallback = ''): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((token) => token.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const email = arg('email');
const password = arg('password');
const language = (arg('language', 'fr') || 'fr') as Language;
const storeName = arg('store-name', 'Lumen');
const storeSuffix = arg('store-suffix', 'Atelier');

if (!email || !password) {
  console.error('[install-bootstrap] --email= and --password= are required');
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const user = await createUser(pool, {
  email,
  passwordHash,
  gdprConsentVersion: GDPR_CONSENT_VERSION,
  language,
  emailVerified: true,
});
await replaceAccountRoles(pool, user.id, ['super-admin'], 'super-admin');
await ensurePluginRows(pool);
await patchStoreIdentity({
  name: storeName,
  suffix: storeSuffix,
  contactEmail: email,
  taxMode: 'none',
});
console.log(`[install-bootstrap] super-admin ${email} ready`);
await pool.end();
