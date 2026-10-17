import { afterEach, describe, expect, it } from 'vitest';
import {
  ADMIN_SESSION_LAND_COOKIE,
  clearAdminBrowserSession,
  isAdminBrowserSessionLive,
  markAdminBrowserSessionLanded,
} from '@/state/adminSessionLand';

afterEach(() => {
  clearAdminBrowserSession();
});

describe('admin session land', () => {
  it('treats a fresh browser as not yet landed', () => {
    expect(isAdminBrowserSessionLive()).toBe(false);
  });

  it('remembers the land across the same browser opening', () => {
    markAdminBrowserSessionLanded();
    expect(isAdminBrowserSessionLive()).toBe(true);
    expect(document.cookie).toContain(ADMIN_SESSION_LAND_COOKIE);
  });

  it('forgets the land when the session is cleared', () => {
    markAdminBrowserSessionLanded();
    clearAdminBrowserSession();
    expect(isAdminBrowserSessionLive()).toBe(false);
  });
});
