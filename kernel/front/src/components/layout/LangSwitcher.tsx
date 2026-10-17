import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useLang,
  LANGUAGE_ORDER,
  LANGUAGE_NAMES,
  LANGUAGE_SWITCHER_LABEL,
  type Lang,
} from '../../assets/i18n';
import { shopConfig } from '../../config/env';
import { FlagIcon } from '../ui/FlagIcon';
import { useAuthSession } from '../../state/AuthContext';
import * as authApi from '../../api/account';
import { focusSelectedOrFirstOption, handleListboxKeyDown } from '../../utils/listboxKeyboard';
import styles from './LangSwitcher.module.css';

// A language left out of VITE_ENABLED_LANGUAGES isn't reachable through the switcher.
const configuredLanguageOrder = LANGUAGE_ORDER.filter((l) => shopConfig.enabledLanguages.includes(l));

interface LangSwitcherProps {
  className?: string;
}

/** Compact language picker: a single trigger (current flag + code) that opens a
 *  dropdown of all languages — far narrower than the inline three-flag toggle,
 *  so the mobile header keeps room for the burger. Same disclosure mechanics as
 *  the Guides/Infos dropdown (explicit click only — no hover — close on
 *  select/Escape/outside click). The list is portalled to the end of <body>,
 *  so opening it moves focus onto the current language and the arrow keys
 *  walk it (same listbox keyboard as ShapeTag/QuantityControl); otherwise Tab
 *  from the trigger would never reach it. Each language name carries its own
 *  `lang` so it is read with the right voice (RGAA 8.7). */
export function LangSwitcher({ className }: LangSwitcherProps) {
  const { lang, setLang, availableLanguages } = useLang();
  const { status, authedRequest } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const closeNow = () => {
    setOpen(false);
    setMenuPos(null);
  };

  const menuMounted = menuPos !== null;

  // The trigger sits inside the header, which gives it a stacking context of
  // its own (backdrop-filter + z-index) — a menu left there would paint
  // behind a portalled overlay no matter its own z-index. Portalling the
  // menu to <body> right alongside the overlay, positioned from the
  // trigger's own rect, is what keeps it above the dimmed page like a real
  // dialog/bottom sheet instead of trapped under the header.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menu = menuRef.current;
      const menuWidth = menu?.offsetWidth ?? 160;
      const menuHeight = menu?.offsetHeight ?? 0;
      const margin = 12;
      const left = Math.min(Math.max(margin, rect.left), window.innerWidth - menuWidth - margin);
      const below = rect.bottom + 6;
      const top =
        menuHeight > 0 &&
        below + menuHeight > window.innerHeight - margin &&
        rect.top - menuHeight - 6 >= margin
          ? rect.top - menuHeight - 6
          : below;
      setMenuPos((current) =>
        current && current.top === top && current.left === left ? current : { top, left },
      );
    }
    place();
    let frame = 0;
    function onReposition() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    }
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
    // Re-run once when the menu mounts (menuPos goes from null to set) so the
    // flip-above check can measure its real height; depending on menuPos
    // itself re-subscribed both listeners on every position change.
  }, [open, menuMounted]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      // Menu is portalled to <body>, so wrapRef alone would treat every
      // option click as "outside" and unmount before the option's click
      // handler runs — language never changed.
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeNow();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Capture phase: close only this list, not the open mobile menu.
        e.stopPropagation();
        closeNow();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  // Once the list is placed (and so rendered), put focus on the current language.
  useEffect(() => {
    if (open && menuMounted) focusSelectedOrFirstOption(menuRef.current);
  }, [open, menuMounted]);

  const pick = (l: Lang) => {
    setLang(l);
    if (status === 'authenticated') {
      void authedRequest((token) => authApi.updateLanguagePreference(token, l)).catch(() => {
        // The browser preference has already been saved and remains the
        // active language; a temporary network failure must not undo it.
      });
    }
    closeNow();
    buttonRef.current?.focus();
  };

  return (
    <>
      {open &&
        menuPos &&
        createPortal(
          <div className={styles.layer}>
            <div className={styles.overlay} aria-hidden="true" />
            <div
              ref={menuRef}
              id={menuId}
              className={styles.menu}
              role="listbox"
              tabIndex={-1}
              aria-label={LANGUAGE_SWITCHER_LABEL[lang]}
              style={{ top: menuPos.top, left: menuPos.left }}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) =>
                handleListboxKeyDown(
                  event,
                  Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []),
                  {
                    onEscape: () => {
                      closeNow();
                      buttonRef.current?.focus();
                    },
                  },
                )
              }
            >
              {configuredLanguageOrder.filter((l) => availableLanguages.includes(l)).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="option"
                  lang={l}
                  aria-selected={l === lang}
                  tabIndex={l === lang ? 0 : -1}
                  className={l === lang ? `${styles.option} ${styles.optionActive}` : styles.option}
                  // Click, not pointerdown: the choice happens on release, so
                  // sliding off the option before lifting cancels it (RGAA 13.11).
                  onClick={() => pick(l)}
                >
                  <FlagIcon lang={l} {...(styles.flag ? { className: styles.flag } : {})} />
                  <span className={styles.optionName}>{LANGUAGE_NAMES[l]}</span>
                  <span className={styles.optionCode}>{l.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
      <div ref={wrapRef} className={[styles.wrap, className].filter(Boolean).join(' ')}>
        <button
          ref={buttonRef}
          type="button"
          className={styles.trigger}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((current) => !current)}
        >
          <FlagIcon lang={lang} {...(styles.flag ? { className: styles.flag } : {})} />
          {/* Name = "Changer de langue, FR": it keeps the visible code (label in name). */}
          <span className="visuallyHidden">{LANGUAGE_SWITCHER_LABEL[lang]}, </span>
          <span className={styles.code}>{lang.toUpperCase()}</span>
          <span aria-hidden="true" className={styles.caret}>
            ⌄
          </span>
        </button>
      </div>
    </>
  );
}
