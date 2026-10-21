import { describe, expect, it } from 'vitest';
import { AccordionItem } from '@/components/ui/AccordionItem';
import { AdminAttentionCard } from '@/components/ui/AdminAttentionCard';
import { AdminStatCard } from '@/components/ui/AdminStatCard';
import { Button } from '@/components/ui/Button';
import { ColorField } from '@/components/ui/ColorField';
import { Field } from '@/components/ui/Field';
import { FileField } from '@/components/ui/FileField';
import { FormSection } from '@/components/ui/FormSection';
import { SecretField } from '@/components/ui/SecretField';
import { SelectField } from '@/components/ui/SelectField';
import { Separator } from '@/components/ui/Separator';
import { SocialSignInRow } from '@/components/ui/SocialSignInRow';
import { TextareaField } from '@/components/ui/TextareaField';
import { TextField } from '@/components/ui/TextField';
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

  it('registers form field kit so Configure and plugins reuse them', () => {
    expect(Field.displayName).toBe('Ui(ui.Field)');
    expect(FormSection.displayName).toBe('Ui(ui.FormSection)');
    expect(TextField.displayName).toBe('Ui(ui.TextField)');
    expect(TextareaField.displayName).toBe('Ui(ui.TextareaField)');
    expect(SecretField.displayName).toBe('Ui(ui.SecretField)');
    expect(SelectField.displayName).toBe('Ui(ui.SelectField)');
    expect(ColorField.displayName).toBe('Ui(ui.ColorField)');
    expect(FileField.displayName).toBe('Ui(ui.FileField)');
    expect(SocialSignInRow.displayName).toBe('Ui(ui.SocialSignInRow)');
    expect(AdminStatCard.displayName).toBe('Ui(ui.AdminStatCard)');
    expect(AdminAttentionCard.displayName).toBe('Ui(ui.AdminAttentionCard)');
    expect(resolveUiComponent(KERNEL_UI.Field)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.FormSection)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.TextField)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.TextareaField)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.SecretField)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.SelectField)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.ColorField)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.FileField)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.SocialSignInRow)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.AdminStatCard)).toBeDefined();
    expect(resolveUiComponent(KERNEL_UI.AdminAttentionCard)).toBeDefined();
  });
});
