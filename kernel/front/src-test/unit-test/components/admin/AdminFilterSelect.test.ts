import { describe, expect, it } from 'vitest';
import { matchesAdminFilterOption } from '@/components/admin/AdminFilterSelect';

describe('matchesAdminFilterOption', () => {
  it('keeps every option when the query is empty or blank', () => {
    expect(matchesAdminFilterOption('/checkout', '')).toBe(true);
    expect(matchesAdminFilterOption('/checkout', '   ')).toBe(true);
  });

  it('matches a case-insensitive substring of the label', () => {
    expect(matchesAdminFilterOption('/account/orders', 'ORDER')).toBe(true);
    expect(matchesAdminFilterOption('/checkout', '/check')).toBe(true);
    expect(matchesAdminFilterOption('Toutes les routes', 'route')).toBe(true);
  });

  it('rejects a label that does not contain the query', () => {
    expect(matchesAdminFilterOption('/checkout', '/admin')).toBe(false);
  });
});
