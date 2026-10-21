import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { useAdminStrings, type AdminUiStrings } from '../assets/i18n/admin';
import { useAuthSession } from '../state/AuthContext';
import { shopConfig } from '../config/env';
import { adminPath } from '../utils/adminRoute';
import { deleteAdminSeoRedirect, getAdminSeo, postAdminSeoRedirect, type AdminSeoHub } from '../api/admin/seo';
import styles from './AdminSeoPage.module.css';

type SeoTab = 'overview' | 'sitemap' | 'robots' | 'redirects';

function parseTab(value: string | null): SeoTab {
  if (value === 'sitemap' || value === 'robots' || value === 'redirects') return value;
  return 'overview';
}

function seoTabs(seo: AdminUiStrings['seo']): { id: SeoTab; label: string }[] {
  return [
    { id: 'overview', label: seo.tabOverview },
    { id: 'sitemap', label: seo.tabSitemap },
    { id: 'robots', label: seo.tabRobots },
    { id: 'redirects', label: seo.tabRedirects },
  ];
}

function pluginState(on: boolean, seo: AdminUiStrings['seo']): string {
  return on ? seo.pluginOn : seo.pluginOff;
}

export function AdminSeoPage() {
  const seo = useAdminStrings().seo;
  const { authedRequest } = useAuthSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get('tab'));
  const [hub, setHub] = useState<AdminSeoHub | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fromPath, setFromPath] = useState('');
  const [toPath, setToPath] = useState('');
  const [status, setStatus] = useState<301 | 410>(301);
  const tabs = useMemo(() => seoTabs(seo), [seo]);

  async function reload() {
    const result = await authedRequest((token) => getAdminSeo(token));
    setHub(result);
    setError('');
  }

  useEffect(() => {
    void reload().catch(() => setError(seo.loadError));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authedRequest]);

  function selectTab(id: SeoTab) {
    const next = new URLSearchParams(searchParams);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    setError('');
    try {
      await authedRequest((token) => postAdminSeoRedirect(token, { fromPath, toPath, status }));
      setFromPath('');
      setToPath('');
      setStatus(301);
      await reload();
      setNotice(seo.saved);
    } catch {
      setError(seo.saveError);
    }
  }

  async function onDelete(id: string) {
    setNotice('');
    setError('');
    try {
      await authedRequest((token) => deleteAdminSeoRedirect(token, id));
      await reload();
      setNotice(seo.saved);
    } catch {
      setError(seo.deleteError);
    }
  }

  return (
    <section className={styles.section}>
      <Seo title={seo.hubTitle} description={seo.hubDescription} path={adminPath('/seo')} noindex />
      <h1 className={styles.title}>{seo.hubTitle}</h1>
      <p className={styles.intro}>{seo.hubDescription}</p>
      <div className={styles.tabs} role="tablist" aria-label={seo.tabsAria}>
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className={styles.notice}>{notice}</p> : null}

      {activeTab === 'overview' ? (
        <div role="tabpanel">
          <dl className={styles.flags}>
            <div className={styles.flag}>
              <dt>{seo.envTitle}</dt>
              <dd>
                {hub?.environment.publicIndexing
                  ? seo.envProduction
                  : seo.envNonProduction(hub?.environment.target ?? 'dev')}{' '}
                {hub?.environment.publicIndexing ? seo.envIndexingOn : seo.envIndexingOff}
              </dd>
            </div>
            <div className={styles.flag}>
              <dt>{seo.sitemapTitle}</dt>
              <dd>{pluginState(hub?.plugins.sitemap ?? false, seo)}. {seo.sitemapKernel}</dd>
            </div>
            <div className={styles.flag}>
              <dt>{seo.robotsTitle}</dt>
              <dd>{pluginState(hub?.plugins.robots ?? false, seo)}. {seo.robotsKernel}</dd>
            </div>
            <div className={styles.flag}>
              <dt>{seo.redirectsTitle}</dt>
              <dd>{pluginState(hub?.plugins.redirects ?? false, seo)}. {seo.redirectsKernel}</dd>
            </div>
          </dl>
          <p className={styles.hint}>{seo.overviewHint}</p>
        </div>
      ) : null}

      {activeTab === 'sitemap' ? (
        <div role="tabpanel" className={styles.panel}>
          <h2 className={styles.panelTitle}>{seo.sitemapTitle}</h2>
          <p className={styles.hint}>{seo.sitemapDescription}</p>
          {hub && !hub.sitemap.published ? <p className={styles.hint}>{seo.sitemapNotPublished}</p> : null}
          <p className={styles.hint}>{seo.sitemapCount(hub?.sitemap.urls.length ?? 0)}</p>
          <div className={styles.actions}>
            <Button href={`${shopConfig.siteUrl}${hub?.sitemap.xmlPath ?? '/sitemap.xml'}`} variant="ghost">
              {seo.sitemapOpen}
            </Button>
          </div>
          {hub && hub.sitemap.urls.length > 0 ? (
            <ul className={styles.list}>
              {hub.sitemap.urls.map((entry) => (
                <li key={entry.loc} className={styles.row}>
                  <span className={styles.loc}>{entry.loc}</span>
                  <span className={styles.source}>{entry.lastmod ?? ''}</span>
                  <span className={styles.source}>{entry.source ?? ''}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'robots' ? (
        <div role="tabpanel" className={styles.panel}>
          <h2 className={styles.panelTitle}>{seo.robotsTitle}</h2>
          <p className={styles.hint}>{seo.robotsDescription}</p>
          <div className={styles.actions}>
            <Button href={`${shopConfig.apiBaseUrl}${hub?.robots.inspectPath ?? '/storefront/robots.txt'}`} variant="ghost">
              {seo.robotsOpen}
            </Button>
          </div>
          {hub?.robots.text ? <pre className={styles.preview}>{hub.robots.text}</pre> : null}
        </div>
      ) : null}

      {activeTab === 'redirects' ? (
        <div role="tabpanel" className={styles.panel}>
          <h2 className={styles.panelTitle}>{seo.redirectsTitle}</h2>
          <p className={styles.hint}>{seo.redirectsDescription}</p>
          {hub && !hub.redirects.applied ? <p className={styles.hint}>{seo.redirectsNotApplied}</p> : null}
          {hub && hub.redirects.rows.length === 0 ? (
            <p className={styles.hint}>{seo.redirectsEmpty}</p>
          ) : (
            <ul className={styles.list}>
              {(hub?.redirects.rows ?? []).map((row) => (
                <li key={row.id} className={styles.row}>
                  <span className={styles.loc}>{row.fromPath}</span>
                  <span>{row.toPath}</span>
                  <span>{row.status === 410 ? seo.status410 : seo.status301}</span>
                  <Button type="button" variant="ghostDanger" onClick={() => void onDelete(row.id)}>
                    {seo.deleteRedirect}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
            <label className={styles.field}>
              <span>{seo.fromPath}</span>
              <input value={fromPath} onChange={(event) => setFromPath(event.target.value)} required />
            </label>
            <label className={styles.field}>
              <span>{seo.toPath}</span>
              <input
                value={toPath}
                onChange={(event) => setToPath(event.target.value)}
                required={status !== 410}
              />
            </label>
            <label className={styles.field}>
              <span>{seo.status}</span>
              <select
                value={status}
                onChange={(event) => setStatus(Number(event.target.value) === 410 ? 410 : 301)}
              >
                <option value={301}>{seo.status301}</option>
                <option value={410}>{seo.status410}</option>
              </select>
            </label>
            <Button type="submit">{seo.addRedirect}</Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
