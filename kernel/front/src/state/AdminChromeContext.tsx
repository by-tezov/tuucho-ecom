import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';

interface AdminChromeContextValue {
  resetSectionRef: MutableRefObject<(() => void) | null>;
}

const AdminChromeContext = createContext<AdminChromeContextValue | null>(null);

/** Mounted once by AdminLayout. Lets a repeat tap on the nav entry of the
 * currently mounted master-detail page (Orders, Product Requests, Chats,
 * Unconnected-contacts) bring that page back to its list, even while a
 * record is open, without the layout knowing anything about the page's own
 * state. React Router does not remount a route for a link to itself. */
export function AdminChromeProvider({ children }: { children: ReactNode }) {
  const resetSectionRef = useRef<(() => void) | null>(null);
  const value = useMemo<AdminChromeContextValue>(() => ({ resetSectionRef }), []);
  return <AdminChromeContext.Provider value={value}>{children}</AdminChromeContext.Provider>;
}

export function useAdminChromeResetSectionRef(): MutableRefObject<(() => void) | null> | null {
  const ctx = useContext(AdminChromeContext);
  return ctx ? ctx.resetSectionRef : null;
}

/** Call from a page to register the function that returns it to its list,
 * so a repeat tap on its nav entry can trigger it. */
export function useAdminSectionReset(handler: () => void): void {
  const ctx = useContext(AdminChromeContext);
  useEffect(() => {
    if (!ctx) return;
    const resetSectionRef = ctx.resetSectionRef;
    resetSectionRef.current = handler;
    return () => {
      if (resetSectionRef.current === handler) resetSectionRef.current = null;
    };
  }, [ctx, handler]);
}
