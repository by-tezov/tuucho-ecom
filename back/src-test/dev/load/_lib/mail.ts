import http from 'k6/http';
import { sleep } from 'k6';

function helperBase(): string {
  return (__ENV.PAM_LOAD_MAIL_HELPER_URL || '').replace(/\/$/, '');
}

/** Poll disposable email dumps (via test orchestrator helper) for a 6-digit OTP. */
export function waitForOtp(email: string, sinceMs: number, timeoutMs = 30_000): string {
  const base = helperBase();
  if (!base) return '';
  const deadline = Date.now() + timeoutMs;
  // 404 while waiting is expected; do not count it toward http_req_failed.
  const responseCallback = http.expectedStatuses(200, 404);
  while (Date.now() < deadline) {
    const res = http.get(
      `${base}/otp?to=${encodeURIComponent(email)}&sinceMs=${sinceMs}`,
      { tags: { name: 'load_mail_otp', phase: 'mail' }, responseCallback },
    );
    if (res.status === 200) {
      try {
        const body = res.json() as { otp?: string };
        if (body.otp) return body.otp;
      } catch {
        // keep polling
      }
    }
    sleep(0.2);
  }
  return '';
}

/** Poll disposable email dumps for a password-reset / confirm token. */
export function waitForToken(email: string, sinceMs: number, timeoutMs = 30_000): string {
  const base = helperBase();
  if (!base) return '';
  const deadline = Date.now() + timeoutMs;
  const responseCallback = http.expectedStatuses(200, 404);
  while (Date.now() < deadline) {
    const res = http.get(
      `${base}/token?to=${encodeURIComponent(email)}&sinceMs=${sinceMs}`,
      { tags: { name: 'load_mail_token', phase: 'mail' }, responseCallback },
    );
    if (res.status === 200) {
      try {
        const body = res.json() as { token?: string };
        if (body.token) return body.token;
      } catch {
        // keep polling
      }
    }
    sleep(0.2);
  }
  return '';
}
