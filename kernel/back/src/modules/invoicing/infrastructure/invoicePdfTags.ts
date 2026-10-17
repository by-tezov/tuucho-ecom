import type PDFDocument from 'pdfkit';

type InvoiceDocument = InstanceType<typeof PDFDocument>;
type StructElement = ReturnType<InvoiceDocument['struct']>;
type StructOptions = NonNullable<Parameters<InvoiceDocument['struct']>[1]>;
/** pdfkit's own table writer sets cell attributes (Scope, ColSpan) on this
 * dictionary; its typings leave the property out. */
type WithAttributes = { dictionary: { data: { A?: Record<string, unknown> } } };

/** Columns of the item table, for the cells that span a whole row. */
const TABLE_COLUMNS = 4;

export interface InvoiceTags {
  /** One heading or paragraph, appended in reading order. */
  block(type: 'H1' | 'H2' | 'P', draw: () => void): void;
  /** Decoration and repeated page furniture, kept out of the reading order. */
  artifact(draw: () => void, type?: 'Layout' | 'Pagination'): void;
  /** The item table's column headers; `expanded` spells out an abbreviation. */
  headerRow(cells: ReadonlyArray<{ draw: () => void; expanded?: string }>): void;
  /** One item table row, one drawer per column. */
  row(cells: ReadonlyArray<() => void>): void;
  /** One item table row whose single cell spans every column. */
  wideRow(draw: () => void): void;
  /** One row of the totals table: the label heads its amount. */
  pairRow(label: () => void, value: () => void): void;
}

/**
 * Opens the invoice as a tagged PDF (RGAA 13.3): French, titled, its
 * headings, paragraphs, item table and totals table in reading order, its
 * decoration and page furniture marked as artifacts that a screen reader
 * skips.
 *
 * Every drawer runs at once inside its own marked content. A page break
 * (ensureSpace) must fall between two drawers, never inside one, and no
 * artifact may start inside a drawer: pdfkit closes the open marked content
 * when an artifact begins.
 */
export async function openTaggedInvoice(title: string): Promise<{ doc: InvoiceDocument; tags: InvoiceTags }> {
  // Loaded here rather than at server start: pdfkit cost ~0.46s of every
  // cold start on the LWS host, for a document few requests ever build.
  const { default: PDFDocumentClass } = await import('pdfkit');
  const doc = new PDFDocumentClass({
    size: 'A4',
    margin: 50,
    bufferPages: true,
    pdfVersion: '1.7',
    tagged: true,
    lang: 'fr-FR',
    displayTitle: true,
    info: { Title: title, Author: 'Shop' },
  });
  const root = doc.struct('Document');
  doc.addStructure(root);
  let table: { kind: 'items' | 'totals'; element: StructElement } | null = null;

  function endTable(): void {
    table?.element.end();
    table = null;
  }

  function cell(
    type: 'TH' | 'TD',
    draw: () => void,
    attributes?: Record<string, unknown>,
    options: StructOptions = {},
  ): StructElement {
    const element = doc.struct(type, options, draw);
    // Before the cell joins its row: joining runs the drawer and writes the dictionary.
    if (attributes) (element as unknown as WithAttributes).dictionary.data.A = { O: 'Table', ...attributes };
    return element;
  }

  /** Appends a row, opening its table first when the previous row belonged
   * to the other table or a heading or paragraph came in between. */
  function addRow(kind: 'items' | 'totals', cells: StructElement[]): void {
    if (table?.kind !== kind) {
      endTable();
      table = { kind, element: doc.struct('Table') };
      root.add(table.element);
    }
    const row = doc.struct('TR');
    table.element.add(row);
    for (const element of cells) row.add(element);
    row.end();
  }

  const tags: InvoiceTags = {
    block(type, draw) {
      endTable();
      root.add(doc.struct(type, {}, draw));
    },
    artifact(draw, type = 'Layout') {
      doc.markContent('Artifact', { type });
      draw();
      doc.endMarkedContent();
    },
    headerRow(cells) {
      addRow(
        'items',
        cells.map(({ draw, expanded }) =>
          cell('TH', draw, { Scope: 'Column' }, expanded ? { expanded } : {}),
        ),
      );
    },
    row(cells) {
      addRow(
        'items',
        cells.map((draw) => cell('TD', draw)),
      );
    },
    wideRow(draw) {
      addRow('items', [cell('TD', draw, { ColSpan: TABLE_COLUMNS })]);
    },
    pairRow(label, value) {
      addRow('totals', [cell('TH', label, { Scope: 'Row' }), cell('TD', value)]);
    },
  };
  return { doc, tags };
}
