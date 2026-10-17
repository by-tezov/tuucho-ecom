import type { ProductById } from '../api/gallery';
import type { GalleryItem } from '../data/types';

/** Cart hydration needs ProductById; the gift catalogue only returns gallery
 * sets. Nail-only — gift baskets cannot hold accessories. */
export function galleryItemAsProduct(item: GalleryItem): ProductById {
  const firstShape = Object.keys(item.shape)[0];
  const firstLength = firstShape ? Object.keys(item.lengthsByShape[firstShape] ?? {})[0] : undefined;
  const photo =
    firstShape && firstLength
      ? (item.photosByShapeLength[firstShape]?.[firstLength]?.[0]?.small ?? null)
      : null;
  return {
    id: item.id,
    productType: 'nail',
    productUid: item.productUid,
    title: item.title,
    desc: item.desc,
    price: item.price,
    photo,
    available: item.available,
  };
}
