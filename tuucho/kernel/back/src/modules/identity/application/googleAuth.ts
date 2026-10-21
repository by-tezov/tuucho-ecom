import { parseGoogleTestToken } from './identityTestTokens.js';
import { signInProviderSetting } from './signInProviderSettings.js';

export interface VerifiedGoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
}

export function isGoogleSignInConfigured(): boolean {
  return Boolean(signInProviderSetting('google', 'clientId'));
}

/** Verifies a GIS credential (ID token JWT) from the browser. */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleProfile> {
  const stub = parseGoogleTestToken(idToken);
  if (stub) return stub;

  const clientId = signInProviderSetting('google', 'clientId');
  if (!clientId) {
    throw new Error('google_sign_in_disabled');
  }

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
