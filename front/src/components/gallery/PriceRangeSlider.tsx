import { useId } from 'react';
import { useLang } from '../../assets/i18n';
import { formatPrice } from '../../utils/formatPrice';
import styles from './PriceRangeSlider.module.css';

export interface PriceRangeValue {
  min: number;
  max: number;
}

interface PriceRangeSliderProps {
  bounds: PriceRangeValue;
  value: PriceRangeValue;
  onChange: (next: PriceRangeValue) => void;
}

/** Dual-thumb euro range control for the gallery filter sheet. */
export function PriceRangeSlider({ bounds, value, onChange }: PriceRangeSliderProps) {
  const { t } = useLang();
  const minId = useId();
  const maxId = useId();
  const span = Math.max(1, bounds.max - bounds.min);
  const minPercent = ((value.min - bounds.min) / span) * 100;
  const maxPercent = ((value.max - bounds.min) / span) * 100;

  function onMinChange(nextMin: number) {
    onChange({ min: Math.min(nextMin, value.max), max: value.max });
  }

  function onMaxChange(nextMax: number) {
    onChange({ min: value.min, max: Math.max(nextMax, value.min) });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.labels}>
        <span className={styles.labelValue}>{formatPrice(value.min)}</span>
        <span className={styles.labelValue}>{formatPrice(value.max)}</span>
      </div>
      <div className={styles.trackWrap}>
        <div className={styles.track} aria-hidden="true" />
        <div
          className={styles.rangeFill}
          style={{ left: `${minPercent}%`, right: `${100 - maxPercent}%` }}
          aria-hidden="true"
        />
        <input
          id={minId}
          type="range"
          className={styles.thumb}
          min={bounds.min}
          max={bounds.max}
          step={1}
          value={value.min}
          aria-label={t.gallery.priceRangeMinAria}
          onChange={(event) => onMinChange(Number(event.target.value))}
        />
        <input
          id={maxId}
          type="range"
          className={styles.thumb}
          min={bounds.min}
          max={bounds.max}
          step={1}
          value={value.max}
          aria-label={t.gallery.priceRangeMaxAria}
          onChange={(event) => onMaxChange(Number(event.target.value))}
        />
      </div>
      <div className={styles.bounds} aria-hidden="true">
        <span>{formatPrice(bounds.min)}</span>
        <span>{formatPrice(bounds.max)}</span>
      </div>
    </div>
  );
}
