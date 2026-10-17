import type PDFDocument from 'pdfkit';
import type { InvoiceData } from './invoiceDocument.js';
import type { InvoiceTags } from './invoicePdfTags.js';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/** The invoice's header band: brand mark (left), invoice identity (right). */
export function drawInvoiceHeader(
  doc: InstanceType<typeof PDFDocument>,
  tags: InvoiceTags,
  data: InvoiceData,
  layout: {
    right: number;
    bandHeight: number;
    colors: { ink: string; muted: string; label: string; gold: string; cream: string };
  },
): void {
  const { ink, muted, label, gold, cream } = layout.colors;
  const width = layout.right - 50;
  tags.artifact(() => {
    doc.rect(0, 0, doc.page.width, layout.bandHeight).fill(cream);
    doc.rect(0, layout.bandHeight, doc.page.width, 3).fill(gold);
  });

  // The tagline's spacing comes from characterSpacing, not from spaces
  // between its letters, so it is read as two words.
  tags.block('P', () => {
    doc.fillColor(ink).font('Times-Bold').fontSize(26).text('Lumen', 50, 34);
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor(label)
      .text('ATELIER', 50, 64, { characterSpacing: 4.2 });
  });

  tags.block('H1', () => {
    doc.fontSize(17).font('Times-Bold').fillColor(ink).text('FACTURE', 50, 30, { width, align: 'right' });
  });
  tags.block('P', () => {
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(muted)
      .text(`N° ${data.invoiceNumber}`, 50, 52, { width, align: 'right' })
      .text(`Date : ${formatDate(data.orderDate)}`, 50, 65, { width, align: 'right' })
      .text(`Commande : ${data.orderNumber}`, 50, 78, { width, align: 'right' });
  });
  const gift = data.gift;
  if (gift) {
    tags.block('P', () => {
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(label)
        .text('Commande cadeau', 50, data.integrityToken ? 104 : 91, { width, align: 'right' });
      const giftBits = [
        `Offert par ${gift.giverDisplayName} pour ${gift.receiverName}`,
        gift.maxSets != null ? `max ${gift.maxSets} set${gift.maxSets > 1 ? 's' : ''}` : null,
        gift.maxBudget != null ? `budget ${gift.maxBudget.toFixed(2)} €` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(muted)
        .text(giftBits, 50, data.integrityToken ? 117 : 104, { width, align: 'right' });
    });
  }
  const integrityToken = data.integrityToken;
  if (integrityToken) {
    tags.block('P', () => {
      doc.text(`Intégrité : ${integrityToken}`, 50, 91, { width, align: 'right' });
    });
  }
}
