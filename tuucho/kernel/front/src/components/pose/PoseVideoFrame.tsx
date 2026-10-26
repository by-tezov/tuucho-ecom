import { images } from '../../assets/images/manifest';
import { resolveBrandAsset, useBrandAssets } from '../../plugins/BrandAssetsContext';
import { youtubeEmbedUrl } from '../../utils/youtube';
import styles from './PoseVideoFrame.module.css';

// Same mode signal as Layout.tsx's own isProd/isPreprod. Dev and preprod
// never actually embed the YouTube iframe (or even fetch the poster image)
// — no point spending real video traffic/CDN hits on non-production
// traffic — but .frame's own sizing (aspect-ratio, background) still
// reserves the same space, so the page still looks/scrolls the same.
const shouldLoadVideo = import.meta.env.MODE === 'prod';

interface PoseVideoFrameProps {
  /** Share URL from config; anything that isn't a YouTube video leaves the
   * coming-soon placeholder in place rather than embedding an arbitrary site. */
  url: string;
  /** Accessible name of the player. */
  title: string;
  posterAlt: string;
  fallback: string;
  className?: string | undefined;
}

/**
 * One demo player. Used on `/pose` (both methods side by side) and on each
 * dedicated watch page (`/pose-colle`, `/pose-patch`).
 *
 * VideoObject structured data stays on the watch pages only (see
 * utils/pageSeo.ts) so Google video results keep a clear canonical URL.
 * `/pose` still embeds for visitors; it does not claim the videos in JSON-LD.
 *
 * No `loading="lazy"` on the iframe: on a watch page the player is the main
 * content and above the fold, and a crawler that has to trigger a load before
 * it sees a video is a crawler that reports no video at all.
 */
export function PoseVideoFrame({ url, title, posterAlt, fallback, className }: PoseVideoFrameProps) {
  const brandAssets = useBrandAssets();
  const embedUrl = shouldLoadVideo ? youtubeEmbedUrl(url) : undefined;
  const frameClass = [styles.frame, className].filter(Boolean).join(' ');

  const poster = (
    <>
      <img
        className={styles.poster}
        src={resolveBrandAsset(brandAssets, 'poseVideoPoster', images.pose.videoPoster)}
        alt={posterAlt}
      />
      <div aria-hidden="true" className={styles.playBadge}>
        ▶
      </div>
      <p className={styles.fallback}>{fallback}</p>
    </>
  );

  return (
    <div className={frameClass}>
      {embedUrl ? (
        <iframe
          className={styles.video}
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; compute-pressure"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : !shouldLoadVideo ? null : (
        <div className={styles.placeholder}>{poster}</div>
      )}
    </div>
  );
}
