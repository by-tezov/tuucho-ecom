export type DocsTone = 'info' | 'warning' | 'important';

export type DocsBlock =
  | { type: 'p'; text: string }
  | { type: 'callout'; tone: DocsTone; title?: string; text: string }
  | { type: 'cards'; items: Array<{ title: string; text: string }> }
  | { type: 'steps'; items: string[] }
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'defs'; items: Array<{ term: string; description: string }> }
  | { type: 'code'; language: string; code: string; caption?: string };

export type DocsSection = {
  heading: string;
  blocks: DocsBlock[];
};

export function docsSectionId(heading: string, index: number): string {
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `docs-${index}-${slug || 'section'}`;
}

export function flattenDocsBlocks(blocks: DocsBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'p':
          return block.text;
        case 'callout':
          return `${block.title ?? ''} ${block.text}`;
        case 'cards':
          return block.items.map((item) => `${item.title} ${item.text}`).join(' ');
        case 'steps':
        case 'list':
          return block.items.join(' ');
        case 'table':
          return `${block.columns.join(' ')} ${block.rows.map((row) => row.join(' ')).join(' ')}`;
        case 'defs':
          return block.items.map((item) => `${item.term} ${item.description}`).join(' ');
        case 'code':
          return `${block.caption ?? ''} ${block.language} ${block.code}`;
        default:
          return '';
      }
    })
    .join(' ');
}
