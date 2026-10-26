import type { Strings } from '@kernel/front/assets/i18n/types';

export const accessibilityStatement: Strings['accessibilityStatement'] = {
  eyebrow: 'Legal information',
  title: 'Accessibility statement',
  updated: 'Issued on 5 October 2026',
  intro:
    'Shop is committed to making its website accessible to everyone, in line with the French accessibility standard (RGAA), version 4.1.2. This statement covers the whole online shop.',
  statusTitle: 'Compliance status',
  statusBody: [
    'Shop is partially compliant with RGAA 4.1.2. The shop pages follow the standard: keyboard navigation, dialog windows, messages read out by screen readers, form field labels, contrast and no imposed time limits.',
    'Content that is not accessible yet is listed below.',
  ],
  issuesTitle: 'Non-accessible content',
  issuesIntro: 'The following content is not accessible yet or depends on a third-party service:',
  issues: [
    'Choosing a Mondial Relay pickup point relies on a widget and a map provided by Mondial Relay, which are hard to use with a keyboard or a screen reader. Home delivery remains available, and you can also write to us: we will help you choose your pickup point.',
    'The opening animation and a few decorative animations cannot be paused from the page. They stop when the reduce motion setting of your device is on.',
    'Card payment fields and express payment buttons are provided by Stripe, in a frame whose content we do not control.',
    'The demonstration videos are hosted on YouTube; their steps are also described in writing on the same page.',
  ],
  preparationTitle: 'How this statement was prepared',
  preparationBody: [
    'This statement was issued on 5 October 2026.',
    'Technologies used to build the website: HTML, CSS, JavaScript and WAI-ARIA.',
  ],
  contactTitle: 'Feedback and contact',
  contactBody:
    'If you cannot access a piece of content or a service, write to us: we will point you to an accessible alternative or send you the content in another form.',
  contactEmailLabel: 'Email',
  contactFormLabel: 'Form',
  contactPageLink: 'Contact form',
};
