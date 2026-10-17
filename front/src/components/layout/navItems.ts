import type { MouseEvent } from 'react';

export interface NavItem {
  key: string;
  label: string;
  /** route path, for Home/Gallery */
  to?: string;
  /** Without `to`: an action rendered as a button (logout…). With `to`: the
   * link's in-app behaviour (Home scrolls to the top when already there); the
   * entry stays a real link, since it navigates (see navLinkClickHandler). */
  onClick?: () => void;
  /** route this item represents for active-state, when it navigates via onClick (e.g. Home) */
  matchPath?: string;
  /** dropdown group — a parent label whose children are route links (e.g. Guide → Tailles/Pose) */
  children?: NavItem[];
  /** Renders a divider before this child within its group — e.g. setting
   * "Se déconnecter" apart from the rest of MobileNav.tsx's "Mon compte"
   * group, same idea as AccountShell.tsx's own `separatorAfter`. */
  separatorBefore?: boolean;
  /** Destructive entry — rendered in the same red as AccountShell's own
   * "Se déconnecter" link, so the hamburger matches the account sidebar. */
  danger?: boolean;
}

/** Optional parent grouping for product destinations, same shape as Guides. */
export function groupProductNav(list: NavItem[], _label: string): NavItem[] {
  return list;
}

/** Click handler for a nav link that also has an in-app action (`to` and
 * `onClick`). A modified or non-primary click (new tab, new window) stays
 * with the browser; a plain click runs the action instead of the default
 * navigation. */
export function navLinkClickHandler(
  onClick: (() => void) | undefined,
): ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined {
  if (!onClick) return undefined;
  return (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onClick();
  };
}

/** True when the current route means this nav item (or, for a group, one of its children) is the active page. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.children) return item.children.some((child) => isNavItemActive(child, pathname));
  const path = item.to ?? item.matchPath;
  return path !== undefined && pathname === path;
}
