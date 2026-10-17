/**
 * YouTube URL handling, shared by the pose page's player (components/pose/
 * PoseVideo.tsx) and its VideoObject structured data (utils/pageSeo.ts) so
 * the markup can never describe a different video than the one embedded.
 *
 * The env values are the share URLs copied straight out of YouTube, Shorts
 * links included; everything below derives from the 11-character id in them.
 */

/** The video id in a YouTube share URL (`youtu.be/ID`, `/watch?v=ID`,
 * `/shorts/ID`, `/embed/ID`), or undefined for anything else — an invalid or
 * non-YouTube URL must leave the player's placeholder in place and emit no
 * structured data, never embed or describe an arbitrary site. */
export function youtubeVideoId(value: string): string | undefined {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    let videoId: string | null = null;

    if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const [kind, id] = url.pathname.split('/').filter(Boolean);
      videoId =
        kind === 'watch'
          ? url.searchParams.get('v')
          : kind === 'shorts' || kind === 'embed'
            ? (id ?? null)
            : null;
    }

    return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : undefined;
  } catch {
    return undefined;
  }
}

/** The privacy-enhanced embed URL for a share URL, or undefined when it names
 * no YouTube video. Also the `embedUrl` in the VideoObject markup: Google
 * requires a URL that actually loads a player, which is this one and not the
 * `/shorts/` link. */
export function youtubeEmbedUrl(value: string): string | undefined {
  const id = youtubeVideoId(value);
  return id && `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
}

/** The poster frame YouTube serves for a video. `hqdefault` rather than
 * `maxresdefault`: it is generated for every upload, Shorts included, so the
 * `thumbnailUrl` Google requires can never 404. */
export function youtubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
