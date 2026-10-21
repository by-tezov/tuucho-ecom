import { CloseIcon } from '@kernel/front/components/ui/CloseIcon';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Lang, Strings } from '@kernel/front/assets/i18n/types';
import { useFocusTrap } from '@kernel/front/hooks/useFocusTrap';
import { useLockBodyScroll } from '@kernel/front/hooks/useLockBodyScroll';
import { useHistoryBackClose } from '@kernel/front/hooks/useHistoryBackClose';
import { isCompletePostalCode } from '@kernel/front/utils/postalCode';
import styles from './MondialRelayPicker.module.css';

const MOBILE_SHEET_MQ = '(max-width: 1023px)';

/** Mondial Relay's own widget locales, checked against the live widget: it
 * takes a culture code, and only `fr-FR`, `es-ES`, `it-IT` and `nl-NL`
 * actually translate it — every other value, including a bare "fr", falls
 * back to English. So Portuguese and Thai visitors get the English widget,
 * which is the closest thing the widget has; leaving them on the French
 * default would be worse. Passing nothing at all is French, which is why
 * this is always sent. */
const WIDGET_LANGUAGE: Record<Lang, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
};

export interface MondialRelayPoint {
  id: string;
  name: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  countryCode: string;
  openingHours: MondialRelayOpeningHours[];
}

export interface MondialRelayOpeningHours {
  day: string;
  periods: string[];
}

export interface MondialRelayCity {
  name: string;
  postalCode: string;
}

interface MondialRelayPickerProps {
  t: Strings;
  /** Site language — the widget renders its own labels, so it has to be
   * told which language the page is in (see WIDGET_LANGUAGE). */
  lang: Lang;
  brand: string;
  searchTerm?: string;
  /** Explicit mobile-sheet request after the customer chose a city suggestion. */
  openResultsRequest: number;
  cityQuery?: string;
  country: string;
  /** Enabled Point Relais countries from `GET /account/couriers` — drives
   * the widget's AllowedCountries so page select and widget stay aligned. */
  allowedCountries: string[];
  onSelect: (point: MondialRelayPoint) => void;
  onCitySuggestions: (cities: MondialRelayCity[]) => void;
}

type JQuerySelection = {
  MR_ParcelShopPicker: (options: Record<string, unknown>) => void;
  trigger: (event: string, args?: unknown[]) => void;
  find: (selector: string) => JQuerySelection;
  val: (value: string) => JQuerySelection;
};

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}

