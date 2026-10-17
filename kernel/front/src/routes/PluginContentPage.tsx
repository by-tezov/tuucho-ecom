import { useParams } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { PageHero } from '../components/ui/PageHero';
import { IntroSurface } from '../components/ui/IntroSurface';
import { useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import { NotFoundPage } from './NotFoundPage';
import styles from './AboutPage.module.css';

export function PluginContentPage() {
  const { pluginSlug } = useParams();
  const bootstrap = useStorefrontBootstrap();
  const slug = (pluginSlug ?? '').trim();
  const plugin = bootstrap.plugins.find(
    (entry) =>
      entry.enabled &&
      entry.kind === 'page' &&
      (entry.route === `/${slug}` || entry.nav?.key === slug),
  );
  if (!plugin) return <NotFoundPage />;

  const settings = plugin.settings ?? {};
  const title = String(settings.title ?? plugin.name);
  const body = String(settings.body ?? '');
  const path = plugin.route ?? `/${slug}`;
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  return (
    <>
      <Seo title={title} description={body.slice(0, 160)} path={path} />
      <IntroSurface>
        <div className="backLinkTop">
          <LegalPageBackLink placement="top" />
        </div>
        <div className={styles.heroWrap}>
          <PageHero eyebrow={plugin.name} title={title} />
        </div>
        {paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}
      </IntroSurface>
      <div className="backLinkBottom">
        <LegalPageBackLink placement="bottom" />
      </div>
    </>
  );
}
