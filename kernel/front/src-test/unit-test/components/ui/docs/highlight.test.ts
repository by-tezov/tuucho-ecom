import { describe, expect, it } from 'vitest';
import { highlightCode } from '@/components/ui/docs/highlight';

describe('highlightCode', () => {
  it('colours TypeScript keywords, strings, and comments', () => {
    const tokens = highlightCode("import { x } from 'sdk'; // done", 'ts');
    const kinds = tokens.map((token) => token.kind);
    expect(kinds).toContain('keyword');
    expect(kinds).toContain('string');
    expect(kinds).toContain('comment');
  });

  it('marks JSON keys separately from string values', () => {
    const tokens = highlightCode('{"id": "tuucho-seo-sitemap"}', 'json');
    expect(tokens.some((token) => token.kind === 'name' && token.text === '"id"')).toBe(true);
    expect(tokens.some((token) => token.kind === 'string' && token.text.includes('tuucho'))).toBe(true);
  });
});
