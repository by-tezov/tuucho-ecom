import { config } from '../../../config/env.js';

export interface VerifiedGoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
}

export function isGoogleSignInConfigured(): boolean {
  return Boolean(config.google.clientId);
}

const TEST_GOOGLE_PREFIX = 'pam-test-google.';

/** Isolated functional API only (`PAM_TEST_SOCIAL_STUB=1` on that process).
 * A real GIS JWT never uses this prefix, so it still goes to Google. */
function profileFromTestGoogleToken(idToken: string): VerifiedGoogleProfile | undefined {
  if (process.env.PAM_TEST_SOCIAL_STUB !== '1' || !idToken.startsWith(TEST_GOOGLE_PREFIX)) return undefined;
  let parsed: { sub?: unknown; email?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(idToken.slice(TEST_GOOGLE_PREFIX.length), 'base64url').toString('utf8')) as {
      sub?: unknown;
      email?: unknown;
    };
  } catch {
    throw new Error('invalid_google_token');
  }
  const sub = typeof parsed.sub === 'string' ? parsed.sub.trim() : '';
  const email = typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : '';
  if (!sub || !email || sub.length > 255 || email.length > 254) throw new Error('invalid_google_token');
  return { sub, email, emailVerified: true };
}

/** Verifies a GIS credential (ID token JWT) from the browser. */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleProfile> {
  const clientId = config.google.clientId;
  if (!clientId) {
    throw new Error('google_sign_in_disabled');
  }
  const stubbed = profileFromTestGoogleToken(idToken);
  if (stubbed) return stubbed;

  // During an FTP bootstrap Passenger must start before the gateway can run
  // cPanel's normal npm install. Keep this optional dependency out of the
  // application's startup import graph.
  const { OAuth2Client } = await import('google-auth-library');
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('invalid_google_token');
  }
  if (payload.email_verified !== true) {
    throw new Error('invalid_google_token');
  }

  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: true,
  };
}
