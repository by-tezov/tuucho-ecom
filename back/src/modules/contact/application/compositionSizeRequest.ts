import type { Pool } from 'pg';
import { config } from '../../../config/env.js';
import type { CompositionSizeRequestNailLine } from '../../messaging/application/compositionSizeRequestEmail.js';
import { localize, type Language } from '../../../utils/language.js';
import type { PartialTrilingual, Size } from '../../../types.js';
import { insertProductRequest } from './productRequest.js';

const FINGER_FR: Record<string, string> = {
  'left-thumb': 'pouce gauche',
  'left-index': 'index gauche',
  'left-middle': 'majeur gauche',
  'left-ring': 'annulaire gauche',
  'left-pinky': 'auriculaire gauche',
  'right-thumb': 'pouce droit',
  'right-index': 'index droit',
  'right-middle': 'majeur droit',
  'right-ring': 'annulaire droit',
  'right-pinky': 'auriculaire droit',
};

export interface CompositionSizeRequestNailInput {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  variationKey: string;
  finger: string;
}

export interface CompositionSizeRequestInput {
  userId: string | null;
  email: string;
  size: Size;
  quantity: number;
  comment: string | null;
  nails: CompositionSizeRequestNailInput[];
  /** The request's language, kept for the emailed reply. */
  language: Language;
}

interface NailRow {
  product_uid: string;
  title: PartialTrilingual;
  shape_label: PartialTrilingual | null;
  length_label: PartialTrilingual | null;
  variation_title: PartialTrilingual | null;
  price: string | null;
  photo_path: string | null;
  offered: boolean;
}

async function loadNail(
  pool: Pool,
  nail: CompositionSizeRequestNailInput,
  size: Size,
  userId: string | null,
): Promise<NailRow | undefined> {
  const { rows } = await pool.query<NailRow>(
    `select p.product_uid, p.title,
            s.label as shape_label,
            sl.label as length_label,
            vo.title as variation_title,
            (select price from product_prices
              where product_id = p.id and effective_at <= now()
              order by effective_at desc limit 1) as price,
            (select small_path from product_photos
              where product_id = p.id and shape_key = $2 and length_key = $3 and variation_key = $4
              order by position limit 1) as photo_path,
            coalesce((
              select pna.available from product_nail_availability pna
              where pna.product_id = p.id and pna.shape_key = $2 and pna.length_key = $3
                and pna.size = $5 and pna.variation_key = $4
            ), false) as offered
     from products p
     left join shapes s on s.key = $2
     left join shape_lengths sl on sl.shape_key = $2 and sl.length_key = $3
     left join variation_options vo
       on vo.axis_key = p.variation_axis_key and vo.option_key = $4 and $4 <> ''
     where p.id = $1
       and p.product_type = 'nail_single'
       and (p.audience = 'public' or ($6::uuid is not null and exists (
         select 1 from product_user_library_users pulu
         where pulu.product_id = p.id and pulu.user_id = $6
       )))`,
    [nail.productId, nail.shapeKey, nail.lengthKey, nail.variationKey, size, userId],
  );
  return rows[0];
}

/** Stores one product request per nail that is not offered in `size`, and
 * returns the lines for the single summary email. */
export async function recordCompositionSizeRequest(
  pool: Pool,
  input: CompositionSizeRequestInput,
): Promise<
  { ok: true; nails: CompositionSizeRequestNailLine[] } | { ok: false; code: 'not_found' | 'invalid_request' }
> {
  const lines: CompositionSizeRequestNailLine[] = [];
  for (const nail of input.nails) {
    const row = await loadNail(pool, nail, input.size, input.userId);
    if (!row) return { ok: false, code: 'not_found' };
    const shapeLabel = row.shape_label ? localize(row.shape_label, 'fr') : nail.shapeKey;
    const lengthLabel = row.length_label ? localize(row.length_label, 'fr') : nail.lengthKey;
    const variationLabel = row.variation_title ? localize(row.variation_title, 'fr') : null;
    const fingerLabel = FINGER_FR[nail.finger] ?? nail.finger;
    const title = localize(row.title, 'fr');
    let publicId: string | null = null;
    if (!row.offered) {
      const prefix = `Set sur mesure, taille ${input.size}, doigt: ${fingerLabel}.`;
      const combined = [prefix, input.comment].filter(Boolean).join(' ');
      const note = combined.length <= config.fieldLimits.productRequestCommentMax ? combined : prefix;
      const stored = await insertProductRequest(pool, {
        userId: input.userId,
        email: input.email,
        productId: nail.productId,
        productUid: row.product_uid,
        titleFr: title,
        shapeKey: nail.shapeKey,
        shapeLabelFr: shapeLabel,
        lengthKey: nail.lengthKey,
        size: input.size,
        quantity: input.quantity,
        unitPrice: Number(row.price ?? 0),
        photoPath: row.photo_path,
        comment: note,
        language: input.language,
      });
      publicId = stored.publicId;
    }
    lines.push({
      productUid: row.product_uid,
      title,
      shapeLabel,
      lengthLabel,
      variationLabel,
      fingerLabel,
      offered: row.offered,
      publicId,
    });
  }
  if (!lines.some((line) => !line.offered)) return { ok: false, code: 'invalid_request' };
  return { ok: true, nails: lines };
}
