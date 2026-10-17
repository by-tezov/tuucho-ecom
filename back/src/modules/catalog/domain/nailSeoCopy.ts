import type { Language } from '../../../utils/language.js';
import { GALLERY_SEO_COPY, type GallerySeoCopy } from './gallerySeoCopy.js';

/**
 * The single-nail counterpart of GALLERY_SEO_COPY, for `/gallery-nail` (the
 * compose-a-set gallery) and each nail's own `/nail/<uid>` page.
 *
 * Same duplication arrangement as that file: `title` and `description` stay
 * word for word pamsurin-front's `t.seo.galleryNailTitle` /
 * `t.seo.galleryNailDesc`, and `closing` its `t.product.nailSeoDescSuffix`,
 * because the relay's document and the front's hydrated <Seo> describe the
 * same URL.
 */
export interface NailSeoCopy extends GallerySeoCopy {
  /** Appended to a nail page's description, in place of the set closing
   * (productSeoCopy.ts), which would call a single nail a set. */
  closing: string;
}

export const NAIL_SEO_COPY: Record<Language, NailSeoCopy> = {
  fr: {
    title: 'Compose ton set de pieces artisanales sur mesure',
    description:
      'Choisis un design pour chaque doigt, mixe formes et longueurs, puis ajoute ton set handmade réutilisable au panier.',
    h1: 'Tous les ongles handmade à l’unité',
    intro:
      'Chaque ongle est peint à la main dans l’atelier de Pam. Choisis un design par doigt, mixe formes et longueurs, et compose un set handmade réutilisable qui te ressemble.',
    view: 'Voir l’ongle',
    count: (total) => `${total} ongles disponibles`,
    inStock: GALLERY_SEO_COPY.fr.inStock,
    outOfStock: GALLERY_SEO_COPY.fr.outOfStock,
    related: 'Ongles similaires',
    closing: 'Ongle handmade fait main, à composer dans ton set.',
  },
  en: {
    title: 'Build a custom handmade nail set',
    description:
      'Pick a design for each finger, mix shapes and lengths, and add your custom reusable handmade set to the cart.',
    h1: 'Every single handmade nail',
    intro:
      'Each nail is hand-painted in Pam’s studio. Pick a design for each finger, mix shapes and lengths, and build a reusable handmade set that looks like you.',
    view: 'View the nail',
    count: (total) => `${total} nails available`,
    inStock: GALLERY_SEO_COPY.en.inStock,
    outOfStock: GALLERY_SEO_COPY.en.outOfStock,
    related: 'Similar nails',
    closing: 'Handmade handmade nail, to mix into your own set.',
  },
  th: {
    title: 'สร้างเซ็ตเล็บปลอมแบบกดในแบบของคุณ',
    description:
      'เลือกดีไซน์ให้แต่ละนิ้ว ผสมทรงและความยาว แล้วเพิ่มเซ็ตเล็บปลอมแบบกดที่ใช้ซ้ำได้ลงตะกร้า',
    h1: 'เล็บปลอมแบบกดแบบแยกชิ้นทั้งหมด',
    intro:
      'เล็บแต่ละชิ้นวาดด้วยมือในสตูดิโอของ Pam เลือกดีไซน์ให้แต่ละนิ้ว ผสมทรงและความยาว แล้วสร้างเซ็ตเล็บปลอมแบบกดที่ใช้ซ้ำได้ในแบบของคุณ',
    view: 'ดูเล็บชิ้นนี้',
    count: (total) => `มี ${total} ชิ้น`,
    inStock: GALLERY_SEO_COPY.th.inStock,
    outOfStock: GALLERY_SEO_COPY.th.outOfStock,
    related: 'เล็บที่คล้ายกัน',
    closing: 'เล็บปลอมแบบกดทำมือ สำหรับจัดเป็นเซ็ตของคุณเอง',
  },
  es: {
    title: 'Crea tu set de uñas postizas a medida',
    description:
      'Elige un diseño para cada dedo, combina formas y largos, y añade tu set handmade reutilizable al carrito.',
    h1: 'Todas las uñas handmade por unidad',
    intro:
      'Cada uña se pinta a mano en el taller de Pam. Elige un diseño por dedo, combina formas y largos, y crea un set handmade reutilizable a tu estilo.',
    view: 'Ver la uña',
    count: (total) => `${total} uñas disponibles`,
    inStock: GALLERY_SEO_COPY.es.inStock,
    outOfStock: GALLERY_SEO_COPY.es.outOfStock,
    related: 'Uñas similares',
    closing: 'Uña handmade hecha a mano, para combinar en tu set.',
  },
  it: {
    title: 'Crea il tuo set di unghie finte su misura',
    description:
      'Scegli un design per ogni dito, mescola forme e lunghezze e aggiungi al carrello il tuo set handmade riutilizzabile.',
    h1: 'Tutte le unghie handmade singole',
    intro:
      'Ogni unghia è dipinta a mano nell’atelier di Pam. Scegli un design per dito, mescola forme e lunghezze e crea un set handmade riutilizzabile che ti somiglia.',
    view: 'Vedi l’unghia',
    count: (total) => `${total} unghie disponibili`,
    inStock: GALLERY_SEO_COPY.it.inStock,
    outOfStock: GALLERY_SEO_COPY.it.outOfStock,
    related: 'Unghie simili',
    closing: 'Unghia handmade fatta a mano, da comporre nel tuo set.',
  },
  nl: {
    title: 'Stel je eigen set plaknagels samen',
    description:
      'Kies een design voor elke vinger, combineer vormen en lengtes en voeg je herbruikbare handmade set toe aan je winkelmandje.',
    h1: 'Alle losse handgemaakte stukken',
    intro:
      'Elke nagel wordt met de hand beschilderd in het atelier van Pam. Kies een design per vinger, combineer vormen en lengtes en stel een herbruikbare handmade set samen die bij je past.',
    view: 'Bekijk de nagel',
    count: (total) => `${total} nagels beschikbaar`,
    inStock: GALLERY_SEO_COPY.nl.inStock,
    outOfStock: GALLERY_SEO_COPY.nl.outOfStock,
    related: 'Vergelijkbare nagels',
    closing: 'Handgemaakte handmade nagel, om in je eigen set te combineren.',
  },
  pt: {
    title: 'Cria o teu conjunto de unhas postiças à medida',
    description:
      'Escolhe um design para cada dedo, combina formas e comprimentos e adiciona o teu conjunto handmade reutilizável ao carrinho.',
    h1: 'Todas as unhas handmade à unidade',
    intro:
      'Cada unha é pintada à mão no atelier da Pam. Escolhe um design por dedo, combina formas e comprimentos e cria um conjunto handmade reutilizável à tua medida.',
    view: 'Ver a unha',
    count: (total) => `${total} unhas disponíveis`,
    inStock: GALLERY_SEO_COPY.pt.inStock,
    outOfStock: GALLERY_SEO_COPY.pt.outOfStock,
    related: 'Unhas semelhantes',
    closing: 'Unha handmade feita à mão, para combinar no teu conjunto.',
  },
};
