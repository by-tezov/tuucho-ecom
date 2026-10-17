import { applyFilters } from '../../plugins/application/hooks.js';
import { config } from '../../../config/env.js';
import { isPublicSeoTarget, PRIVATE_SEO_ROBOTS, PUBLIC_SEO_ROBOTS } from '../../../config/publicSeo.js';

export type ProductSeoFields = {
  productUid: string;
  title: string;
  description: string;
  image?: string;
  price?: number;
  currency?: string;
  availability?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonical?: string | null;
  robots?: string | null;
  ogImage?: string | null;
};

export function productJsonLdGraph(product: ProductSeoFields): Record<string, unknown> {
  const url = product.canonical || `${config.frontendBaseUrl}/creations/${product.productUid}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.seoTitle || product.title,
    description: product.seoDescription || product.description,
    image: product.ogImage || product.image,
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: product.currency || 'EUR',
      price: product.price ?? undefined,
      availability: product.availability || 'https://schema.org/InStock',
    },
  };
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    name: config.company.name,
    url: config.frontendBaseUrl,
  };
}

export async function composeJsonLdGraph(base: unknown[]): Promise<unknown[]> {
  if (!isPublicSeoTarget(config.target)) return [];
  return applyFilters('seo.jsonld.graph', base);
}

export async function composeSeoMeta<T extends Record<string, unknown>>(meta: T): Promise<T> {
  const publicIndexing = isPublicSeoTarget(config.target);
  const withDefaults = {
    ...meta,
    robots: publicIndexing
      ? typeof meta.robots === 'string'
        ? meta.robots
        : PUBLIC_SEO_ROBOTS
      : PRIVATE_SEO_ROBOTS,
    sitemap: publicIndexing
      ? typeof meta.sitemap === 'string'
        ? meta.sitemap
        : `${config.frontendBaseUrl}/sitemap.xml`
      : undefined,
  };
  const filtered = await applyFilters('seo.meta', withDefaults);
  if (publicIndexing) return filtered;
  return { ...filtered, robots: PRIVATE_SEO_ROBOTS, sitemap: undefined };
}
