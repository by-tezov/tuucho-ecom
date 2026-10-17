/** Stable ids for kernel UI primitives plugins may use, add, or replace. */
export const KERNEL_UI = {
  Button: 'ui.Button',
  ConfirmModal: 'ui.ConfirmModal',
  LoadingModal: 'ui.LoadingModal',
  ToggleSwitch: 'ui.ToggleSwitch',
  Chip: 'ui.Chip',
  Separator: 'ui.Separator',
  AccordionItem: 'ui.AccordionItem',
  QuantityControl: 'ui.QuantityControl',
  PageHero: 'ui.PageHero',
  SectionHeading: 'ui.SectionHeading',
  IntroSurface: 'ui.IntroSurface',
  Figure: 'ui.Figure',
  BottomSheet: 'ui.BottomSheet',
  SegmentedSwitch: 'ui.SegmentedSwitch',
  StatusModal: 'ui.StatusModal',
  Skeleton: 'ui.Skeleton',
  RequiredMark: 'ui.RequiredMark',
  RequiredFieldsNote: 'ui.RequiredFieldsNote',
  DocsCallout: 'ui.DocsCallout',
  DocsCards: 'ui.DocsCards',
  DocsSteps: 'ui.DocsSteps',
  DocsTable: 'ui.DocsTable',
  DocsDefList: 'ui.DocsDefList',
  DocsCode: 'ui.DocsCode',
  DocsOutline: 'ui.DocsOutline',
  DocsPager: 'ui.DocsPager',
} as const;

export type KernelUiName = (typeof KERNEL_UI)[keyof typeof KERNEL_UI];

export function isUiName(name: string): boolean {
  return /^ui\.[A-Z][A-Za-z0-9]+$/.test(name);
}
