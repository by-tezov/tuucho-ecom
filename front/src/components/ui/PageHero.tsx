import styles from './PageHero.module.css';

interface PageHeroProps {
  eyebrow: string;
  title: string;
}

/** Shared banner for standalone pages (Guide-style): warm gradient, eyebrow + H1. */
export function PageHero({ eyebrow, title }: PageHeroProps) {
  return (
    <section aria-labelledby="page-h" className={styles.section}>
      <div aria-hidden="true" className={styles.texture} />
      <div className={styles.inner}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 id="page-h" className={styles.title}>
          {title}
        </h1>
      </div>
    </section>
  );
}
