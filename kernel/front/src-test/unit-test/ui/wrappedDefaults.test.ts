import { describe, expect, it } from 'vitest';
import { AccordionItem } from '@/components/ui/AccordionItem';
import { Button } from '@/components/ui/Button';
import { Separator } from '@/components/ui/Separator';
import { KERNEL_UI, resolveUiComponent } from '@/ui';

describe('wrapped kernel defaults', () => {
  it('registers Button and AccordionItem on import so existing call sites are overridable', () => {
    expect(Button.displayName).toBe('Ui(ui.Button)');
    expect(AccordionItem.displayName).toBe('Ui(ui.AccordionItem)');
    expect(Separator.displayName).toBe('Ui(ui.Separator)');
    expect(resolveUiComponent(KERNEL_UI.Button)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.AccordionItem)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.Separator)).toBeDefined();
  });
});
