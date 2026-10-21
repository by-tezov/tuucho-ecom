import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './PageHero.module.css';

interface PageHeroProps {
  eyebrow: string;
  title: string;
}

/** Shared banner for standalone pages (Guide-style): warm gradient, eyebrow + H1. */
function PageHeroRoot({ eyebrow, title }: PageHeroProps) {
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

export const PageHero = withKernelUi(KERNEL_UI.PageHero, PageHeroRoot);
