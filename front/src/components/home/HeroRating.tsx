import { useEffect, useState } from 'react';
import { useLang } from '../../assets/i18n';
import { fetchHomeReviews, type ShopRating } from '../../api/vintedReviews';
import styles from './Hero.module.css';

/** The hero's third stat: the Vinted rating applied in admin. None applied
 * (or not loaded yet): nothing is shown rather than a made-up value. Loaded
 * lazily by Hero, with the reviews block, off the entry bundle. */
export default function HeroRating() {
  const { t, lang } = useLang();
  const [rating, setRating] = useState<ShopRating | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHomeReviews()
      .then((result) => {
        if (!cancelled) setRating(result.rating);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rating) return null;
  return (
    <>
      <div className={styles.statDivider} />
      <div>
        <div className={styles.statValue}>
          <span aria-hidden="true">★</span> {rating.rating}
        </div>
        <div className={styles.statLabel}>
          {t.hero.stat3Count.replace('{n}', rating.reviewCount.toLocaleString(lang))}
        </div>
      </div>
    </>
  );
}
