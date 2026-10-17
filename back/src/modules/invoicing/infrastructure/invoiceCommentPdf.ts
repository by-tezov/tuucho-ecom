import type PDFDocument from 'pdfkit';

/** The customer note typed on the cart card, under the item block's size
 * rows and across the whole table width. */
export function drawItemComment(
  doc: InstanceType<typeof PDFDocument>,
  comment: string,
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
  const text = `Commentaire : ${comment}`;
  const x = layout.x + 8;
  const width = layout.right - x;
  doc.font('Helvetica-Oblique').fontSize(8.5);
  const height = doc.heightOfString(text, { width, lineGap: 1 });
  layout.ensureSpace(height + 6);
  const y = doc.y + 2;
  layout.wideRow(() => {
    doc.fillColor(layout.muted).text(text, x, y, { width, lineGap: 1 });
  });
  doc.y = y + height + 4;
  doc.font('Helvetica').fontSize(9).fillColor(layout.ink);
}
