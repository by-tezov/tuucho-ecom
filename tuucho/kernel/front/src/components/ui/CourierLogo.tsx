import type { Courier } from '../../api/account';
import { courierLogoUrl } from '../../assets/images/courierLogos';
import { courierBadge } from '../../utils/courierBadge';
import styles from './CourierLogo.module.css';

interface CourierLogoProps {
  courier: Pick<Courier, 'code' | 'name'>;
  /** Sizing/shape class from the calling surface (the box), so each place
   * keeps its own dimensions — this component only owns what goes inside. */
  className?: string | undefined;
  /** True where the courier's name is already written next to the logo, so
   * repeating it would only add noise for screen readers. */
  decorative?: boolean | undefined;
}

/** A courier's logo where one has been dropped into
 * `assets/images/couriers/`, its two-letter initials badge otherwise.
 * Couriers come from the server, so the fallback is the normal path for any
 * courier whose logo file hasn't been added (yet). */
export function CourierLogo({ courier, className, decorative = false }: CourierLogoProps) {
  const logo = courierLogoUrl(courier.code);
  const boxClass = [styles.box, className].filter(Boolean).join(' ');

  if (logo) {
    return (
      <img
        className={boxClass}
        src={logo}
        alt={decorative ? '' : courier.name}
        title={courier.name}
        loading="lazy"
        aria-hidden={decorative || undefined}
      />
    );
  }

  const badge = courierBadge(courier);
  return (
    <span
      className={boxClass}
      style={{ background: badge.background, color: badge.color }}
      title={courier.name}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : courier.name}
      role={decorative ? undefined : 'img'}
    >
      {badge.letters}
    </span>
  );
}

interface CourierLogosProps {
  couriers: Pick<Courier, 'code' | 'name'>[];
  className?: string | undefined;
  logoClassName?: string | undefined;
  /** Beyond this, the rest collapses into a "+N" chip. */
  max?: number | undefined;
}

/** The couriers that can serve one address, as a compact logo row. A home
 * address is often served by several; a pickup address by the one network
 * carrier — so this caps the row instead of letting it grow with the
 * courier list. */
export function CourierLogos({ couriers, className, logoClassName, max = 3 }: CourierLogosProps) {
  if (couriers.length === 0) return null;
  const shown = couriers.slice(0, max);
  const hidden = couriers.length - shown.length;
  const hiddenNames = couriers
    .slice(max)
    .map((courier) => courier.name)
    .join(', ');
  return (
    <span className={[styles.row, className].filter(Boolean).join(' ')}>
      {shown.map((courier) => (
        <CourierLogo key={courier.code} courier={courier} className={logoClassName} />
      ))}
      {hidden > 0 && (
        // The names were only in `title`, which keyboard, touch and most
        // screen-reader users never get: they are in the text too.
        <span
          className={[styles.box, styles.more, logoClassName].filter(Boolean).join(' ')}
          title={hiddenNames}
        >
          <span aria-hidden="true">+{hidden}</span>
          <span className="visuallyHidden">{hiddenNames}</span>
        </span>
      )}
    </span>
  );
}
