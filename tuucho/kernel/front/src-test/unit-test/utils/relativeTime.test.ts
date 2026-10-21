import { describe, expect, it } from 'vitest';
import { relativeTimeAgo } from '@/utils/relativeTime';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('relativeTimeAgo', () => {
  it('uses the largest whole unit, as Vinted does', () => {
    expect(relativeTimeAgo(ago(14 * 86_400), 'fr', NOW)).toBe('il y a 2 semaines');
    expect(relativeTimeAgo(ago(18 * 86_400), 'fr', NOW)).toBe('il y a 2 semaines');
    expect(relativeTimeAgo(ago(7 * 86_400), 'fr', NOW)).toBe('il y a 1 semaine');
    expect(relativeTimeAgo(ago(3 * 86_400), 'fr', NOW)).toBe('il y a 3 jours');
    expect(relativeTimeAgo(ago(100 * 86_400), 'fr', NOW)).toBe('il y a 3 mois');
    expect(relativeTimeAgo(ago(400 * 86_400), 'fr', NOW)).toBe('il y a 1 an');
    expect(relativeTimeAgo(ago(5 * 3_600), 'fr', NOW)).toBe('il y a 5 heures');
  });

  it('follows the visitor language', () => {
    expect(relativeTimeAgo(ago(14 * 86_400), 'en', NOW)).toBe('2 weeks ago');
  });

  it('never says "in the future" or "now"', () => {
    expect(relativeTimeAgo(ago(10), 'fr', NOW)).toBe('il y a 1 minute');
    expect(relativeTimeAgo(ago(-60), 'fr', NOW)).toBe('il y a 1 minute');
  });
});
