import type { CSSProperties } from 'react';
import { useLang } from '../../assets/i18n';
import { shopConfig, type PlatformKey, type ShopPlatformKey, type SocialPlatformKey } from '../../config/env';
import { PlatformIcon } from './PlatformIcon';
import styles from './ShopPlatforms.module.css';

export type PlatformGroup = 'shop' | 'social';

const platformOrder: { shop: ShopPlatformKey[]; social: SocialPlatformKey[] } = {
  shop: ['vinted'],
  social: ['tiktok', 'instagram', 'youtube', 'facebook'],
};

/** Platforms without a configured URL (placeholder "#") aren't ready yet — callers should hide them. */
export function getActivePlatformKeys(group: PlatformGroup): PlatformKey[] {
  return platformOrder[group].filter((key) => shopConfig.platformUrls[key] !== '#');
}

interface ShopPlatformsProps {
  group: PlatformGroup;
}

export function ShopPlatforms({ group }: ShopPlatformsProps) {
  const { t } = useLang();

  const activePlatforms = getActivePlatformKeys(group);
  if (activePlatforms.length === 0) return null;

  // RGAA 13.2: links opening a new window must say so to assistive tech.
  const newWindow = <span className="visuallyHidden"> ({t.newWindowAria})</span>;

  // As many columns as links, up to 4 when they fit, else 2 (never 3 + 1),
  // else 1 (see ShopPlatforms.module.css).
  // A lone card (Vinted) keeps its natural width at every size.
  const columns = {
    '--platform-cols-narrow': activePlatforms.length === 1 ? 'auto' : 'minmax(0, 1fr)',
    '--platform-cols-wide': `repeat(${Math.min(activePlatforms.length, 4)}, auto)`,
    '--platform-cols-mid': `repeat(${Math.min(activePlatforms.length, 2)}, auto)`,
  } as CSSProperties;

  return (
    <div className={styles.cardsFrame}>
      <div className={styles.cardsRow} style={columns}>
        {activePlatforms.map((key) => (
          <a
            key={key}
            href={shopConfig.platformUrls[key]}
            target="_blank"
            rel="noopener"
            className={styles.card}
          >
            <PlatformIcon platform={key} />
            <span className={styles.cardText}>
              <span className={styles.cardName}>
                {t.platforms[key].name}
                {newWindow}
              </span>
              <span className={styles.cardHandle}>{t.platforms[key].handle}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
