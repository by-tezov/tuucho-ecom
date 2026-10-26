import { useLang } from '../../assets/i18n';
import { Figure } from '../ui/Figure';
import { images } from '../../assets/images/manifest';
import { resolveBrandAsset, useBrandAssets } from '../../plugins/BrandAssetsContext';
import styles from './Atelier.module.css';

const COLOR_KEYS = ['aboutColor1', 'aboutColor2', 'aboutColor3'] as const;

export function Atelier() {
  const { t } = useLang();
  const brandAssets = useBrandAssets();

  return (
    <section aria-labelledby="atelier-h" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>{t.atelier.eyebrow}</p>
          <h2 id="atelier-h" className={styles.title}>
            {t.atelier.title}
          </h2>
          <p className={styles.sub}>{t.atelier.sub}</p>
        </div>

        <Figure
          src={resolveBrandAsset(brandAssets, 'aboutDesk', images.about.desk)}
          alt={t.atelier.deskAlt}
          aspectRatio="16 / 10"
          className={styles.desk}
        />

        <div className={styles.tools}>
          <div>
            <h3 className={styles.toolsTitle}>{t.atelier.toolsTitle}</h3>
            <p className={styles.toolsText}>{t.atelier.toolsText}</p>
          </div>
          <ul className={styles.toolsList}>
            {t.atelier.tools.map((tool) => (
              <li key={tool} className={styles.toolItem}>
                <span aria-hidden="true" className={styles.toolMark}>
                  ✦
                </span>
                {tool}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.colorsHeading}>
          <h3 className={styles.colorsTitle}>{t.atelier.colorsTitle}</h3>
          <p className={styles.colorsSub}>{t.atelier.colorsSub}</p>
        </div>
        <ul className={styles.colorsGrid}>
          {t.atelier.colors.map((color, i) => (
            <li key={color.alt}>
              <Figure
                src={resolveBrandAsset(
                  brandAssets,
                  COLOR_KEYS[i] ?? 'aboutColor1',
                  images.about.colors[i] ?? '',
                )}
                alt={color.alt}
                aspectRatio="4 / 5"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
