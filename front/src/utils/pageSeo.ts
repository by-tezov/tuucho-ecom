import { shopConfig } from '../config/env';
import type { Strings } from '../assets/i18n';
import type { Lang } from '../assets/i18n/types';
import { seoKeywords } from './seoKeywords';
import { localizedPath, OG_LOCALES } from '../config/i18nRoutes';
import { youtubeEmbedUrl, youtubeThumbnailUrl, youtubeVideoId } from './youtube';
import { POSE_VIDEOS, type PoseVideoVariant } from '../config/poseVideos';
import { poseVideoContent } from './poseVideo';
import { capsuleLengthSpecs } from '../data/capsuleLengths';

/**
 * Structured data for the static pages that carry genuine question-and-answer
 * content — the home FAQ, the size guide, the shape guide, and the
 * application guide.
 *
 * A caveat worth knowing: since 2023 Google only shows FAQ *rich results* for
 * government and health sites, so this will not put dropdowns under the blue
 * link for a shop. It is still worth emitting: it is how the answers get
 * quoted by AI answer surfaces and assistant crawlers, which is where "how do
 * I measure my nails" style questions increasingly get answered. Every
 * question/answer below is text already rendered on the page, which is what
 * makes the markup legitimate rather than keyword stuffing.
 */

interface FaqEntry {
  question: string;
  answer: string;
}

/** No `@context` of its own — every caller nests this inside a graph that
 * already declares one. */
function faqPage(url: string, entries: FaqEntry[]): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

/**
 * A VideoObject for one demo, or undefined when the video is not fully
 * described.
 *
 * Why this exists: Search Console reports the embeds under "Video is not on a
 * watch page", which is what it says when it finds a player but nothing tells
 * it what the player holds. An iframe alone is opaque — Google will not guess
 * a title, a poster frame or an upload date, and those three are exactly what
 * it requires before a video can appear as a video result.
 *
 * Emitted on the video's own page and nowhere else. `/pose` embeds both
 * players for visitors but does not declare VideoObject there: fourteen
 * URLs (seven locales, two pages) claiming the same video made Google pick
 * the guide, which cannot qualify as a watch page. Watch pages keep the
 * structured claim; the guide keeps the UX.
 *
 * `uploadDate` and `duration` come from config (see shopConfig's note): a
 * fabricated date is worse than no markup, so a video missing either fact is
 * dropped from the graph rather than described with a placeholder. The
 * thumbnail is YouTube's own poster frame, which is the image the player
 * actually shows and therefore the honest one to declare.
 */
function demoVideo(
  variant: PoseVideoVariant,
  t: Strings,
  pageUrl: string,
  lang: Lang,
): Record<string, unknown> | undefined {
  const video = poseVideoContent(variant, t);
  const id = youtubeVideoId(video.shareUrl);
  const embedUrl = youtubeEmbedUrl(video.shareUrl);
  if (!id || !embedUrl || !video.uploadDate || !video.duration) return undefined;
  return {
    '@type': 'VideoObject',
    '@id': `${pageUrl}#video-${id}`,
    name: video.name,
    description: video.description,
    thumbnailUrl: youtubeThumbnailUrl(id),
    uploadDate: video.uploadDate,
    duration: video.duration,
    // `embedUrl` only, deliberately: Google reads `contentUrl` as the raw
    // media file, which a YouTube watch URL is not.
    embedUrl,
    url: pageUrl,
    // The property that answers "is this a watch page?". The caller is always
    // that page, so it is unconditional.
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    inLanguage: OG_LOCALES[lang].replace('_', '-'),
    isFamilyFriendly: true,
    publisher: { '@id': `${shopConfig.siteUrl}/#shop` },
  };
}

function breadcrumb(t: Strings, name: string, url: string, homeUrl: string): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t.nav.home, item: homeUrl },
      { '@type': 'ListItem', position: 2, name, item: url },
    ],
  };
}

/** Home > Application guide > this video. `name` is the short label the page
 * renders in its own breadcrumb, not the video's full title: structured data
 * is supposed to reflect what the visitor actually sees. */
function videoBreadcrumb(
  t: Strings,
  name: string,
  url: string,
  guideUrl: string,
  homeUrl: string,
): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t.nav.home, item: homeUrl },
      { '@type': 'ListItem', position: 2, name: t.nav.application, item: guideUrl },
      { '@type': 'ListItem', position: 3, name, item: url },
    ],
  };
}

/** The home page's FAQ (ContactFaq), question for question. The links some
 * answers end with are navigation, not part of the answer, so they are left out. */
function homeFaq(t: Strings, url: string): Record<string, unknown> {
  return faqPage(
    url,
    t.faq.items.map((item) => ({ question: item.q, answer: item.a })),
  );
}

/** The size guide's on-page answers: how to measure, plus each measuring step. */
function sizesFaq(t: Strings, url: string): Record<string, unknown> {
  return faqPage(url, [
    { question: t.guide.leadTitle, answer: t.guide.leadSub },
    {
      question: t.guide.howTitle,
      answer: t.guide.steps.map((step) => `${step.title} : ${step.desc}`).join(' '),
    },
    { question: t.guide.customTitle, answer: t.guide.customSub },
  ]);
}

