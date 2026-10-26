import { createWriteStream } from 'node:fs';
import { peekStoreIdentity } from '../../plugins/application/storeSettings.js';
import { groupOrderDisplayLines } from '../../../utils/groupOrderDisplayLines.js';
import { drawCustomSetHands } from './invoiceCustomSetPdf.js';
import { drawItemComment } from './invoiceCommentPdf.js';
import { drawInvoiceHeader } from './invoiceHeaderPdf.js';
import { openTaggedInvoice } from './invoicePdfTags.js';
import { type InvoiceData, type InvoiceItem } from './invoiceDocument.js';

export type { InvoiceData, InvoiceItem };

// Same palette as templates/emails' header/footer partials — kept in sync by
// eye (PDFKit can't share CSS with Handlebars) so the emailed PDF looks like
// it belongs to the same brand as the email that delivered it.
const INK = '#1a1a1a';
const MUTED = '#5c5c5c';
const LABEL = '#121212';
const GOLD = '#121212';
const CREAM = '#f6f6f6';
const RULE = '#e1e1e1';

function money(value: number): string {
  return `${value.toFixed(2)} €`;
}

const COLUMNS = {
  description: { x: 50, width: 260 },
  quantity: { x: 320, width: 50 },
  unitPrice: { x: 380, width: 75 },
  lineTotal: { x: 465, width: 80 },
};
const ROW_HEIGHT = 20;
const HEADER_ROW_HEIGHT = 24;
const HEADER_BAND_HEIGHT = 108;

/** No HTML/browser involved — PDFKit draws the PDF directly (text/rects at
 * explicit positions), which is what makes this viable on LWS shared
 * hosting with no SSH (no Chromium/Puppeteer dependency, see
 * project_lws_hosting_deploy memory). Writes straight to `absolutePath`
 * (PRIVATE_MEDIA_DIR/invoice/<file>.pdf — the caller creates the directory
 * first) rather than returning bytes, since generated files never pass
 * through this app's memory as a whole Buffer nor get stored in Postgres —
 * see invoices.service.ts. The PDF is tagged: every drawing below runs inside
 * a `tags` drawer (invoicePdfTags.ts). */
