import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('Roles permission groups', () => {
  it('use the theme Separator full-bleed under each title group', () => {
    const page = readFileSync(resolve(here, '../../../src/routes/AdminRolesPage.tsx'), 'utf8');
    expect(page).toMatch(/import \{ Separator \} from '\.\.\/components\/ui\/Separator'/);
    expect(page).toMatch(/<h2 className=\{styles\.matrixGroupLabel\}>\{group\.label\}<\/h2>\s*<Separator \/>/);
    expect(page).not.toMatch(/localeSeparator/);
  });
});
