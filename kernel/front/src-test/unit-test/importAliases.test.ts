import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { kernelBackSrc, kernelFrontSrc, pluginSdkEntry, resolveCssComposeSpecifier } from '../../importAliases';

const here = dirname(fileURLToPath(import.meta.url));

describe('import aliases', () => {
  it('maps @kernel/front and @/ CSS composes onto kernel/front/src', () => {
    expect(resolveCssComposeSpecifier('/tmp/plugin.css', '@kernel/front/components/admin/AdminList.module.css')).toBe(
      resolve(kernelFrontSrc, 'components/admin/AdminList.module.css'),
    );
    expect(resolveCssComposeSpecifier('/tmp/plugin.css', '@/components/ui/Typography.module.css')).toBe(
      resolve(kernelFrontSrc, 'components/ui/Typography.module.css'),
    );
  });

  it('keeps relative CSS composes rooted at the importer', () => {
    const from = resolve(here, 'dummy.module.css');
    expect(resolveCssComposeSpecifier(from, './Local.module.css')).toBe(resolve(here, 'Local.module.css'));
  });

  it('leaves bare package specifiers to PostCSS', () => {
    expect(resolveCssComposeSpecifier('/tmp/plugin.css', 'some-lib/styles.css')).toBeNull();
  });

  it('points @kernel/back at kernel/back/src', () => {
    expect(kernelBackSrc.endsWith('kernel/back/src')).toBe(true);
  });

  it('points @tuucho/plugin-sdk at plugin-sdk/src/index.ts', () => {
    expect(pluginSdkEntry.endsWith('plugin-sdk/src/index.ts')).toBe(true);
  });
});
