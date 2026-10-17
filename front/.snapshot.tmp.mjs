import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
const LANGS = ['fr', 'en', 'th', 'es', 'it', 'nl', 'pt'];
const out = {};
for (const lang of LANGS) {
  const f = `src/assets/i18n/strings.${lang}.ts`;
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
  let root;
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText() === lang && n.initializer) root = n.initializer;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const map = {};
  const walk = (obj, prefix) => {
    for (const p of obj.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const name = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText();
      const path = prefix ? `${prefix}.${name}` : name;
      const v = p.initializer;
      if (ts.isObjectLiteralExpression(v)) {
        walk(v, path);
        continue;
      }
      if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) {
        map[path] = v.text;
        continue;
      }
      if (ts.isArrayLiteralExpression(v)) {
        v.elements.forEach((el, i) => {
          if (ts.isObjectLiteralExpression(el)) walk(el, `${path}[${i}]`);
          else if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el))
            map[`${path}[${i}]`] = el.text;
          else map[`${path}[${i}]`] = el.getText(sf).replace(/\s+/g, ' ');
        });
        continue;
      }
      map[path] = v.getText(sf).replace(/\s+/g, ' ');
    }
  };
  walk(root, '');
  out[lang] = map;
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log('snapshot keys:', Object.keys(out.fr).length, 'x', LANGS.length, 'locales');
