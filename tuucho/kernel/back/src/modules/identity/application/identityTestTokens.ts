function identityTestTokensAllowed(): boolean {
  const target = (process.env.APP_TARGET ?? 'dev').trim() || 'dev';
  if (target === 'prod') return false;
  const opted = process.env.TUUCHO_IDENTITY_ALLOW_TEST_TOKENS?.trim().toLowerCase();
  return opted === 'true' || opted === '1';
}

function testEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  return email;
}

/** Opt-in fake GIS credential: `tuucho-test:google:<email>`. */
export function parseGoogleTestToken(idToken: string): { sub: string; email: string; emailVerified: true } | null {
  if (!identityTestTokensAllowed()) return null;
  const match = /^tuucho-test:google:(.+)$/.exec(idToken.trim());
  if (!match) return null;
  const email = testEmail(match[1] ?? '');
  if (!email) return null;
  return { sub: `test-google:${email}`, email, emailVerified: true };
}

/** Opt-in fake Facebook user token: `tuucho-test:facebook:<userId>:<email>`. */
export function parseFacebookTestToken(accessToken: string): { userId: string; email: string } | null {
  if (!identityTestTokensAllowed()) return null;
  const match = /^tuucho-test:facebook:([^:]+):(.+)$/.exec(accessToken.trim());
  if (!match) return null;
  const email = testEmail(match[2] ?? '');
  const userId = match[1]?.trim();
  if (!email || !userId) return null;
  return { userId, email };
}

/** Opt-in fake Apple identity token: `tuucho-test:apple:<sub>:<email>`. */
export function parseAppleTestToken(idToken: string): { sub: string; email: string; emailVerified: true } | null {
  if (!identityTestTokensAllowed()) return null;
  const match = /^tuucho-test:apple:([^:]+):(.+)$/.exec(idToken.trim());
  if (!match) return null;
  const email = testEmail(match[2] ?? '');
  const sub = match[1]?.trim();
  if (!email || !sub) return null;
  return { sub, email, emailVerified: true };
}
