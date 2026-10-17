import { createContext, useContext, type ReactNode } from 'react';
import type { Lang, Strings } from '../assets/i18n/types';

/**
 * The data a prerendered page was built with, handed to the same components
 * on the client so hydration sees an identical tree.
 *
 * Deliberately carries no catalogue data. Product pages are never
 * prerendered — see entry-server.tsx — so `/creations/<slug>` always fetches
 * its set from kernel/back on mount, and a link-preview bot is answered by
 * that backend's own database-backed `/gallery/set/:uid/preview` instead.
 *
 * `lang`/`dict` exist on a locale-prefixed page whose dictionary is
 * lazy-loaded (`/en/gallery`). French `/fr/…` pages use the eagerly-bundled
 * dictionary, so they omit this payload. Other locales would hydrate as
 * French first and flash once the chunk arrives; embedding the already-
 * resolved dictionary lets LanguageContext paint synchronously before first
 * render, matching what the server rendered exactly.
 *
 * The embedded `dict` is JSON, so function formatters are omitted.
 * LanguageContext must still load the real locale module before any UI
 * calls those formatters (onboarding, OTP copy, …).
 *
 * Pages reached by client-side navigation get an empty payload and fetch
 * normally — see ProductPage's useProduct.
 */

export interface PrerenderPayload {
  /** The exact route this markup was built for — main.tsx hydrates only
   * when it matches the URL actually being loaded (the SPA-fallback rewrite
   * serves index.html's markup for unbuilt routes, which must not be
   * hydrated against a different page's tree). */
  path: string;
  /** Present on locale-prefixed pages whose dictionary is lazy-loaded
   * (omitted on eagerly-bundled French `/fr/…` pages). */
  lang?: Lang;
  dict?: Strings;
}

const PrerenderPayloadContext = createContext<PrerenderPayload | null>(null);

export const PRERENDER_PAYLOAD_ELEMENT_ID = '__PRERENDER__';

export function PrerenderPayloadProvider({
  value,
  children,
}: {
  value: PrerenderPayload | null;
  children: ReactNode;
}) {
  return <PrerenderPayloadContext.Provider value={value}>{children}</PrerenderPayloadContext.Provider>;
}

/** The build-time language + dictionary for this exact URL, or undefined
 * when there is none (client-side navigation, or a default-language page —
 * see the PrerenderPayload doc comment for why only locale-prefixed pages
 * carry one). */
export function usePrerenderedLanguage(path: string): { lang: Lang; dict: Strings } | undefined {
  const payload = useContext(PrerenderPayloadContext);
  if (!payload || payload.path !== path || !payload.lang || !payload.dict) return undefined;
  return { lang: payload.lang, dict: payload.dict };
}

/** Reads the payload scripts/prerender.mjs embedded in the served HTML.
 * Returns null in dev (no prerendered markup) and on SPA-fallback routes. */
export function readPrerenderPayload(): PrerenderPayload | null {
  const element = document.getElementById(PRERENDER_PAYLOAD_ELEMENT_ID);
  if (!element?.textContent) return null;
  try {
    const parsed: unknown = JSON.parse(element.textContent);
    if (parsed && typeof parsed === 'object' && typeof (parsed as PrerenderPayload).path === 'string') {
      return parsed as PrerenderPayload;
    }
  } catch {
    // Malformed payload — fall back to a normal client render rather than
    // failing the whole boot.
  }
  return null;
}
