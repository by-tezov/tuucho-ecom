import type { PlatformKey } from '../../config/env';
import facebookIconUrl from '../../assets/images/brand/facebook-f.svg?no-inline';
import instagramIconUrl from '../../assets/images/brand/instagram.svg?no-inline';
import tiktokIconUrl from '../../assets/images/brand/tiktok.svg?no-inline';
import vintedIconUrl from '../../assets/images/brand/vinted.svg?no-inline';
import youtubeIconUrl from '../../assets/images/brand/youtube.svg?no-inline';
import styles from './PlatformIcon.module.css';

/** Official platform glyph on the platform's brand background, as each brand's
 *  app icon shows it (Instagram's gradient, TikTok's black tile; YouTube and Facebook
 *  show their full-colour logo on a white tile). */
const iconUrls: Record<PlatformKey, string> = {
  vinted: vintedIconUrl,
  tiktok: tiktokIconUrl,
  instagram: instagramIconUrl,
  youtube: youtubeIconUrl,
  facebook: facebookIconUrl,
};

export function PlatformIcon({ platform }: { platform: PlatformKey }) {
  return (
    <span className={`${styles.badge} ${styles[platform]}`} aria-hidden="true">
      <img src={iconUrls[platform]} alt="" width={20} height={20} decoding="async" className={styles.icon} />
    </span>
  );
}
