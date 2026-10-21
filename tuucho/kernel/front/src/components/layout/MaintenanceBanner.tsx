import { useEffect, useState } from 'react';
import styles from './MaintenanceBanner.module.css';

// Baked in at build time by `npm run build -- maintenance-prepare --from ... --to ...`.
// Absent on a normal build, so this component renders nothing by default.
const FROM = import.meta.env.VITE_MAINTENANCE_FROM ? Number(import.meta.env.VITE_MAINTENANCE_FROM) : null;
const TO = import.meta.env.VITE_MAINTENANCE_TO ? Number(import.meta.env.VITE_MAINTENANCE_TO) : null;
const MESSAGE = import.meta.env.VITE_MAINTENANCE_MESSAGE ?? '';

// Visitor's own local time zone (Date's getters are always local) — FROM/TO
// are absolute epoch ms, so this converts correctly regardless of where the
// visitor or the machine that ran the build are.
function formatLocalDateTime(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function MaintenanceBanner() {
  // Starts hidden and only shows after mount: rendering a Date-derived
  // string during SSR (the prerendered markup can't know "now") would just
  // mismatch on hydration.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (FROM === null || TO === null) return;
    // This is an advance notice, not a "maintenance in progress" indicator —
    // FROM/TO are the window to announce, not a gate on when to show up.
    // Visible from the moment this build goes live until the window itself
    // has fully elapsed; not hidden again once FROM passes, since the
    // maintenance may still be ongoing.
    const update = () => setVisible(Date.now() <= TO);
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!visible || FROM === null || TO === null) return null;

  return (
    <div className={styles.banner} role="status">
      {`Maintenance prévue du ${formatLocalDateTime(FROM)} au ${formatLocalDateTime(TO)}.`}
      {MESSAGE ? ` ${MESSAGE}` : ''}
    </div>
  );
}
