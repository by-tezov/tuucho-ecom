import { afterEach, describe, expect, it } from 'vitest';
import type { StorefrontPlugin } from '@/plugins/types';
import { isUiName, KERNEL_UI } from '@/ui/names';
import {
  provideKernelUi,
  registerPluginUi,
  registerUiComponent,
  resetUiRegistry,
  resolveUiComponent,
  type UiComponent,
} from '@/ui/registry';

const Default = (() => null) as UiComponent;
const ThemeBtn = (() => null) as UiComponent;
const LookBtn = (() => null) as UiComponent;
const Stars = (() => null) as UiComponent;
const OtherStars = (() => null) as UiComponent;

function plugin(partial: Partial<StorefrontPlugin> & Pick<StorefrontPlugin, 'id' | 'kind'>): StorefrontPlugin {
  return {
    enabled: true,
    required: false,
    name: partial.id,
    ...partial,
  };
}

afterEach(() => {
  resetUiRegistry();
});

describe('isUiName', () => {
  it('accepts ui.PascalCase only', () => {
    expect(isUiName('ui.Button')).toBe(true);
    expect(isUiName('ui.StarRating')).toBe(true);
    expect(isUiName('Button')).toBe(false);
    expect(isUiName('ui.button')).toBe(false);
    expect(isUiName('slot.home.faq')).toBe(false);
  });
});

describe('resolveUiComponent', () => {
  it('returns the kernel default when no plugin contributes', () => {
    provideKernelUi(KERNEL_UI.Button, Default);
    expect(resolveUiComponent(KERNEL_UI.Button)).toBe(Default);
  });

  it('lets a plugin extend a new name', () => {
    registerUiComponent('ui.StarRating', Stars, { pluginId: 'ratings' });
    const plugins = [plugin({ id: 'ratings', kind: 'commerce' })];
    expect(resolveUiComponent('ui.StarRating', plugins)).toBe(Stars);
  });

  it('does not let extend occupy a kernel name', () => {
    provideKernelUi(KERNEL_UI.Button, Default);
    registerUiComponent(KERNEL_UI.Button, LookBtn, { pluginId: 'look' });
    expect(resolveUiComponent(KERNEL_UI.Button, [plugin({ id: 'look', kind: 'generic' })])).toBe(Default);
  });

  it('applies replace while the plugin is enabled', () => {
    provideKernelUi(KERNEL_UI.Button, Default);
    registerUiComponent(KERNEL_UI.Button, LookBtn, { pluginId: 'look', replace: true });
    expect(resolveUiComponent(KERNEL_UI.Button, [plugin({ id: 'look', kind: 'generic' })])).toBe(LookBtn);
    expect(
      resolveUiComponent(KERNEL_UI.Button, [plugin({ id: 'look', kind: 'generic', enabled: false })]),
    ).toBe(Default);
  });

  it('lets an enabled theme replace win over a generic replace', () => {
    provideKernelUi(KERNEL_UI.Button, Default);
    registerUiComponent(KERNEL_UI.Button, LookBtn, { pluginId: 'look', replace: true });
    registerUiComponent(KERNEL_UI.Button, ThemeBtn, { pluginId: 'theme', replace: true });
    const plugins = [plugin({ id: 'look', kind: 'generic' }), plugin({ id: 'theme', kind: 'theme' })];
    expect(resolveUiComponent(KERNEL_UI.Button, plugins)).toBe(ThemeBtn);
  });

  it('registers pluginFront.ui batches and last enabled extend wins', () => {
    registerPluginUi('one', [{ name: 'ui.StarRating', component: Stars }]);
    registerPluginUi('two', [{ name: 'ui.StarRating', component: OtherStars }]);
    const plugins = [plugin({ id: 'one', kind: 'commerce' }), plugin({ id: 'two', kind: 'commerce' })];
    expect(resolveUiComponent('ui.StarRating', plugins)).toBe(OtherStars);
  });

  it('ignores invalid names', () => {
    registerUiComponent('nope', Stars, { pluginId: 'ratings' });
    expect(resolveUiComponent('nope', [plugin({ id: 'ratings', kind: 'commerce' })])).toBeUndefined();
  });
});
