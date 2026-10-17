import { useLang } from '../../assets/i18n';
import { POSE_VIDEOS, type PoseVideoVariant } from '../../config/poseVideos';
import { poseVideoContent } from '../../utils/poseVideo';
import { PoseVideoFrame } from './PoseVideoFrame';
import styles from './PoseVideo.module.css';

/** One labelled player on the application guide. */
function VideoFrame({ variant }: { variant: PoseVideoVariant }) {
  const { t } = useLang();
  const video = poseVideoContent(variant, t);

  return (
    <div className={styles.frameGroup}>
      <p className={styles.frameLabel}>{video.label}</p>
      <PoseVideoFrame
        url={video.shareUrl}
        title={video.name}
        posterAlt={t.pose.videoPosterAlt}
        fallback={t.pose.videoFallback}
      />
    </div>
  );
}

/**
 * Both demos side by side on `/pose`, as real players.
 *
 * Dedicated `/pose-colle` and `/pose-patch` pages remain for Google video
 * search (VideoObject + watch-page layout). This guide does not link to them:
 * visitors watch here. Discovery for crawlers is via production `sitemap.xml`,
 * `robots.txt`, the HTML plan du site (under Pose), and watch-page CTAs.
 */
export function PoseVideo() {
  const { t } = useLang();

  return (
    <section aria-labelledby="video-h" className={styles.section}>
      <div>
        <div className={styles.heading}>
          <h2 id="video-h" className={styles.title}>
            {t.pose.videoTitle}
          </h2>
          <p className={styles.sub}>{t.pose.videoSub}</p>
        </div>
        <div className={styles.frames}>
          {POSE_VIDEOS.map((video) => (
            <VideoFrame key={video.variant} variant={video.variant} />
          ))}
        </div>
      </div>
    </section>
  );
}
