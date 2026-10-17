import type PDFDocument from 'pdfkit';
import { FINGER_LABELS_FR, type InvoiceItem } from './invoiceDocument.js';

type Nail = NonNullable<InvoiceItem['nails']>[number];

/** Same reading order as the shop's composer and cart: left hand pinky to
 * thumb, then right hand thumb to pinky. */
const HANDS = [
  { label: 'Main gauche', fingers: ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-thumb'] },
  {
    label: 'Main droite',
    fingers: ['right-thumb', 'right-index', 'right-middle', 'right-ring', 'right-pinky'],
  },
];

const FINGER_WIDTH = 100;
const REF_WIDTH = 90;
const GAP = 10;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A composed set's nails on the invoice, under its size row and across the
 * whole table width (the quantity and price columns have nothing to show per
 * nail). Per hand, one row per nail, read like a sentence:
 *
 *   Auriculaire gauche   Rose poudré                           Réf. NL-AA-001
 *                        Amande · Medium · Couleur : Rose
 *
 * Each row advances by its own measured height, so a long name wraps inside
 * its column and never runs into the next row.
 */
export function drawCompositionHands(
  doc: InstanceType<typeof PDFDocument>,
  nails: Nail[],
  layout: {
    x: number;
    right: number;
    ink: string;
    muted: string;
    ensureSpace: (height: number) => void;
    /** One tagged table row across the whole width (invoicePdfTags.ts). */
    wideRow: (draw: () => void) => void;
  },
): void {
  const byFinger = new Map(nails.map((nail) => [nail.finger, nail]));
  const fingerX = layout.x + 8;
  const nameX = fingerX + FINGER_WIDTH + GAP;
  const refX = layout.right - REF_WIDTH;
  const nameWidth = refX - GAP - nameX;
  for (const hand of HANDS) {
    const handNails = hand.fingers.flatMap((finger) => byFinger.get(finger) ?? []);
    if (handNails.length === 0) continue;
    layout.ensureSpace(16);
    doc.y += 2;
    layout.wideRow(() => {
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(layout.muted)
        .text(hand.label.toUpperCase(), fingerX, doc.y, {
          width: layout.right - fingerX,
          characterSpacing: 0.4,
        });
    });
    doc.y += 3;
    for (const nail of handNails) {
      const finger = capitalize(FINGER_LABELS_FR[nail.finger] ?? nail.finger);
      const details = [nail.shapeLabel, nail.lengthLabel, nail.variationLabel]
        .filter(Boolean)
        .map((part) => capitalize(part!))
        .join(' · ');
      doc.font('Helvetica-Bold').fontSize(8.5);
      const nameHeight = doc.heightOfString(nail.title, { width: nameWidth });
      doc.font('Helvetica').fontSize(8);
      const detailsHeight = details ? doc.heightOfString(details, { width: nameWidth }) : 0;
      const fingerHeight = doc.heightOfString(finger, { width: FINGER_WIDTH });
      const height = Math.max(fingerHeight, nameHeight + detailsHeight) + 6;
      layout.ensureSpace(height);
      const y = doc.y;
      layout.wideRow(() => {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(layout.ink)
          .text(finger, fingerX, y, { width: FINGER_WIDTH });
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor(layout.ink)
          .text(nail.title, nameX, y, { width: nameWidth });
        if (details) {
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor(layout.muted)
            .text(details, nameX, y + nameHeight, { width: nameWidth });
        }
        if (nail.productUid) {
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor(layout.muted)
            .text(`Réf. ${nail.productUid}`, refX, y, { width: REF_WIDTH, align: 'right' });
        }
      });
      doc.y = y + height;
    }
  }
}
