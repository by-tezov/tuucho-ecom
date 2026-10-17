import type { Language } from '../../../utils/language.js';

/**
 * The only copy the server-rendered gallery index needs of its own.
 *
 * It is a small, deliberate duplicate of pamsurin-front's `t.seo.gallery*`
 * and `t.nav.*`: this service has no access to the front's dictionaries, and
 * shipping the whole i18n bundle here to render one heading would couple a
 * build to a sibling repository. Same arrangement as
 * gift/domain/giverPromiseMailCopy.ts.
 *
 * `h1` is deliberately not the `<title>`: the title is the front's own
 * prerendered one (the relay keeps the shell's head), and a heading that
 * repeats it word for word wastes the one on-page signal Google weighs most.
 */
export interface GallerySeoCopy {
  /** `<title>` text, without the site-name suffix. Must stay word for word
   * the front's `t.seo.galleryTitle`: the relay replaces the whole head, so
   * this is what a crawler reads for the same URL the front prerendered. */
  title: string;
  /** `<meta name="description">`, the front's `t.seo.galleryDesc`. */
  description: string;
  h1: string;
  intro: string;
  /** Accessible label on each card link, completed with the set's title. */
  view: string;
  /** Heading over the index, completed with the number of sets. */
  count: (total: number) => string;
  inStock: string;
  outOfStock: string;
  /** Heading over the related-sets links on a product page. */
  related: string;
}

export const GALLERY_SEO_COPY: Record<Language, GallerySeoCopy> = {
  fr: {
    title: 'Galerie de pieces artisanales',
    description:
      'Toute la collection de pieces faites main : formes, couleurs, formats. Filtre par occasion, forme et couleur pour trouver la tienne.',
    h1: 'Toutes les pieces artisanales faites main',
    intro:
      'Chaque piece est finie a la main dans l atelier Lumen, puis expediee depuis la France. Filtre par occasion, forme et couleur pour trouver celle qui te ressemble.',
    view: 'Voir le set',
    count: (total) => `${total} sets disponibles`,
    inStock: 'En stock',
    outOfStock: 'Épuisé',
    related: 'Sets similaires',
  },
  en: {
    title: 'Gallery of handmade pieces',
    description:
      'Browse every handmade studio piece: shapes, colours, formats. Filter by occasion, shape and colour to find yours.',
    h1: 'Every handmade studio piece',
    intro:
      'Each piece is finished by hand in the Lumen studio, then shipped from France. Filter by occasion, shape and colour to find the one that suits you.',
    view: 'View the set',
    count: (total) => `${total} sets available`,
    inStock: 'In stock',
    outOfStock: 'Sold out',
    related: 'Similar sets',
  },
  th: {
    title: 'แกลเลอรีงานทำมือ',
    description:
      'ชมงานทำมือทั้งหมด: รูปทรง สี ขนาด กรองตามโอกาส รูปทรง และสี เพื่อค้นหาชิ้นที่เหมาะกับคุณ',
    h1: 'งานทำมือทั้งหมด',
    intro:
      'ทุกชิ้นทำมือในสตูดิโอของ Lumen แล้วจัดส่งจากฝรั่งเศส กรองตามโอกาส รูปทรง และสี เพื่อค้นหาชิ้นที่เหมาะกับคุณ',
    view: 'ดูเซ็ตนี้',
    count: (total) => `มี ${total} เซ็ต`,
    inStock: 'มีสินค้า',
    outOfStock: 'สินค้าหมด',
    related: 'เซ็ตที่คล้ายกัน',
  },
  es: {
    title: 'Galería de piezas artesanales',
    description:
      'Explora toda la colección de piezas artesanales hechas a mano: francesa, nude, doradas, decor… Filtra por ocasión, forma y color para encontrar tu pieza.',
    h1: 'Todas las piezas artesanales hechas a mano',
    intro:
      'Cada set se pinta y se monta a mano en el taller de Lumen y se envía desde Francia. Francesa, nude, doradas, decor : filtra por ocasión, forma y color para encontrar el pieza que va contigo.',
    view: 'Ver el set',
    count: (total) => `${total} sets disponibles`,
    inStock: 'En stock',
    outOfStock: 'Agotado',
    related: 'Sets similares',
  },
  it: {
    title: 'Galleria di pezzi artigianali',
    description:
      'Sfoglia tutta la collezione di pezzi artigianali fatti a mano: french, nude, dorate, decor… Filtra per occasione, forma e colore per trovare il tuo set riutilizzabile.',
    h1: 'Tutte le pezzi artigianali fatti a mano',
    intro:
      'Ogni pezzo è finito a mano nell atelier di Lumen, poi spedito dalla Francia. Filtra per occasione, forma e colore per trovare quello che fa per te.',
    view: 'Vedi il set',
    count: (total) => `${total} set disponibili`,
    inStock: 'Disponibile',
    outOfStock: 'Esaurito',
    related: 'Set simili',
  },
  nl: {
    title: 'Galerij met handgemaakte stukken',
    description:
      'Bekijk de hele collectie handgemaakte atelierstukken: french, nude, goud, decor… Filter op gelegenheid, vorm en kleur om jouw herbruikbare set te vinden.',
    h1: 'Alle handgemaakte stukken',
    intro:
      'Elke set wordt met de hand geschilderd en gemonteerd in het atelier van Lumen en daarna vanuit Frankrijk verzonden. French, nude, goud, decor : filter op gelegenheid, vorm en kleur om jouw herbruikbare set te vinden.',
    view: 'Bekijk de set',
    count: (total) => `${total} sets beschikbaar`,
    inStock: 'Op voorraad',
    outOfStock: 'Uitverkocht',
    related: 'Vergelijkbare sets',
  },
  pt: {
    title: 'Galeria de peças artesanais',
    description:
      'Veja toda a coleção de peças artesanais feitas à mão: french, nude, douradas, decor… Filtre por ocasião, forma e cor para encontrar o seu conjunto reutilizável.',
    h1: 'Todas as peças artesanais feitas à mão',
    intro:
      'Cada conjunto é pintado e montado à mão no atelier da Lumen e enviado a partir de França. French, nude, douradas, decor : filtre por ocasião, forma e cor para encontrar o conjunto reutilizável que combina consigo.',
    view: 'Ver o conjunto',
    count: (total) => `${total} conjuntos disponíveis`,
    inStock: 'Em stock',
    outOfStock: 'Esgotado',
    related: 'Sets semelhantes',
  },
};