function loadStylesheet(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

function parseOpeningHours(hoursHtml: string | undefined): MondialRelayOpeningHours[] {
  if (!hoursHtml) return [];
  const document = new DOMParser().parseFromString(hoursHtml, 'text/html');
  return [...document.querySelectorAll('tr')]
    .map((row) =>
      [...row.querySelectorAll('th, td')]
        .map((cell) => cell.textContent?.replaceAll(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean),
    )
    .filter((cells) => cells.length > 0)
    .map(([day, ...periods]) => ({ day: day ?? '', periods: periods.filter((period) => period !== '-') }));
}

export function MondialRelayPicker({
  t,
  lang,
  brand,
  searchTerm,
  openResultsRequest,
  cityQuery,
  country,
  allowedCountries,
  onSelect,
  onCitySuggestions,
}: MondialRelayPickerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<JQuerySelection | null>(null);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const allowedCountriesKey = allowedCountries.join(',');
  // Mobile-only bottom sheet for the result list (see MondialRelayPicker
  // .module.css's .sheetOpen/.mobileSheetHeader/.reopenButton) — hasResults
  // tracks whether the widget currently has any points to show (watched via
  // MutationObserver below, since the widget has no callback for this), and
  // sheetOpen is purely ours: auto-opens the first time results appear,
  // closeable by the customer afterward, reopenable via the floating button.
  const [hasResults, setHasResults] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isMobileSheet, setIsMobileSheet] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_SHEET_MQ).matches,
  );
  const [scrollHint, setScrollHint] = useState({ up: false, down: false });
  const overlayOpen = sheetOpen && isMobileSheet;

  useLockBodyScroll(overlayOpen);
  const requestCloseSheet = useHistoryBackClose(() => setSheetOpen(false), overlayOpen);
  // The open sheet is modal: Tab cycles its header and the result list
  // (both inside .hostWrap, the rest of the widget made inert below) and
  // never reaches the page under the backdrop.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(wrapRef, { enabled: overlayOpen, onEscape: requestCloseSheet });

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_SHEET_MQ);
    const onChange = () => setIsMobileSheet(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Choosing one of our city suggestions is an explicit request to see the
  // pickup points. The widget can refresh an already-populated list without
  // producing the empty-to-results transition watched below, so open the
  // sheet directly rather than relying on that transition.
  useEffect(() => {
    if (openResultsRequest > 0) setSheetOpen(true);
  }, [openResultsRequest]);

  useEffect(() => {
    if (allowedCountries.length === 0) return;
    let cancelled = false;
    const host = hostRef.current;
    setReady(false);
    void (async () => {
      try {
        loadStylesheet('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        await loadScript('https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js');
        await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
        await loadScript(
          'https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js',
        );
        if (cancelled || !hostRef.current) return;
        const jquery = (window as unknown as { jQuery: (target: HTMLElement) => JQuerySelection }).jQuery;
        const widget = jquery(hostRef.current);
        widgetRef.current = widget;
        widget.MR_ParcelShopPicker({
          Target: '#mondial-relay-point-id',
          Brand: brand,
          // The widget searches one country at a time; AllowedCountries is
          // what it will accept, and the page's own country select drives
          // which one is searched (see MR_DoSearch below). Both come from
          // the Point Relais courier's enabled countries so they never disagree.
          Country: allowedCountries[0],
          AllowedCountries: allowedCountriesKey,
          WidgetLanguage: WIDGET_LANGUAGE[lang],
          EnableGeolocalisatedSearch: true,
          Responsive: true,
          OnParcelShopSelected: (data: Record<string, string>) => {
            // Picking a point from the mobile sheet is a deliberate,
            // completed choice — no reason to make the customer also
            // close the sheet themselves to see the confirmation below it.
            setSheetOpen(false);
            onSelect({
              id: data.ID ?? '',
              name: data.Nom ?? '',
              line1: data.Adresse1 ?? '',
              line2: data.Adresse2 ?? '',
              postalCode: data.CP ?? '',
              city: data.Ville ?? '',
              countryCode: data.Pays ?? '',
              openingHours: parseOpeningHours(data.HoursHtmlTable),
            });
          },
        });
        setReady(true);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      // The widget's markup is server-rendered in one language, so a
      // language switch has to rebuild it. Its DOM is its own — React never
      // rendered those children — so clearing the host here is what keeps a
      // rebuild from stacking a second widget on top of the first.
      host?.replaceChildren();
    };
  }, [allowedCountries, allowedCountriesKey, brand, lang, onSelect]);

  useEffect(() => {
    if (!ready || !searchTerm) return;
    const widget = widgetRef.current;
    const normalizedSearchTerm = searchTerm.replaceAll(/\s/g, '');
    // The widget only searches by postal code, so a city name typed into
    // the search field is handled by the suggestions effect below instead.
    // Which shapes count as a postal code depends on the country (NL and
    // PT are not digits-only) — see utils/postalCode.ts.
    if (!isCompletePostalCode(normalizedSearchTerm, country)) return;
    widget?.find('input.Arg1').val(country);
    widget?.find('input.iArg0').val('');
    widget?.trigger('MR_DoSearch', [normalizedSearchTerm, country]);
  }, [country, ready, searchTerm]);

  // The widget has no callback for "results changed", so this watches its
  // own result-list DOM directly (same technique as the city-suggestions
  // effect below). Opens the mobile sheet the moment results first appear
  // (rising edge only, via prevHadResults) — once the customer closes it
  // themselves, a later DOM mutation for the *same* search (the widget
  // reorders/refreshes list items internally) must not reopen it. Keyed on
  // searchTerm so prevHadResults re-arms per search: a new search commonly
  // replaces the whole result list in one batched DOM update with no
  // observable 0-results moment in between, so without this a second search
  // would never see a rising edge again.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let prevHadResults = false;
    const checkResults = () => {
      const count = host.querySelectorAll('.MRW-RList .PR-List-Item').length;
      const has = count > 0;
      setHasResults(has);
      if (has && !prevHadResults) setSheetOpen(true);
      prevHadResults = has;
    };
    const observer = new MutationObserver(checkResults);
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [searchTerm]);

  // A postal code starts with a digit in every country the picker offers,
  // and no city name does — which is what tells the two apart here. It
  // cannot be "is it all digits": NL codes carry two letters (1012 AB) and
  // PT codes a dash (1000-001), and neither is a city to look up.
  useEffect(() => {
    const city = cityQuery?.trim();
    if (!ready || !city || city.length < 3 || /^\d/.test(city)) {
      onCitySuggestions([]);
      return;
    }
    const widget = widgetRef.current;
    const host = hostRef.current;
    if (!widget || !host) return;

    const publishSuggestions = () => {
      const cities = [...host.querySelectorAll<HTMLElement>('.PR-AutoCplCity .PR-City')].map(
        (suggestion) => ({
          name: suggestion.getAttribute('name') ?? '',
          postalCode: suggestion.getAttribute('title') ?? '',
        }),
      );
      if (cities.length === 0) return;
      observer.disconnect();
      clearTimeout(timeout);
      onCitySuggestions(cities);
    };
    const observer = new MutationObserver(publishSuggestions);
    observer.observe(host, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => observer.disconnect(), 5000);
    widget.find('input.Arg1').val(country);
    widget.find('input.Arg2').val('');
    widget.find('input.iArg0').val(city).trigger('keyup');

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [cityQuery, country, onCitySuggestions, ready]);

  // Keyboard reach of the widget-owned list on mobile. Closed, the sheet sits
  // translated below the viewport, so its rows must not take Tab. Open, it is
  // the only part of the widget above the backdrop: everything beside the
  // list (search, map) goes inert. Only nodes set here are reset.
  useEffect(() => {
    const host = hostRef.current;
    const list = host?.querySelector<HTMLElement>('.MRW-RList');
    if (!host || !list || !isMobileSheet) return;
    const made: HTMLElement[] = [];
    const makeInert = (element: Element) => {
      if (!(element instanceof HTMLElement) || element.inert) return;
      element.inert = true;
      made.push(element);
    };
    if (!overlayOpen) {
      makeInert(list);
    } else {
      for (let node: HTMLElement = list; node !== host && node.parentElement; node = node.parentElement) {
        for (const sibling of node.parentElement.children) if (sibling !== node) makeInert(sibling);
      }
    }
    return () => made.forEach((element) => (element.inert = false));
  }, [hasResults, isMobileSheet, overlayOpen, ready]);

  // Widget-owned .MRW-RList is the sheet's scroller — same chevron + track
  // cue as FilterSheet / cart drawer, attached here because that node is
  // not a React ref.
  useLayoutEffect(() => {
    if (!overlayOpen) {
      setScrollHint({ up: false, down: false });
      return;
    }
    const list = hostRef.current?.querySelector<HTMLElement>('.MRW-RList');
    if (!list) return;
    const update = () => {
      setScrollHint({
        up: list.scrollTop > 4,
        down: list.scrollTop + list.clientHeight < list.scrollHeight - 4,
      });
    };
    update();
    list.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      list.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [hasResults, overlayOpen]);

  // Leaflet measures the full InfoWindow (hours + 182px photo) before our
  // CSS hides those siblings, then writes that width inline. Clear it whenever
  // a popup mounts / Leaflet rewrites style so the bubble shrinks to the title.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !ready) return;
    let shrinking = false;
    let raf = 0;

    const shrinkMapPopups = () => {
      if (shrinking) return;
      shrinking = true;
      try {
        host.querySelectorAll<HTMLElement>('.leaflet-popup').forEach((popup) => {
          const content = popup.querySelector<HTMLElement>('.leaflet-popup-content');
          const wrapper = popup.querySelector<HTMLElement>('.leaflet-popup-content-wrapper');
          const info = popup.querySelector<HTMLElement>('.InfoWindow');
          const name = popup.querySelector<HTMLElement>('.PR-Name');
          if (!content || !name) return;

          // Name must not stretch to the old 320px parent while we measure it.
          name.style.setProperty('display', 'inline-block', 'important');
          name.style.setProperty('width', 'auto', 'important');
          if (info) info.style.setProperty('width', 'auto', 'important');
          content.style.setProperty('width', 'auto', 'important');
          content.style.setProperty('min-width', '0', 'important');
          if (wrapper) wrapper.style.setProperty('width', 'auto', 'important');

          const titleWidth = Math.ceil(name.getBoundingClientRect().width);
          if (titleWidth > 0) {
            const next = `${titleWidth}px`;
            if (content.style.width !== next) {
              content.style.setProperty('width', next, 'important');
            }
          }
        });
      } finally {
        shrinking = false;
      }
    };

    const scheduleShrink = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(shrinkMapPopups);
    };

    shrinkMapPopups();
    const observer = new MutationObserver(scheduleShrink);
    observer.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [ready]);

  const sheetOverlay =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <>
            {overlayOpen && (
              <div className={styles.sheetBackdrop} onClick={requestCloseSheet} aria-hidden="true" />
            )}
            {overlayOpen && (
              <div className={styles.sheetScrollHints} aria-hidden="true">
                {scrollHint.up && (
                  <span className={styles.scrollHintUp}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2.5 7.5L6 4L9.5 7.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
                {scrollHint.down && (
                  <span className={styles.scrollHintDown}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2.5 4.5L6 8L9.5 4.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
                {(scrollHint.up || scrollHint.down) && (
                  <span
                    className={[
                      styles.scrollHintBar,
                      scrollHint.up && styles.scrollHintBarFromUp,
                      scrollHint.down && styles.scrollHintBarToDown,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                )}
              </div>
            )}
          </>,
          document.body,
        );

  return (
    <>
      {!ready && !error && <p>{t.address.mondialRelayPickerLoading}</p>}
      {error && <p>{t.address.mondialRelayPickerError}</p>}
      <input id="mondial-relay-point-id" type="hidden" />
      {/* .mapPlaceholder is a sibling of the widget's own target div, not a
          child of it — jQuery owns that div's contents entirely once it
          initializes and would wipe out anything React put inside it.
          .hostWrap carries the position: relative context instead so the
          placeholder can still overlay .host's exact reserved area. */}
      <div ref={wrapRef} className={styles.hostWrap}>
        <div
          className={
            overlayOpen
              ? `${styles.mobileSheetHeader} ${styles.mobileSheetHeaderOpen}`
              : styles.mobileSheetHeader
          }
          // Always mounted for its slide-in; off-screen until the sheet opens.
          inert={!overlayOpen}
        >
          <span className={styles.mobileSheetTitle}>{t.address.mondialRelaySheetTitle}</span>
          <button
            type="button"
            className={styles.mobileSheetClose}
            onClick={requestCloseSheet}
            aria-label={t.gallery.close}
          >
            <CloseIcon size={14} />
          </button>
        </div>
        <div ref={hostRef} className={overlayOpen ? `${styles.host} ${styles.sheetOpen}` : styles.host} />
        {!searchTerm && <p className={styles.mapPlaceholder}>{t.address.mondialRelaySearchPrompt}</p>}
      </div>
      {sheetOverlay}
      {hasResults && !sheetOpen && (
        <button
          type="button"
          className={styles.reopenButton}
          onClick={() => setSheetOpen(true)}
          aria-label={t.address.mondialRelayReopenListAria}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 13V3M8 3L3 8M8 3L13 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </>
  );
}
