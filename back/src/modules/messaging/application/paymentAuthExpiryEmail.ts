/** Split out of email.ts, which is at its own size ratchet: a spy-email
 * builder with nowhere left to grow in that file. */
import type { MailMessage } from './email.js';
import { spyNoticeHtml } from './emailTemplates.js';

export interface PaymentAuthorizationExpiringEmailData {
  userEmail: string | null;
  userId: string | null;
  amount: number;
  currency: string;
  paymentMethodType: string | null;
  orderNumber: string | null;
  orderId: string | null;
  /** ISO instant. Estimated, not exact: Stripe exposes no real expiry for a
   * manual-capture authorization hold (see orders/application/paymentAuthExpirySpy.ts). */
  estimatedExpiresAt: string;
}

/** Spy-only — proactive heads-up PAYMENT_AUTH_EXPIRY_SPY_BEFORE ahead of an
 * *estimated* authorization-hold expiry, so ops can capture in time if the
 * sale should close. Never captures, cancels, or refunds anything itself.
 * Always French. */
export function paymentAuthorizationExpiringSpyEmail(
  data: PaymentAuthorizationExpiringEmailData,
): Omit<MailMessage, 'to'> {
  const who = data.userEmail
    ? `${data.userEmail} (${data.userId ?? 'id inconnu'})`
    : data.userId
      ? `Email inconnu (${data.userId})`
      : 'Client inconnu';
  const amount = `${data.amount.toFixed(2)} ${data.currency.toUpperCase()}`;
  const method =
    data.paymentMethodType === 'paypal'
      ? 'PayPal'
      : data.paymentMethodType === 'bancontact'
        ? 'Bancontact'
        : data.paymentMethodType === 'card'
          ? 'Carte'
          : data.paymentMethodType === 'free'
            ? 'Gratuit'
            : (data.paymentMethodType ?? 'Inconnu');
  const order =
    data.orderNumber != null
      ? data.orderId
        ? `${data.orderNumber} (${data.orderId})`
        : data.orderNumber
      : (data.orderId ?? 'Commande introuvable');
  const estimatedDate = new Date(data.estimatedExpiresAt).toLocaleDateString('fr-FR', { dateStyle: 'long' });
  return {
    subject: `Autorisation bientôt expirée, ${amount}${data.orderNumber ? `, ${data.orderNumber}` : ''}`,
    text:
      `Une autorisation de paiement va bientôt expirer sans avoir été capturée.\n\n` +
      `Client : ${who}\nCommande : ${order}\nMontant : ${amount}\nMoyen : ${method}\n` +
      `Expiration estimée : ${estimatedDate} (date estimée, Stripe ne fournit pas l’échéance exacte).`,
    html: spyNoticeHtml({
      title: 'Autorisation de paiement bientôt expirée',
      fields: [
        { label: 'Client', value: who },
        { label: 'Commande', value: order },
        { label: 'Montant', value: amount },
        { label: 'Moyen de paiement', value: method },
        { label: 'Expiration estimée', value: estimatedDate },
      ],
      lines: [
        'Capture la commande maintenant si la vente doit se conclure. Sinon, Stripe libère l’autorisation automatiquement (date estimée, non garantie).',
      ],
    }),
    kind: 'spy',
  };
}
