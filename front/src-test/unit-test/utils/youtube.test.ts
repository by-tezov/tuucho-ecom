import { describe, expect, it } from 'vitest';
import { youtubeEmbedUrl, youtubeThumbnailUrl, youtubeVideoId } from '../../../src/utils/youtube';

describe('youtubeVideoId', () => {
  it('reads the id out of every share form YouTube hands out', () => {
    expect(youtubeVideoId('https://youtube.com/shorts/t9R138HzYSI')).toBe('t9R138HzYSI');
    expect(youtubeVideoId('https://www.youtube.com/shorts/lMAjqNhhNrc')).toBe('lMAjqNhhNrc');
    expect(youtubeVideoId('https://www.youtube.com/watch?v=t9R138HzYSI')).toBe('t9R138HzYSI');
    expect(youtubeVideoId('https://youtu.be/t9R138HzYSI')).toBe('t9R138HzYSI');
    expect(youtubeVideoId('https://www.youtube-nocookie.com/embed/t9R138HzYSI?rel=0')).toBe('t9R138HzYSI');
  });

  /** A misconfigured env value must leave the placeholder in place and emit no
   * structured data, never embed or describe an arbitrary site. */
  it('rejects anything that is not a YouTube video', () => {
    expect(youtubeVideoId('')).toBeUndefined();
    expect(youtubeVideoId('not a url')).toBeUndefined();
    expect(youtubeVideoId('https://vimeo.com/123456')).toBeUndefined();
    expect(youtubeVideoId('https://evil.example/embed/t9R138HzYSI')).toBeUndefined();
    expect(youtubeVideoId('https://www.youtube.com/')).toBeUndefined();
    expect(youtubeVideoId('https://youtu.be/tooshort')).toBeUndefined();
  });
});

describe('derived URLs', () => {
  it('embeds through the privacy-enhanced host', () => {
    expect(youtubeEmbedUrl('https://youtube.com/shorts/t9R138HzYSI')).toBe(
      'https://www.youtube-nocookie.com/embed/t9R138HzYSI?rel=0',
    );
    expect(youtubeEmbedUrl('https://vimeo.com/123456')).toBeUndefined();
  });

  /** hqdefault, not maxresdefault: it exists for every upload, so the
   * thumbnailUrl Google requires can never 404. */
  it('points at a poster frame YouTube always generates', () => {
    expect(youtubeThumbnailUrl('t9R138HzYSI')).toBe('https://i.ytimg.com/vi/t9R138HzYSI/hqdefault.jpg');
  });
});
