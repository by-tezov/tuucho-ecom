import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imageRoot = path.join(projectRoot, 'src/assets/images');

/**
 * Editable source artwork stays in its original format. The application
 * manifest imports the generated WebP sibling so production never ships the
 * multi-megabyte originals.
 */
const sources = [
  'hero/hero.jpg',
  'about/portrait.jpg',
  'about/desk.jpg',
  'about/color-1.jpg',
  'about/color-2.jpg',
  'about/color-3.jpg',
  'guide/measure-step-1.jpg',
  'guide/measure-step-2.jpg',
  'guide/measure-step-3.jpg',
  'guide/size-chart.jpg',
  'pose/prep-1.jpg',
  'pose/prep-2.jpg',
  'pose/prep-3.jpg',
  'pose/prep-4-glue.jpg',
  'pose/prep-4-patch.jpg',
  'pose/prep-5.jpg',
];

const optimized = await Promise.all(
  sources.map(async (relativeSource) => {
    const source = path.join(imageRoot, relativeSource);
    const target = source.replace(/\.[^.]+$/, '.webp');
    const sourceBytes = (await stat(source)).size;
    const hasAlpha = path.extname(source).toLowerCase() === '.png';

    await sharp(source)
      .rotate()
      .webp({
        quality: hasAlpha ? 95 : 86,
        alphaQuality: 100,
        smartSubsample: true,
        effort: 6,
      })
      .toFile(target);

    return { sourceBytes, targetBytes: (await stat(target)).size };
  }),
);

const sourceBytes = optimized.reduce((total, image) => total + image.sourceBytes, 0);
const targetBytes = optimized.reduce((total, image) => total + image.targetBytes, 0);
const percentSaved = Math.round((1 - targetBytes / sourceBytes) * 100);

console.log(
  `Optimized ${optimized.length} static images: ${(sourceBytes / 1_000_000).toFixed(2)} MB -> ${(targetBytes / 1_000_000).toFixed(2)} MB (${percentSaved}% smaller).`,
);
