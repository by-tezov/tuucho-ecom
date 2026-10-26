import type { GiftShareCardStyle } from '../domain/shareCardStyle.js';
import {
  amitieArt,
  amitieNail,
  anniversaireArt,
  anniversaireNail,
  diplomeArt,
  diplomeNail,
  feteArt,
  feteNail,
  mariageArt,
  mariageNail,
  merciArt,
  merciNail,
  meresArt,
  meresNail,
  minimalArt,
  minimalNail,
  noelArt,
  noelNail,
  classicArt,
  classicNail,
  valentinArt,
  valentinNail,
} from './shareCardArt/classic.js';
import {
  artdecoArt,
  artdecoNail,
  botaniqueArt,
  botaniqueNail,
  celesteArt,
  celesteNail,
  coquinArt,
  coquinNail,
  halloweenArt,
  halloweenNail,
  mangaArt,
  mangaNail,
  neonArt,
  neonNail,
  nouvelanArt,
  nouvelanNail,
} from './shareCardArt/occasion.js';
import { fantastiqueArt, fantastiqueNail } from './shareCardArt/myth.js';

export interface ShareCardArt {
  art: string;
  nail: string;
}

export const SHARE_CARD_ART: Record<GiftShareCardStyle, ShareCardArt> = {
  classic: { art: classicArt, nail: classicNail },
  anniversaire: { art: anniversaireArt, nail: anniversaireNail },
  mariage: { art: mariageArt, nail: mariageNail },
  fete: { art: feteArt, nail: feteNail },
  noel: { art: noelArt, nail: noelNail },
  valentin: { art: valentinArt, nail: valentinNail },
  meres: { art: meresArt, nail: meresNail },
  merci: { art: merciArt, nail: merciNail },
  diplome: { art: diplomeArt, nail: diplomeNail },
  amitie: { art: amitieArt, nail: amitieNail },
  minimal: { art: minimalArt, nail: minimalNail },
  coquin: { art: coquinArt, nail: coquinNail },
  manga: { art: mangaArt, nail: mangaNail },
  halloween: { art: halloweenArt, nail: halloweenNail },
  nouvelan: { art: nouvelanArt, nail: nouvelanNail },
  artdeco: { art: artdecoArt, nail: artdecoNail },
  botanique: { art: botaniqueArt, nail: botaniqueNail },
  neon: { art: neonArt, nail: neonNail },
  celeste: { art: celesteArt, nail: celesteNail },
  fantastique: { art: fantastiqueArt, nail: fantastiqueNail },
};
