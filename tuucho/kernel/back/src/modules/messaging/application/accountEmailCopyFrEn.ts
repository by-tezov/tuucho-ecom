import type { AccountEmailCopy } from './accountEmailCopyTypes.js';

/** English account email copy. French lives in locale-fr (`account-email:fr`). */
export const ACCOUNT_EMAIL_COPY_EN: AccountEmailCopy = {
  ctaFallbackHint: 'If the button does not work, copy and paste this link into your browser:',
  contactReply: {
    subject: 'Shop: reply to your message',
    title: 'Reply to your message',
    hello: 'Hello,',
  },
  passwordReset: {
    subject: 'Reset your password: Shop',
    title: 'Reset your password',
    intro: 'A password reset was requested for your Shop account.',
    followLink: 'Follow this link to choose a new password:',
    outro: 'This link expires in 1 hour. If you did not make this request, ignore this email.',
    cta: 'Reset my password',
  },
  loginCode: {
    subject: 'Your sign-in code: Shop',
    title: 'Your sign-in code',
    intro: 'Here is the 6-digit code to continue on Shop.',
    codeLabel: 'Code',
    outro: 'This code expires in 10 minutes. If you did not make this request, ignore this email.',
    hint: 'Your code',
  },
  confirmEmail: {
    subject: 'Confirm your email address: Shop',
    title: 'Confirm your email address',
    followLink: 'Confirm your email address by following this link:',
    outro: 'This link expires in 24 hours.',
    cta: 'Confirm my email address',
  },
  emailChange: {
    subject: 'Email address change requested: Shop',
    title: 'Email address change requested',
    intro: (email) => `A request to change the email address of your Shop account to ${email} was made.`,
    outro:
      'If this was you, nothing more is needed. If you did not make this request, lock your account right away. It will stay locked until we unlock it by hand after checking.',
    lockLabel: 'Lock my account',
    cta: 'This was not me: lock my account',
  },
  superAdminSignIn: {
    subject: 'Super administrator sign-in: Shop',
    title: 'Sign-in to your super administrator account',
    introSignIn: 'Someone just signed in to your Shop super administrator account.',
    introResume:
      'Your Shop super administrator session was just resumed automatically on a device that was already signed in.',
    when: (value) => `When: ${value}`,
    place: (value) => `Location: ${value}`,
    ipAddress: (value) => `IP address: ${value}`,
    device: (value) => `Device: ${value}`,
    unknown: 'unknown',
    outro:
      'If this was you, nothing more is needed. If not, lock the account right away: all its sessions will be closed, and it will stay locked until another super administrator or the site operator unlocks it.',
    lockLabel: 'Lock the account',
    cta: 'This was not me: lock the account',
  },
  deletionRequested: {
    subject: 'Your account deletion is scheduled: Shop',
    title: 'Your account deletion is scheduled',
    intro: 'You asked for your Shop account to be deleted.',
    outro: (date) =>
      `Your account will be permanently deleted on ${date} unless you sign in again before then. Sign in at any time before that date to cancel the deletion.`,
  },
  deletionReminder: {
    title: 'Your Shop account will soon be deleted',
    intro: (days, date) =>
      `${days} day(s) are left before your Shop account is permanently deleted, on ${date}.`,
    outro: 'Sign in before that date to cancel the deletion.',
  },
  invoice: {
    title: (n) => `Your invoice (order ${n})`,
    intro: (n) => `Please find attached the invoice for your order ${n}.`,
    guestIntro: (n, label) =>
      `Please find attached the invoice for your order ${n}. Use "${label}" to follow this order (link valid for 24 hours).`,
    frenchDocumentNote: 'The invoice is issued in French, as French law requires.',
  },
  orderReceived: {
    title: (n) => `Your order ${n} has been received`,
    subject: (n) => `Order received (${n}): Shop`,
    intro: 'Your order is marked as received. Your invoice is available in your orders area.',
    cta: 'View my order history',
  },
  productRequest: {
    title: 'Product request',
    accepted: 'Good news, your request has been accepted.',
    refused: 'Unfortunately we cannot accept your request.',
    acceptedSubject: 'Shop: your request has been accepted',
    refusedSubject: 'Shop: reply to your request',
    article: 'Item',
    size: 'Size',
    quantity: 'Quantity',
    price: 'Proposed price',
    replyHint: 'Reply directly to this email to continue the conversation.',
  },
};
