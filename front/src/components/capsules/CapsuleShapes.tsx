import { useLang } from '../../assets/i18n';
import { Figure } from '../ui/Figure';
import type { CapsuleForm } from '../../data/capsuleForms';
import styles from './CapsuleShapes.module.css';

interface CapsuleShapesProps {
  forms: CapsuleForm[];
}

export function CapsuleShapes({ forms }: CapsuleShapesProps) {
  const { t } = useLang();

  return (
    <section aria-labelledby="shapes-h" className={styles.section}>
      <div className={styles.heading}>
        <h2 id="shapes-h" className={styles.title}>
          {t.capsules.shapesTitle}
        </h2>
        <p className={styles.sub}>{t.capsules.shapesSub}</p>
      </div>
      <ul className={styles.grid}>
        {forms.map((form) => {
          const copy = t.capsules.forms[form.key];
          return (
            <li key={form.key} className={styles.card}>
              <Figure
                src={form.image}
                alt={copy.alt}
                aspectRatio="3 / 4"
                bordered={false}
                className={styles.photo}
              />
              <h3 className={styles.name}>{copy.name}</h3>
              <p className={styles.desc}>{copy.desc}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
