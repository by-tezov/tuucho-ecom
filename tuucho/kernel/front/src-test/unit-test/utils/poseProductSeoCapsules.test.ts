import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({
  shopConfig: {
    siteUrl: 'https://shop.test',
    shopName: 'Shop',
    enabledLanguages: ['en', 'fr'],
    poseVideoGlueUrl: 'https://youtu.be/glue',
    poseVideoPatchUrl: 'https://youtu.be/patch',
    poseVideoGlueUploadDate: '2026-01-01T00:00:00+00:00',
    poseVideoGlueDuration: 'PT1M',
    poseVideoPatchUploadDate: '2026-02-01T00:00:00+00:00',
    poseVideoPatchDuration: 'PT2M',
  },
}));

import { poseStepsFor, poseVideoContent } from '@/utils/poseVideo';
import {
  productImages,
  productJsonLd,
  productSeoDescription,
  productSeoTitle,
} from '@/utils/productSeo';
import { CAPSULE_FORM_KEYS, capsuleForms } from '@/data/capsuleForms';
import { shapeOrder } from '@/data/capsuleLengthTable';
import { CAPSULE_LENGTH_KEYS, capsuleLengthSpecs } from '@/data/capsuleLengths';
import { filterAllLabel, filterGroupLabels } from '@/data/filters';
import type { GalleryItem } from '@/data/types';
import type { Strings } from '@/assets/i18n/types';

const t = {
  pose: {
    videoGlueLabel: 'Glue',
    videoGlueName: 'Glue name',
    videoGlueDesc: 'Glue desc',
    videoPatchLabel: 'Patch',
    videoPatchName: 'Patch name',
    videoPatchDesc: 'Patch desc',
    steps: [
      { variant: undefined, title: 'Shared' },
      { variant: 'glue', title: 'Glue only' },
      { variant: 'patch', title: 'Patch only' },
    ],
  },
  product: {
    seoNoun: 'pieces',
    seoNounAlt: 'handmade pieces',
    seoTitleTerm: 'pieces',
    seoDescSuffix: 'Handmade pieces.',
    schemaCategory: 'Handmade',
    occasionLabel: 'Occasion',
    shapeLabel: 'Shape',
  },
  nav: { home: 'Home', gallery: 'Gallery' },
} as Strings;

const item = {
  id: '1',
  productUid: 'aq-yz-367',
  title: 'Set',
  desc: 'Amande, a soft pink set',
  descTemplate: '$Shape.title, a soft pink set',
  price: 29.5,
  occasion: 'Mariage',
  shape: { almond: 'Amande' },
  shapeGender: { almond: 'f' },
  lengthsByShape: { almond: { medium: 'Medium' } },
  lengthGenderByShape: { almond: { medium: 'm' } },
  colorMain: ['Rose'],
  photosByShapeLength: {
    almond: {
      medium: [{ small: 's.webp', modal: 'm.webp' }],
    },
  },
  available: { almond: { medium: { M: 2 } } },
} as unknown as GalleryItem;

describe('poseVideo', () => {
  it('binds config and copy for each variant', () => {
    expect(poseVideoContent('glue', t)).toMatchObject({
      shareUrl: 'https://youtu.be/glue',
      label: 'Glue',
      name: 'Glue name',
    });
    expect(poseStepsFor('glue', t).map((entry) => entry.step.title)).toEqual(['Shared', 'Glue only']);
    expect(poseStepsFor('patch', t).map((entry) => entry.step.title)).toEqual(['Shared', 'Patch only']);
  });
});

describe('productSeo', () => {
  it('builds description, images and JSON-LD offers', () => {
    expect(productImages(item)).toEqual(['m.webp']);
    // The authored sentence names the shape through `$Shape`; a product page
    // resolves it with the product term attached, which is the only place the
    // catalogue copy is allowed to carry commercial vocabulary.
    // English puts the shape before the noun ("almond pieces").
    expect(productSeoDescription(item, t, 'en')).toMatch(
      /^Amande (handmade )?pieces, a soft pink set/,
    );
    expect(productSeoDescription(item, t, 'en')).toContain('Handmade pieces.');
    expect(productSeoTitle(item, t, 'en')).toBe('Set, Amande pieces · Shop');
    // French after it, and copy that does not open on the shape keeps its
    // own words: no noun is doubled into "Glossy pieces … nails".
    expect(productSeoTitle(item, t, 'fr')).toBe('Set, pieces Amande · Shop');
    const glossy = { ...item, descTemplate: 'Glossy $shape.title nails' } as GalleryItem;
    expect(productSeoDescription(glossy, t, 'en')).toMatch(/^Glossy Amande nails /);
    const ld = productJsonLd(item, t, 'fr') as {
      '@graph': Array<Record<string, unknown>>;
    };
    const product = ld['@graph'][0] as {
      offers?: { price: string; availability: string };
      sku: string;
    };
    expect(product.sku).toBe('aq-yz-367');
    expect(product.offers?.price).toBe('29.50');
    expect(product.offers?.availability).toContain('InStock');
  });

  it('omits offers when the set has no price', () => {
    const unpaid = { ...item, price: undefined } as GalleryItem;
    const ld = productJsonLd(unpaid, t, 'en') as { '@graph': Array<Record<string, unknown>> };
    expect(ld['@graph'][0]).not.toHaveProperty('offers');
  });
});

describe('capsuleForms and capsuleLengths', () => {
  it('keeps canonical key order', () => {
    expect(CAPSULE_FORM_KEYS).toEqual(['almond', 'ballerina', 'coffin', 'oval', 'square', 'stiletto']);
    // Display order follows the length JSON's shape order.
    expect(capsuleForms.map((form) => form.key)).toEqual(
      shapeOrder.filter((key) => capsuleForms.some((form) => form.key === key)),
    );
    expect(CAPSULE_LENGTH_KEYS).toEqual(['extraShort', 'short', 'medium', 'long', 'extra']);
    // Measurements are no longer a property of the spec — they live in
    // data/capsuleLengthTable.ts, one base ± variation per shape and length. What this list still
    // owes the rest of the app is its order.
    expect(capsuleLengthSpecs.map((length) => length.key)).toEqual(CAPSULE_LENGTH_KEYS);
  });
});

describe('filters label tables', () => {
  it('covers every category in every enabled language', () => {
    const langs = ['en', 'fr'] as const;
    const categories = Object.keys(filterAllLabel);
    expect(categories.sort()).toEqual(Object.keys(filterGroupLabels).sort());
    for (const category of categories as Array<keyof typeof filterAllLabel>) {
      for (const lang of langs) {
        expect(filterAllLabel[category][lang].length).toBeGreaterThan(0);
        expect(filterGroupLabels[category][lang].length).toBeGreaterThan(0);
      }
    }
  });
});
