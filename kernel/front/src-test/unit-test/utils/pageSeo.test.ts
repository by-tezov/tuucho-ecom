import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({
  shopConfig: {
    siteUrl: 'https://shop.example',
    enabledLanguages: ['en', 'fr'],
    poseVideoGlueUrl: 'https://youtube.com/shorts/t9R138HzYSI',
    poseVideoGlueUploadDate: '2026-07-24T13:11:04-07:00',
    poseVideoGlueDuration: 'PT56S',
    poseVideoPatchUrl: 'https://www.youtube.com/shorts/lMAjqNhhNrc',
    poseVideoPatchUploadDate: '2026-07-26T12:13:25-07:00',
    poseVideoPatchDuration: 'PT1M27S',
  },
}));

import { en } from '@/assets/i18n/strings.en';
import type { Strings } from '@/assets/i18n/types';
import { deepMerge } from '@/plugins/deepMerge';
import { catalog as kernelFr } from '../../../../../plugins/tuucho/locale/tuucho-locale-fr/front/catalog';
import { catalog as faqFr } from '../../../../../plugins/tuucho/home/faq/tuucho-home-faq-locale-fr/front/catalog';
import { catalog as faqEn } from '../../../../../plugins/tuucho/home/faq/tuucho-home-faq/front/catalog';
import { catalog as guidesFr } from '../../../../../plugins/user/demo/guides/demo-page-guides-locale-fr/front/catalog';
import { staticPageJsonLd } from '@/utils/pageSeo';
import { poseStepsFor } from '@/utils/poseVideo';

const fr = deepMerge(deepMerge(deepMerge(en, kernelFr), faqFr), guidesFr);
const english = deepMerge(en, faqEn);
const DICTIONARIES: Record<'fr' | 'en', Strings> = { fr, en: english };

function graph(path: string, lang: 'fr' | 'en' = 'fr'): Record<string, unknown>[] {
  const jsonLd = staticPageJsonLd(path, DICTIONARIES[lang], lang);
  return (jsonLd?.['@graph'] ?? []) as Record<string, unknown>[];
}

function poseGraph(lang: 'fr' | 'en' = 'fr'): Record<string, unknown>[] {
  return graph('/pose', lang);
}

function videosOn(path: string, lang: 'fr' | 'en' = 'fr'): Record<string, unknown>[] {
  return graph(path, lang).filter((node) => node['@type'] === 'VideoObject');
}

describe('the application guide claims no video', () => {
  /** The guide holds two demos and a kit, prep and removal sections, so it
   * can never be a watch page. While it also carried VideoObject markup,
   * fourteen URLs (seven locales, two pages) claimed the same two videos;
   * Google binds a video to one page and kept the guide, which is exactly how
   * both stayed under "Video is not on a watch page". */
  it('emits no VideoObject', () => {
    expect(videosOn('/pose')).toHaveLength(0);
    expect(videosOn('/pose', 'en')).toHaveLength(0);
  });

  it('keeps its FAQ and breadcrumb', () => {
    const types = poseGraph().map((node) => node['@type']);
    expect(types).toContain('FAQPage');
    expect(types).toContain('BreadcrumbList');
  });
});

describe('the home FAQ', () => {
  it('declares every rendered question with its answer', () => {
    for (const lang of ['fr', 'en'] as const) {
      const faq = graph('/home', lang).find((node) => node['@type'] === 'FAQPage');
      expect(faq?.['@id']).toBe(`https://shop.example/${lang}/home#faq`);
      expect(faq?.mainEntity).toEqual(
        DICTIONARIES[lang].faq.items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      );
    }
  });
});

describe('per-video watch pages', () => {
  /** The whole reason these pages exist: Google will not treat an embed as a
   * video result unless some page declares that video as its main entity. */
  it('declares the video as the page main entity', () => {
    const watch = videosOn('/pose-colle');
    expect(watch).toHaveLength(1);
    expect(watch[0]?.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': 'https://shop.example/fr/pose-colle',
    });
  });

  /** Search Console rejects a video missing any of these, which is what put
   * both demos under "Video is not on a watch page" to begin with. */
  it('carries every field Google requires', () => {
    for (const path of ['/pose-colle', '/pose-patch']) {
      const video = videosOn(path)[0]!;
      expect(video.name).toEqual(expect.any(String));
      expect(video.description).toEqual(expect.any(String));
      expect(video.thumbnailUrl).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/\w+\.jpg$/);
      expect(video.uploadDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
      expect(video.duration).toMatch(/^PT(\d+M)?(\d+S)?$/);
      expect(video.embedUrl).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}/);
      // The page it is on, which is the page it is about.
      expect(video.url).toBe(`https://shop.example/fr${path}`);
    }
  });

  /** Two videos sharing a description is one of the ways Google decides only
   * one of them is worth indexing. */
  it('gives each demo its own name, description and id', () => {
    const glue = videosOn('/pose-colle')[0];
    const patch = videosOn('/pose-patch')[0];
    expect(glue?.name).not.toBe(patch?.name);
    expect(glue?.description).not.toBe(patch?.description);
    expect(glue?.['@id']).not.toBe(patch?.['@id']);
  });

  it('localizes the markup with the page', () => {
    expect(videosOn('/pose-colle')[0]?.inLanguage).toBe('fr-FR');
    expect(videosOn('/pose-colle', 'en')[0]?.inLanguage).toBe('en-US');
    expect(videosOn('/pose-colle', 'en')[0]?.name).not.toBe(videosOn('/pose-colle')[0]?.name);
  });

  it('gives each watch page its own video', () => {
    const glue = graph('/pose-colle').find((node) => node['@type'] === 'VideoObject');
    const patch = graph('/pose-patch').find((node) => node['@type'] === 'VideoObject');
    expect(glue?.name).toBe(fr.pose.videoGlueName);
    expect(patch?.name).toBe(fr.pose.videoPatchName);
    expect(glue?.embedUrl).not.toBe(patch?.embedUrl);
  });

  it('trails back through the guide', () => {
    const crumb = graph('/pose-colle').find((node) => node['@type'] === 'BreadcrumbList');
    const items = crumb?.itemListElement as { position: number; name: string; item: string }[];
    expect(items.map((entry) => entry.item)).toEqual([
      'https://shop.example/fr/home',
      'https://shop.example/fr/pose',
      'https://shop.example/fr/pose-colle',
    ]);
    // Matches the trail the page itself renders, not the video's full title.
    expect(items.map((entry) => entry.name)).toEqual([
      fr.nav.home,
      fr.nav.application,
      fr.pose.videoGlueLabel,
    ]);
  });

  it('has no structured data for a path that is not a page', () => {
    expect(staticPageJsonLd('/pose-nope', fr, 'fr')).toBeUndefined();
  });
});

describe('poseStepsFor', () => {
  it('keeps shared guide steps for both watch pages', () => {
    const glue = poseStepsFor('glue', fr);
    const patch = poseStepsFor('patch', fr);
    expect(glue.map(({ step }) => step.title)).toEqual(fr.pose.steps.map((step) => step.title));
    expect(patch.map(({ step }) => step.title)).toEqual(fr.pose.steps.map((step) => step.title));
  });

  it('keeps each step index from the full list', () => {
    expect(poseStepsFor('patch', fr).map(({ index }) => index)).toEqual(
      fr.pose.steps.map((_, index) => index),
    );
  });
});
