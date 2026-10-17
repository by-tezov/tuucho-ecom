import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Seo } from '@kernel/front/components/seo/Seo';
import { useAdminStrings } from '@kernel/front/assets/i18n/admin';
import { useAuthSession } from '@kernel/front/state/AuthContext';
import { usePluginEnabled } from '@kernel/front/plugins/StorefrontBootstrap';
import { getAdminDocs, type AdminDocsArticle, type AdminDocsGroup } from '@kernel/front/api/admin/shopSetup';
import { adminPath } from '@kernel/front/utils/adminRoute';
import { NotFoundPage } from '@kernel/front/routes/NotFoundPage';
import {
  DocsBlocks,
  DocsCallout,
  DocsOutline,
  DocsPager,
  docsSectionId,
  flattenDocsBlocks,
  type DocsBlock,
} from '@kernel/front/components/ui/docs';
import styles from './AdminDocs.module.css';

function articleBlocks(article: AdminDocsArticle['sections'][number]): DocsBlock[] {
  if (article.blocks?.length) return article.blocks as DocsBlock[];
  const blocks: DocsBlock[] = (article.paragraphs ?? []).map((text) => ({ type: 'p' as const, text }));
  if (article.code) blocks.push({ type: 'code', language: 'ts', code: article.code });
  return blocks;
}

function articleBlob(article: AdminDocsArticle): string {
  const sectionText = article.sections
    .map((section) => `${section.heading} ${flattenDocsBlocks(articleBlocks(section))}`)
    .join(' ');
  return `${article.title} ${article.summary} ${sectionText}`;
}

function docsHref(id: string): string {
  return adminPath(id === 'welcome' ? '/docs' : `/docs/${id}`);
}

export function AdminDocsPage() {
  const w = useAdminStrings().whiteLabel;
  const enabled = usePluginEnabled('tuucho-docs-developer');
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
    return articles.filter((article) => articleBlob(article).toLowerCase().includes(needle));
  }, [articles, query]);

  const visibleGroupIds = new Set(filtered.map((article) => article.group));
  const article = articles.find((entry) => entry.id === currentId);
  const currentIndex = articles.findIndex((entry) => entry.id === currentId);
  const previous = currentIndex > 0 ? articles[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 && currentIndex < articles.length - 1 ? articles[currentIndex + 1] : undefined;

  if (!enabled) return <NotFoundPage />;
  if (articles.length > 0 && !article) return <Navigate to={adminPath('/docs')} replace />;

  return (
    <div className={styles.page}>
      <Seo
        title={`${w.docsNavLabel}: ${article?.title ?? w.docsNavLabel}`}
        description={article?.summary ?? w.docsNavDescription}
        path={article ? `/admin/docs/${article.id}` : '/admin/docs'}
      />
      <nav className={styles.nav} aria-label={w.docsContents}>
        <p className={styles.navTitle}>{w.docsContents}</p>
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
                <p className={styles.groupTitle}>{group.title}</p>
                {filtered
                  .filter((entry) => entry.group === group.id)
                  .map((entry) => (
                    <Link
                      key={entry.id}
                      className={entry.id === article?.id ? `${styles.link} ${styles.linkActive}` : styles.link}
                      to={docsHref(entry.id)}
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
            <p className={styles.kicker}>{article.groupTitle}</p>
            <h1 className={styles.title}>{article.title}</h1>
            <p className={styles.summary}>{article.summary}</p>
            {article.pluginEnabled === false ? (
              <DocsCallout tone="warning" title={w.pluginDocsDisabled}>
                {w.pluginDocsDisabled}
              </DocsCallout>
            ) : null}
            <DocsOutline label={w.docsOnThisPage} headings={article.sections.map((section) => section.heading)} />
            {article.sections.map((section, index) => (
              <section key={section.heading} id={docsSectionId(section.heading, index)} className={styles.section}>
                <h2 className={styles.sectionTitle}>{section.heading}</h2>
                <DocsBlocks blocks={articleBlocks(section)} />
              </section>
            ))}
            <DocsPager
              previousLabel={w.docsPrevious}
              nextLabel={w.docsNext}
              previous={previous ? { to: docsHref(previous.id), title: previous.title } : undefined}
              next={next ? { to: docsHref(next.id), title: next.title } : undefined}
            />
          </>
        ) : null}
      </article>
    </div>
  );
}
