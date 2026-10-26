function identityTestTokensAllowed(): boolean {
  const target = (process.env.APP_TARGET ?? 'dev').trim() || 'dev';
  if (target === 'prod') return false;
  const opted = process.env.TUUCHO_IDENTITY_ALLOW_TEST_TOKENS?.trim().toLowerCase();
  return opted === 'true' || opted === '1';
}

/** Token prefix for the opt-in fake provider credentials
 * (`identity.testTokenPrefix` / IDENTITY_TEST_TOKEN_PREFIX, default
 * `tuucho-test:`). Any non-empty string is accepted, so both `tuucho-test:`
 * and `shop-test-` styles work: Google tokens are then `<prefix>google:<email>`,
 * Facebook `<prefix>facebook:<userId>:<email>`, Apple `<prefix>apple:<sub>:<email>`.
 * An unset or blank value keeps the default, so existing tokens keep working. */
export function identityTestTokenPrefix(): string {
  const value = (process.env.IDENTITY_TEST_TOKEN_PREFIX ?? '').trim();
  return value || 'tuucho-test:';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function testTokenPattern(suffix: string): RegExp {
  return new RegExp(`^${escapeRegExp(identityTestTokenPrefix())}${suffix}$`);
}

function testEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  return email;
}

/** Opt-in fake GIS credential: `<prefix>google:<email>`. */
export function parseGoogleTestToken(idToken: string): { sub: string; email: string; emailVerified: true } | null {
  if (!identityTestTokensAllowed()) return null;
  const match = testTokenPattern('google:(.+)').exec(idToken.trim());
  if (!match) return null;
  const email = testEmail(match[1] ?? '');
  if (!email) return null;
  return { sub: `test-google:${email}`, email, emailVerified: true };
}

/** Opt-in fake Facebook user token: `<prefix>facebook:<userId>:<email>`. */
export function parseFacebookTestToken(accessToken: string): { userId: string; email: string } | null {
  if (!identityTestTokensAllowed()) return null;
  const match = testTokenPattern('facebook:([^:]+):(.+)').exec(accessToken.trim());
  if (!match) return null;
  const email = testEmail(match[2] ?? '');
  const userId = match[1]?.trim();
  if (!email || !userId) return null;
  return { userId, email };
}

/** Opt-in fake Apple identity token: `<prefix>apple:<sub>:<email>`. */
export function parseAppleTestToken(idToken: string): { sub: string; email: string; emailVerified: true } | null {
  if (!identityTestTokensAllowed()) return null;
  const match = testTokenPattern('apple:([^:]+):(.+)').exec(idToken.trim());
  if (!match) return null;
  const email = testEmail(match[2] ?? '');
  const sub = match[1]?.trim();
  if (!email || !sub) return null;
  return { sub, email, emailVerified: true };
}
