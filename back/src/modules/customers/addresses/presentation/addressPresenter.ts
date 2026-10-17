import type { AddressRow } from '../application/addresses.js';

export function toPublicAddress(row: AddressRow) {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    recipientName: row.recipient_name,
    companyName: row.company_name,
    line1: row.line1,
    line2: row.line2,
    deliveryNotes: row.delivery_notes,
    postalCode: row.postal_code,
    city: row.city,
    countryCode: row.country_code,
    phone: row.phone,
    networkCodes: row.networkCodes,
    pickupPoints: row.pickup_points,
    isDefault: row.is_default,
    savedForFuture: row.saved_for_future,
  };
}
