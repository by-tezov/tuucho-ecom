import { useStorefrontBootstrap } from '@kernel/front/plugins/StorefrontBootstrap';
import styles from '@kernel/front/components/layout/Footer.module.css';

function setting(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

/** Operator-owned shop name / tagline / copyright for slot.footer.identity. */
export function FooterIdentity() {
  const { plugins } = useStorefrontBootstrap();
  const plugin = plugins.find((item) => item.id === 'footer-identity');
  const settings = plugin?.settings ?? {};
  const shopName = setting(settings.shopName) || 'Shop';
  const tagline = setting(settings.tagline);
  const alsoKnownAs = setting(settings.alsoKnownAs);
  const copyrightSuffix = setting(settings.copyrightSuffix);
  const year = new Date().getFullYear();

  return (
    <>
      <div className={styles.brand}>{shopName}</div>
      {tagline || alsoKnownAs ? (
        <p className={styles.brandTagline}>
          {tagline}
          {tagline && alsoKnownAs ? <br /> : null}
          {alsoKnownAs}
        </p>
      ) : null}
      <p className={styles.copyright}>
        {copyrightSuffix ? `© ${year} ${shopName} · ${copyrightSuffix}` : `© ${year} ${shopName}`}
      </p>
    </>
  );
}
