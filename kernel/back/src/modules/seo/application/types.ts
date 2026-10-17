export type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
  source?: string;
};

export type RobotsRule = {
  userAgent?: string;
  directive: 'Allow' | 'Disallow' | 'Sitemap';
  value: string;
};

export type RedirectRule = {
  fromPath: string;
  toPath: string;
  status: 301 | 410;
  source?: string;
};

export type StoredRedirect = {
  id: string;
  fromPath: string;
  toPath: string;
  status: number;
};

export type SeoPluginFlags = {
  sitemap: boolean;
  robots: boolean;
  redirects: boolean;
};
