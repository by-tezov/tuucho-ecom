import raw from '../assets/i18n/data/guide-size-chart.json';

export interface SizeChartRow {
  tip: number;
  mm: number;
}

const table = raw as unknown as { chart: Record<string, number> };

/** Same tip -> mm reference as the size sets above (assets/i18n/data/
 *  guide-size-chart.json — edit that file, not this one), sorted by tip
 *  number ascending regardless of key order in the JSON. */
export const sizeChart: SizeChartRow[] = Object.entries(table.chart)
  .map(([tip, mm]) => ({ tip: Number(tip), mm }))
  .sort((a, b) => a.tip - b.tip);