/** The shape guide's on-page answers: what each shape and each length looks
 * like, and what the lengths measure — every line already rendered on the
 * page (CapsuleShapes/CapsuleLengths). */
function capsulesFaq(t: Strings, url: string): Record<string, unknown> {
  const forms = Object.values(t.capsules.forms)
    .map((form) => `${form.name} : ${form.desc}`)
    .join(' ');
  const lengths = capsuleLengthSpecs
    .map((length) => {
      const copy = t.capsules.lengths[length.key];
      return `${copy.name} : ${copy.desc}`;
    })
    .join(' ');
  return faqPage(url, [
    { question: t.capsules.shapesTitle, answer: `${t.capsules.shapesSub} ${forms}` },
    { question: t.capsules.lengthsTitle, answer: `${t.capsules.lengthsSub} ${lengths}` },
    {
      question: t.capsules.lengthsTableTitle,
      answer: `${t.capsules.lengthsNote} ${t.capsules.lengthsNoteSizesBefore}${t.capsules.lengthsNoteSizesLink}${t.capsules.lengthsNoteSizesAfter}`,
    },
  ]);
}

/** The application guide's on-page answers: what's in the kit, how to prep
 * and apply, and how to remove without damage. */
function poseFaq(t: Strings, url: string): Record<string, unknown> {
  return faqPage(url, [
    { question: t.pose.kitTitle, answer: `${t.pose.kitText} ${t.pose.kitIncludes.join(', ')}.` },
    {
      question: t.pose.prepTitle,
      answer: t.pose.steps.map((step) => `${step.title} : ${step.desc}`).join(' '),
    },
    {
      question: t.pose.removalTitle,
      answer: `${t.pose.removalSteps.map((step) => `${step.title} : ${step.desc}`).join(' ')} ${t.pose.removalNote}`,
    },
    { question: t.pose.removalPatchTitle, answer: t.pose.removalPatchText },
  ]);
}

/**
 * The page-specific graph for a static route, or undefined for the routes
 * that only need the site-wide OnlineStore/WebSite block.
 *
 * Shared by the runtime <Seo> component and the build-time prerenderer so
 * both describe a page identically — see utils/productSeo.ts for the same
 * arrangement on product pages. `path` is the unprefixed identity (`/gallery`);
 * URLs in the graph include the language prefix.
 */
export function staticPageJsonLd(path: string, t: Strings, lang: Lang): Record<string, unknown> | undefined {
  const url = `${shopConfig.siteUrl}${localizedPath(path, lang)}`;
  const homeUrl = `${shopConfig.siteUrl}${localizedPath('/home', lang)}`;
  const keywords = seoKeywords(lang);
  switch (path) {
    case '/home':
      // No breadcrumb: home is the root every other trail starts from.
      return {
        '@context': 'https://schema.org',
        '@graph': [homeFaq(t, url)],
      };
    case '/sizes':
      return {
        '@context': 'https://schema.org',
        '@graph': [sizesFaq(t, url), breadcrumb(t, t.nav.sizes, url, homeUrl)],
      };
    case '/capsules':
      return {
        '@context': 'https://schema.org',
        '@graph': [capsulesFaq(t, url), breadcrumb(t, t.nav.capsules, url, homeUrl)],
      };
    case '/pose':
      // No VideoObject here: each video is claimed once, by its watch page.
      // `/pose` still embeds for visitors. See demoVideo above.
      return {
        '@context': 'https://schema.org',
        '@graph': [poseFaq(t, url), breadcrumb(t, t.nav.application, url, homeUrl)],
      };
    case '/gallery':
      return {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'CollectionPage',
            '@id': `${url}#collection`,
            name: t.seo.galleryTitle,
            description: t.seo.galleryDesc,
            keywords,
            url,
            isPartOf: { '@id': `${shopConfig.siteUrl}/#website` },
          },
          breadcrumb(t, t.nav.gallery, url, homeUrl),
        ],
      };
    case '/contact':
      return {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'ContactPage',
            '@id': `${url}#contact`,
            name: t.seo.contactTitle,
            keywords,
            url,
            mainEntity: { '@id': `${shopConfig.siteUrl}/#shop` },
          },
          breadcrumb(t, t.nav.contact, url, homeUrl),
        ],
      };
    case '/about':
      return {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'AboutPage',
            '@id': `${url}#about`,
            name: t.seo.aboutTitle,
            keywords,
            url,
            mainEntity: { '@id': `${shopConfig.siteUrl}/#shop` },
          },
          breadcrumb(t, t.nav.about, url, homeUrl),
        ],
      };
    default: {
      // A per-video watch page: one VideoObject, declared as the page's main
      // entity, plus the trail back to the guide. Nothing else — the whole
      // point of these pages is that the video is what they are about.
      const video = POSE_VIDEOS.find((candidate) => candidate.path === path);
      if (!video) return undefined;
      const node = demoVideo(video.variant, t, url, lang);
      if (!node) return undefined;
      const guideUrl = `${shopConfig.siteUrl}${localizedPath('/pose', lang)}`;
      return {
        '@context': 'https://schema.org',
        '@graph': [
          node,
          videoBreadcrumb(t, poseVideoContent(video.variant, t).label, url, guideUrl, homeUrl),
        ],
      };
    }
  }
}
