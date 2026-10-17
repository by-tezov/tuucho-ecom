import type PDFDocument from 'pdfkit';
import type { InvoiceData } from './invoiceDocument.js';
import { KERNEL_INVOICE_COPY } from './invoiceDocument.js';
import type { InvoiceTags } from './invoicePdfTags.js';

function formatDate(date: Date, dateLocale: string): string {
  return new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
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
  const copy = data.copy ?? KERNEL_INVOICE_COPY;
  const { ink, muted, label, gold, cream } = layout.colors;
  const width = layout.right - 50;
  tags.artifact(() => {
    doc.rect(0, 0, doc.page.width, layout.bandHeight).fill(cream);
    doc.rect(0, layout.bandHeight, doc.page.width, 3).fill(gold);
  });

  // The tagline's spacing comes from characterSpacing, not from spaces
  // between its letters, so it is read as two words.
  tags.block('P', () => {
    doc.fillColor(ink).font('Times-Bold').fontSize(26).text('Shop', 50, 34);
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor(label)
      .text('ATELIER', 50, 64, { characterSpacing: 4.2 });
  });

  tags.block('H1', () => {
    doc.fontSize(17).font('Times-Bold').fillColor(ink).text(copy.heading, 50, 30, { width, align: 'right' });
  });
  tags.block('P', () => {
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(muted)
      .text(copy.number(data.invoiceNumber), 50, 52, { width, align: 'right' })
      .text(copy.date(formatDate(data.orderDate, copy.dateLocale)), 50, 65, { width, align: 'right' })
      .text(copy.order(data.orderNumber), 50, 78, { width, align: 'right' });
  });
  const gift = data.gift;
  if (gift) {
    tags.block('P', () => {
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(label)
        .text(copy.giftOrder, 50, data.integrityToken ? 104 : 91, { width, align: 'right' });
      const giftBits = [
        copy.giftedBy(gift.giverDisplayName, gift.receiverName),
        gift.maxSets != null ? copy.maxSets(gift.maxSets) : null,
        gift.maxBudget != null ? copy.budget(gift.maxBudget.toFixed(2) + ' €') : null,
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
      doc.text(copy.integrity(integrityToken), 50, 91, { width, align: 'right' });
    });
  }
}
