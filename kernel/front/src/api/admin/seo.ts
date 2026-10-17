import { authHeaders, requestJson as request } from '../client';

export type SeoSitemapEntry = {
  loc: string;
  lastmod?: string;
  source?: string;
};

export type SeoStoredRedirect = {
  id: string;
  fromPath: string;
  toPath: string;
  status: number;
};

export type AdminSeoHub = {
  environment: { target: string; publicIndexing: boolean };
  plugins: { sitemap: boolean; robots: boolean; redirects: boolean };
  sitemap: { xmlPath: string; urls: SeoSitemapEntry[]; published: boolean };
  robots: { text: string; inspectPath: string };
  redirects: { applied: boolean; rows: SeoStoredRedirect[] };
};

export function getAdminSeo(accessToken: string) {
  return request<{ success: true } & AdminSeoHub>('/admin/seo', {
    headers: authHeaders(accessToken),
  });
}

export function postAdminSeoRedirect(
  accessToken: string,
  body: { fromPath: string; toPath: string; status: 301 | 410 },
) {
  return request<{ success: true }>('/admin/seo/redirects', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function deleteAdminSeoRedirect(accessToken: string, id: string) {
  return request<{ success: true }>(`/admin/seo/redirects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}
