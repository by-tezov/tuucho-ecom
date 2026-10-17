import { useLang } from '../../assets/i18n';

/** Paid gift order — destinataire name. Sits under the cagnotte note. */
export function GiftOrderNote({ name, className }: { name: string; className?: string | undefined }) {
  const { t } = useLang();
  return (
    <p className={className} role="note">
      {t.ordersPage.giftOrderFor.replace('{name}', name)}
    </p>
  );
}
