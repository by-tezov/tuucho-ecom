export type HighlightKind = 'plain' | 'comment' | 'string' | 'keyword' | 'number' | 'name' | 'punct';

export type HighlightToken = { kind: HighlightKind; text: string };

const TS_KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'interface',
  'let',
  'new',
  'null',
  'of',
  'return',
  'satisfies',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
]);

const BASH_KEYWORDS = new Set(['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'in', 'echo', 'export', 'cd']);

function push(tokens: HighlightToken[], kind: HighlightKind, text: string) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) {
    last.text += text;
    return;
  }
  tokens.push({ kind, text });
}

function tokenizeTs(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let i = 0;
  while (i < code.length) {
    const two = code.slice(i, i + 2);
    if (two === '//') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      push(tokens, 'comment', code.slice(i, stop));
      i = stop;
      continue;
    }
    if (two === '/*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      push(tokens, 'comment', code.slice(i, stop));
      i = stop;
      continue;
    }
    const quote = code[i];
    if (quote === "'" || quote === '"' || quote === '`') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      push(tokens, 'string', code.slice(i, j));
      i = j;
      continue;
    }
    const rest = code.slice(i);
    const num = rest.match(/^\d+(?:\.\d+)?/);
    if (num) {
      push(tokens, 'number', num[0]);
      i += num[0].length;
      continue;
    }
    const ident = rest.match(/^[A-Za-z_$][\w$]*/);
    if (ident) {
      push(tokens, TS_KEYWORDS.has(ident[0]) ? 'keyword' : 'plain', ident[0]);
      i += ident[0].length;
      continue;
    }
    const ws = rest.match(/^\s+/);
    if (ws) {
      push(tokens, 'plain', ws[0]);
      i += ws[0].length;
      continue;
    }
    push(tokens, 'punct', code[i] ?? '');
    i += 1;
  }
  return tokens;
}

function tokenizeJson(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i] ?? '';
    if (ch === '"') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      let k = j;
      while (k < code.length && /\s/.test(code[k] ?? '')) k += 1;
      const isKey = code[k] === ':';
      push(tokens, isKey ? 'name' : 'string', code.slice(i, j));
      i = j;
      continue;
    }
    const rest = code.slice(i);
    const num = rest.match(/^-?\d+(?:\.\d+)?/);
    if (num) {
      push(tokens, 'number', num[0]);
      i += num[0].length;
      continue;
    }
    const word = rest.match(/^(true|false|null)/);
    if (word) {
      push(tokens, 'keyword', word[0]);
      i += word[0].length;
      continue;
    }
    const ws = rest.match(/^\s+/);
    if (ws) {
      push(tokens, 'plain', ws[0]);
      i += ws[0].length;
      continue;
    }
    push(tokens, 'punct', ch);
    i += 1;
  }
  return tokens;
}

function tokenizeBash(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let i = 0;
  while (i < code.length) {
    if (code[i] === '#') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      push(tokens, 'comment', code.slice(i, stop));
      i = stop;
      continue;
    }
    const quote = code[i];
    if (quote === "'" || quote === '"') {
      let j = i + 1;
      while (j < code.length && code[j] !== quote) j += 1;
      push(tokens, 'string', code.slice(i, Math.min(j + 1, code.length)));
      i = Math.min(j + 1, code.length);
      continue;
    }
    const rest = code.slice(i);
    const ident = rest.match(/^[A-Za-z_][\w-]*/);
    if (ident) {
      push(tokens, BASH_KEYWORDS.has(ident[0]) ? 'keyword' : 'plain', ident[0]);
      i += ident[0].length;
      continue;
    }
    const ws = rest.match(/^\s+/);
    if (ws) {
      push(tokens, 'plain', ws[0]);
      i += ws[0].length;
      continue;
    }
    push(tokens, 'punct', code[i] ?? '');
    i += 1;
  }
  return tokens;
}

export function highlightCode(code: string, language: string): HighlightToken[] {
  const lang = language.trim().toLowerCase();
  if (lang === 'json') return tokenizeJson(code);
  if (lang === 'bash' || lang === 'sh' || lang === 'shell') return tokenizeBash(code);
  if (lang === 'ts' || lang === 'tsx' || lang === 'js' || lang === 'javascript' || lang === 'typescript') {
    return tokenizeTs(code);
  }
  return [{ kind: 'plain', text: code }];
}
