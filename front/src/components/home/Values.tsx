import { useLang } from '../../assets/i18n';
import { SectionHeading } from '../ui/SectionHeading';
import styles from './Values.module.css';

export function Values() {
  const { t } = useLang();

  return (
    <section aria-labelledby="val-h" className={styles.section}>
      <div className={styles.inner}>
        <SectionHeading
          title={t.values.title}
          sub={t.values.sub}
          headingId="val-h"
          onDark
          className={styles.heading}
        />
        <div className={styles.grid}>
          {t.values.items.map((item) => (
            <div key={item.title} className={styles.item}>
              <div aria-hidden="true" className={styles.icon}>
                {item.icon}
              </div>
              <h3 className={styles.title}>{item.title}</h3>
              <p className={styles.desc}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
