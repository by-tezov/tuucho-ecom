import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { isNavItemActive, type NavItem } from './navItems';
import styles from './NavDropdown.module.css';

interface NavDropdownProps {
  item: NavItem;
}

/** Desktop nav dropdown (disclosure pattern): a button toggles a panel of route
 *  links. Explicit click only to open/close — no hover trigger (hover-open menus
 *  are unreliable to aim for and fire from incidental mouse movement, not intent).
 *  Also closes on Escape, an outside click, or selecting a child. */
export function NavDropdown({ item }: NavDropdownProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const active = isNavItemActive(item, location.pathname);
  const children = item.children ?? [];

  const closeNow = () => setOpen(false);

  // Close when the route changes (a child was selected).
  useEffect(() => {
    closeNow();
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) closeNow();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeNow();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        ref={buttonRef}
        type="button"
        className={active ? `${styles.trigger} ${styles.triggerActive}` : styles.trigger}
        data-nav-fit=""
        // Disclosure, not a menu: no aria-haspopup, which would announce a
        // menu and promise arrow-key navigation the panel of links does not have.
        aria-expanded={open}
        aria-controls={menuId}
        aria-current={active ? 'page' : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {item.label}
        <span aria-hidden="true" className={styles.caret} data-nav-caret="">
          ⌄
        </span>
      </button>
      <div id={menuId} className={styles.menu} hidden={!open}>
        {children.map((child) => {
          const childActive = isNavItemActive(child, location.pathname);
          const className = childActive ? `${styles.link} ${styles.linkActive}` : styles.link;
          return child.to ? (
            <Link
              key={child.key}
              to={child.to}
              className={className}
              aria-current={childActive ? 'page' : undefined}
            >
              {child.label}
            </Link>
          ) : (
            <button
              key={child.key}
              type="button"
              className={className}
              onClick={() => {
                child.onClick?.();
                closeNow();
              }}
            >
              {child.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