export async function writeInvoicePdf(absolutePath: string, data: InvoiceData): Promise<void> {
  const copy = data.copy;
  const { doc, tags } = await openTaggedInvoice(copy.documentTitle(data.invoiceNumber));
  const stream = createWriteStream(absolutePath);
  const finished = new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
  });
  doc.pipe(stream);

  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const contentRight = doc.page.width - doc.page.margins.right;

  function ensureSpace(height: number): void {
    if (doc.y + height > pageBottom) doc.addPage();
  }

  drawInvoiceHeader(doc, tags, data, {
    right: contentRight,
    bandHeight: HEADER_BAND_HEIGHT,
    colors: { ink: INK, muted: MUTED, label: LABEL, gold: GOLD, cream: CREAM },
  });

  function sectionLabel(text: string, x: number, y: number): void {
    tags.block('H2', () => {
      doc
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .fillColor(LABEL)
        .text(text.toUpperCase(), x, y, { characterSpacing: 0.6 });
    });
  }

  /** The lines of an identity or address block, under its section label. */
  function addressBlock(lines: Array<string | null | undefined>, x: number, y: number, width: number): void {
    tags.block('P', () => {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(MUTED)
        .text(lines.filter(Boolean).join('\n'), x, y, { width, lineGap: 1 });
    });
  }

  /** "Cut line" divider above the nail set / accessory / gift blocks of the
   * item table — a gold rule, the centered label, the rule continuing —
   * same idea as the front-end order history / confirmation email's own
   * section headers, drawn imperatively since pdfkit has no CSS flex. */
  function drawItemSectionDivider(label: string): void {
    ensureSpace(24);
    const text = label.toUpperCase();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(LABEL);
    const textWidth = doc.widthOfString(text, { characterSpacing: 0.6 });
    const totalWidth = contentRight - 50;
    const gap = 10;
    const lineWidth = Math.max(0, (totalWidth - textWidth - gap * 2) / 2);
    const y = doc.y + 6;
    const lineY = y + 4;
    tags.artifact(() => {
      doc
        .moveTo(50, lineY)
        .lineTo(50 + lineWidth, lineY)
        .strokeColor(GOLD)
        .lineWidth(0.75)
        .stroke();
      doc
        .moveTo(50 + lineWidth + gap + textWidth + gap, lineY)
        .lineTo(contentRight, lineY)
        .strokeColor(GOLD)
        .lineWidth(0.75)
        .stroke();
    });
    tags.wideRow(() => {
      doc.text(text, 50 + lineWidth + gap, y, { characterSpacing: 0.6, lineBreak: false });
    });
    doc.y = y + 16;
  }

  // --- Seller / billing blocks ---
  const blockTop = HEADER_BAND_HEIGHT + 32;
  sectionLabel(copy.seller, 50, blockTop);
  addressBlock(
    [
      peekStoreIdentity().name,
      peekStoreIdentity().legalStatus,
      copy.siren(peekStoreIdentity().legalSiren),
      peekStoreIdentity().legalAddress,
      peekStoreIdentity().vatMention,
      peekStoreIdentity().phone,
      peekStoreIdentity().contactEmail,
    ],
    50,
    blockTop + 15,
    250,
  );

  sectionLabel(copy.billedTo, 320, blockTop);
  addressBlock(
    [
      data.billingCompanyName,
      data.billingRecipientName,
      data.billingLine1,
      data.billingLine2,
      `${data.billingPostalCode} ${data.billingCity}`,
      data.billingCountryCode,
    ],
    320,
    blockTop + 15,
    225,
  );

  // Always shown alongside the billing block, even when it's the exact
  // same address — the customer's own /account/orders page only shows a
  // second block once the two diverge, but an invoice is a fixed document
  // and states both explicitly.
  const deliveryTop = blockTop + 102;
  sectionLabel(copy.shippedTo, 50, deliveryTop);
  addressBlock(
    [
      data.companyName,
      data.recipientName,
      data.line1,
      data.line2,
      `${data.postalCode} ${data.city}`,
      data.countryCode,
    ],
    50,
    deliveryTop + 15,
    250,
  );

  doc.y = deliveryTop + 92;

  // --- Item table --- The first header row is the table's own; its copies
  // at the top of later pages are page furniture.
  let headerTagged = false;
  function drawTableHeader(): void {
    const y = doc.y;
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(LABEL);
    const headers = [
      [copy.article, COLUMNS.description, 'left', undefined],
      [copy.qty, COLUMNS.quantity, 'right', copy.qtyExpanded],
      [copy.unitPrice, COLUMNS.unitPrice, 'right', copy.unitPriceExpanded],
      [copy.lineTotal, COLUMNS.lineTotal, 'right', undefined],
    ] as const;
    const cells = headers.map(([text, column, align, expanded]) => ({
      expanded,
      draw: () => doc.text(text, column.x, y, { width: column.width, align, characterSpacing: 0.4 }),
    }));
    if (headerTagged) tags.artifact(() => cells.forEach((cell) => cell.draw()), 'Pagination');
    else tags.headerRow(cells);
    headerTagged = true;
    tags.artifact(() => {
      doc
        .moveTo(50, y + HEADER_ROW_HEIGHT - 6)
        .lineTo(contentRight, y + HEADER_ROW_HEIGHT - 6)
        .strokeColor(GOLD)
        .lineWidth(1)
        .stroke();
    });
    doc.y = y + HEADER_ROW_HEIGHT;
  }

  ensureSpace(HEADER_ROW_HEIGHT + ROW_HEIGHT);
  drawTableHeader();

  const itemLayout = {
    x: COLUMNS.description.x,
    right: contentRight,
    ink: INK,
    muted: MUTED,
    copy,
    ensureSpace,
    wideRow: (draw: () => void) => tags.wideRow(draw),
  };
  const itemGroups = groupOrderDisplayLines(data.items);
  for (const group of itemGroups) {
    if (group.sectionStart) drawItemSectionDivider(copy.itemSections[group.section] ?? group.section);

    const blockHeight = ROW_HEIGHT + group.sizes.length * ROW_HEIGHT + (group.productUid ? 14 : 4);
    ensureSpace(blockHeight);
    if (doc.y === doc.page.margins.top) drawTableHeader();

    const titleY = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
    const variantLabel =
      group.section === 'customSet'
        ? `${group.nails.length} ${group.nails.length > 1 ? copy.pieces : copy.piece}`
        : group.shapeKey
          ? [group.shapeLabel, group.lengthLabel].filter(Boolean).join(' · ')
          : group.packLabel;
    tags.wideRow(() => {
      doc.text(
        variantLabel ? `${group.title} (${variantLabel})` : group.title,
        COLUMNS.description.x,
        titleY,
        {
          width: COLUMNS.description.width,
        },
      );
    });
    doc.y = titleY + ROW_HEIGHT;

    doc.font('Helvetica').fontSize(9).fillColor(INK);
    for (const line of group.sizes) {
      ensureSpace(ROW_HEIGHT);
      if (doc.y === doc.page.margins.top) drawTableHeader();
      const y = doc.y;
      const sizeLabel =
        group.section === 'customSet' || group.shapeKey ? copy.size(line.size) : copy.quantity;
      const unitText = group.isGift ? copy.free : money(line.unitPrice);
      const totalText = group.isGift ? copy.free : money(line.lineTotal);
      const amountColor = group.isGift ? '#3f7a56' : INK;
      const { description, quantity, unitPrice, lineTotal } = COLUMNS;
      tags.row([
        () => doc.fillColor(MUTED).text(sizeLabel, description.x + 8, y, { width: description.width - 8 }),
        () =>
          doc
            .fillColor(INK)
            .text(String(line.quantity), quantity.x, y, { width: quantity.width, align: 'right' }),
        () =>
          doc
            .fillColor(amountColor)
            .text(unitText, unitPrice.x, y, { width: unitPrice.width, align: 'right' }),
        () => doc.text(totalText, lineTotal.x, y, { width: lineTotal.width, align: 'right' }),
      ]);
      doc.y = y + ROW_HEIGHT;
    }

    if (group.section === 'customSet') drawCustomSetHands(doc, group.nails, itemLayout);
    if (group.comment) drawItemComment(doc, group.comment, itemLayout);

    if (group.productUid) {
      ensureSpace(14);
      const y = doc.y;
      const productUid = group.productUid;
      tags.wideRow(() => {
        doc
          .fontSize(8)
          .fillColor(MUTED)
          .text(copy.ref(productUid), COLUMNS.description.x, y, {
            width: contentRight - COLUMNS.description.x,
            align: 'right',
          });
      });
      doc.y = y + 14;
      doc.fillColor(INK).fontSize(9);
    } else {
      doc.y += 4;
    }
  }

  tags.artifact(() => {
    doc
      .moveTo(50, doc.y + 4)
      .lineTo(contentRight, doc.y + 4)
      .strokeColor(RULE)
      .lineWidth(1)
      .stroke();
  });
  doc.y += 12;

  // --- Totals (right) + Paiement (left), same baseline. The totals come
  // first in the reading order, right after the items they add up. ---
  ensureSpace(ROW_HEIGHT * 6);
  const summaryTop = doc.y;
  const totalsLeft = COLUMNS.unitPrice.x - 70;
  const paymentWidth = totalsLeft - 50 - 16;

  function totalLine(label: string, value: string, y: number, bold = false): number {
    doc
      .font(bold ? 'Times-Bold' : 'Helvetica')
      .fontSize(bold ? 13 : 9.5)
      .fillColor(bold ? INK : MUTED);
    tags.pairRow(
      () => doc.text(label, totalsLeft, y, { width: 145, align: 'left' }),
      () =>
        doc
          .fillColor(INK)
          .text(value, COLUMNS.lineTotal.x, y, { width: COLUMNS.lineTotal.width, align: 'right' }),
    );
    return y + (bold ? 22 : 16);
  }

  let totalsY = summaryTop;
  totalsY = totalLine(copy.subtotal, money(data.subtotal), totalsY);
  const shippingLabel = data.courierName
    ? copy.shippingWith(data.courierName, data.express)
    : copy.shipping;
  const shippingValue =
    data.shippingFee === 0 && data.shippingListFee > 0
      ? copy.freeWas(money(data.shippingListFee))
      : money(data.shippingFee);
  totalsY = totalLine(shippingLabel, shippingValue, totalsY);
  if (data.rulesItemDiscount > 0) {
    totalsY = totalLine(copy.volumeDiscount, `-${money(data.rulesItemDiscount)}`, totalsY);
  }
  for (const line of data.extraLines ?? []) {
    const value = line.amount < 0 ? `-${money(Math.abs(line.amount))}` : money(line.amount);
    totalsY = totalLine(line.label, value, totalsY);
  }
  const ruleY = totalsY + 2;
  tags.artifact(() => {
    doc.moveTo(totalsLeft, ruleY).lineTo(contentRight, ruleY).strokeColor(GOLD).lineWidth(1.5).stroke();
  });
  totalsY += 10;
  totalsY = totalLine(copy.grandTotal, money(data.total), totalsY, true);

  const captureLabel =
    data.paymentCaptureStatus === 'authorized'
      ? copy.captureAuthorized
      : data.paymentCaptureStatus === 'captured'
        ? copy.captureCaptured
        : data.paymentCaptureStatus === 'not_required'
          ? copy.captureNotRequired
          : data.paymentCaptureStatus === 'expired'
            ? copy.captureExpired
            : copy.captureCanceled;

  let methodLine: string | null = null;
  if (data.paymentMethodType === 'paypal') {
    methodLine = 'PayPal';
  } else if (data.paymentMethodType === 'bancontact') {
    methodLine = 'Bancontact';
  } else if (data.paymentMethodType === 'free') {
    methodLine = copy.noneZeroTotal;
  } else if (data.paymentMethodType === 'card') {
    const brand = data.paymentCardBrand
      ? data.paymentCardBrand.charAt(0).toUpperCase() + data.paymentCardBrand.slice(1)
      : copy.card;
    methodLine = data.paymentCardLast4 ? `${brand} •••• ${data.paymentCardLast4}` : brand;
  }

  sectionLabel(copy.payment, 50, summaryTop);
  const paymentLines = [copy.status(captureLabel), methodLine ? copy.method(methodLine) : null];
  let paymentY = summaryTop + 15;
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
  for (const text of paymentLines) {
    if (!text) continue;
    const y = paymentY;
    tags.block('P', () => doc.text(text, 50, y, { width: paymentWidth }));
    paymentY += 14;
  }

  doc.y = Math.max(paymentY, totalsY) + 4;

  // --- Legal footer + brand mark + pagination, drawn last across every
  // buffered page (same treatment on every page, like a real letterhead). ---
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // The VAT mention already sits in the seller block: the footer only
    // carries the brand line, left, level with the page number.
    tags.artifact(() => {
      doc
        .fontSize(7.5)
        .font('Helvetica')
        .fillColor(LABEL)
        .text(copy.handmade, 50, pageBottom - 20, {
          width: contentRight - 50 - 60,
          align: 'left',
          characterSpacing: 0.3,
        });
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(MUTED)
        .text(copy.page(i + 1, range.count), contentRight - 60, pageBottom - 20, {
          width: 60,
          align: 'right',
        });
    }, 'Pagination');
  }

  doc.end();
  await finished;
}
