import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { useAdminStrings } from '../assets/i18n/admin';
import { useAuthSession } from '../state/AuthContext';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';
import { getAdminDocs, type AdminDocsArticle, type AdminDocsGroup } from '../api/admin/shopSetup';
import { adminPath } from '../utils/adminRoute';
import { NotFoundPage } from './NotFoundPage';
import styles from './AdminDocs.module.css';

export function AdminDocsPage() {
  const w = useAdminStrings().whiteLabel;
  const enabled = usePluginEnabled('docs-developer');
  const { authedRequest } = useAuthSession();
  const { articleId } = useParams();
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<AdminDocsGroup[]>([]);
  const [articles, setArticles] = useState<AdminDocsArticle[]>([]);
  const [coreVersion, setCoreVersion] = useState('');
  const [error, setError] = useState('');
  const currentId = articleId || 'welcome';

  useEffect(() => {
    let cancelled = false;
    void authedRequest((token) => getAdminDocs(token))
      .then((result) => {
        if (cancelled) return;
        setGroups(result.groups);
        setArticles(result.articles);
        setCoreVersion(result.coreVersion);
        setError('');
      })
      .catch(() => {
        if (!cancelled) setError(w.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [authedRequest, w.loadError]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return articles;
    return articles.filter((article) => {
      const blob = `${article.title} ${article.summary} ${article.sections.map((section) => `${section.heading} ${section.paragraphs.join(' ')} ${section.code ?? ''}`).join(' ')}`;
      return blob.toLowerCase().includes(needle);
    });
  }, [articles, query]);

  const visibleGroupIds = new Set(filtered.map((article) => article.group));

  if (!enabled) return <NotFoundPage />;
  const article = articles.find((entry) => entry.id === currentId);
  if (articles.length > 0 && !article) return <Navigate to={adminPath('/docs')} replace />;

  return (
    <div className={styles.page}>
      <Seo
        title={`${w.docsNavLabel}: ${article?.title ?? w.docsNavLabel}`}
        description={article?.summary ?? w.docsNavDescription}
        path={article ? `/admin/docs/${article.id}` : '/admin/docs'}
      />
      <nav className={styles.nav} aria-label={w.docsNavLabel}>
        <h1 className={styles.navTitle}>{w.docsNavLabel}</h1>
        {coreVersion ? <p className={styles.coreVersion}>{w.coreVersion(coreVersion)}</p> : null}
        <input
          className={styles.search}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={w.docsSearch}
          aria-label={w.docsSearch}
        />
        <div className={styles.links}>
          {groups
            .filter((group) => visibleGroupIds.has(group.id))
            .map((group) => (
              <div key={group.id} className={styles.group}>
                <p className={styles.groupTitle}>
                  {group.title}
                  {group.enabled === false ? ` (${w.pluginDocsDisabled})` : ''}
                </p>
                {filtered
                  .filter((entry) => entry.group === group.id)
                  .map((entry) => (
                    <Link
                      key={entry.id}
                      className={entry.id === article?.id ? `${styles.link} ${styles.linkActive}` : styles.link}
                      to={adminPath(entry.id === 'welcome' ? '/docs' : `/docs/${entry.id}`)}
                    >
                      {entry.title}
                    </Link>
                  ))}
              </div>
            ))}
          {filtered.length === 0 && !error ? <p className={styles.empty}>{w.docsEmpty}</p> : null}
        </div>
      </nav>
      <article className={styles.article}>
        {error ? <p className={styles.error}>{error}</p> : null}
        {article ? (
          <>
            <h1 className={styles.title}>{article.title}</h1>
            <p className={styles.summary}>{article.summary}</p>
            {article.pluginEnabled === false ? <p className={styles.disabledNote}>{w.pluginDocsDisabled}</p> : null}
            {article.sections.map((section) => (
              <section key={section.heading} className={styles.section}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 80)}>{paragraph}</p>
                ))}
                {section.code ? <pre className={styles.code}>{section.code}</pre> : null}
              </section>
            ))}
          </>
        ) : null}
      </article>
    </div>
  );
}
