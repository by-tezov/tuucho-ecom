import type { Courier } from '../api/account';

/** Two-letter badge shown next to each courier's name — initials of the
 * first two words for a multi-word name ("Mondial Relay" → MR), or the
 * first two letters of a one-word name ("Chronopost" → CH). Generic on
 * purpose: couriers are server/env-configured, not a fixed list this file
 * could hardcode against. Color is picked from a small fixed palette,
 * stable per courier code (same courier always gets the same color) —
 * there's no real logo asset system for couriers, this stands in for one. */
const COURIER_BADGE_PALETTE = [
  { background: '#e3ddf7', color: '#5b4b96' },
  { background: '#fbdce8', color: '#a83d6b' },
  { background: '#dcefe1', color: '#3f7a56' },
  { background: '#fbe6d4', color: '#a3652f' },
];

export function courierBadge(courier: Pick<Courier, 'code' | 'name'>): {
  letters: string;
  background: string;
  color: string;
} {
  const words = courier.name.trim().split(/\s+/).filter(Boolean);
  const letters = (
    words.length >= 2 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : courier.name.slice(0, 2)
  ).toUpperCase();
  let hash = 0;
  for (let i = 0; i < courier.code.length; i++) hash = (hash * 31 + courier.code.charCodeAt(i)) >>> 0;
  const { background, color } =
    COURIER_BADGE_PALETTE[hash % COURIER_BADGE_PALETTE.length] ?? COURIER_BADGE_PALETTE[0]!;
  return { letters, background, color };
}
