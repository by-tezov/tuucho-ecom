import type { Strings } from '@kernel/front/assets/i18n/types';

export const salesTerms: Strings['salesTerms'] = {
  eyebrow: 'Ordering',
  title: 'Terms of sale',
  updated: 'Last updated: 26 September 2026',
  sections: [
    {
      title: 'Scope',
      body: [
        'These terms of sale govern orders placed directly online on this site, with the operator identified in the legal notice. They do not apply to purchases made on third-party platforms (Vinted, Facebook, TikTok, etc.), which remain governed by the conditions specific to each of those platforms.',
        'Placing an order means full acceptance of these terms of sale, in the version in force on the day of the order. They are offered in several languages; in the event of a difference in interpretation, the French version prevails.',
        'Orders are open to private individuals and to businesses alike; the capacity indicated when ordering determines the details shown on the invoice.',
      ],
    },
    {
      title: 'Products',
      body: [
        'The site offers ready-to-wear sets, assembled sets and made-to-measure sets. Ready-to-wear sets are handmade and then offered from stock, in the shapes, lengths and standard sizes (XS, S, M, L) shown on their product page. A made-to-measure piece can be prepared from the notes you send when ordering. Accessories may also be offered.',
        'As every piece is handmade, slight variations from the gallery photos are possible. Displayed colours may also differ slightly from the actual product depending on your screen settings.',
        'Handmade pieces are decorative items intended for decorative use. They are not suitable for young children and must be installed following the instructions provided.',
      ],
    },
    {
      title: 'Account and ordering',
      body: [
        'You can browse the gallery and build a cart without an account, but creating a customer account is required in order to pay for an order. You must have the legal capacity to enter into a contract; if you are a minor, the order must be placed by your legal guardian or with their agreement.',
        'Ordering happens in several steps: adding items to the cart (for a ready-to-wear set, the shape, length and size; the shape, height and size); selecting an address and a delivery method (pickup point or home); applying a discount code if you have one, or using your loyalty wallet when the programme is active; then a detailed summary before payment. You can correct your cart at every step up to payment: it is up to you to check the summary, and in particular the shape, height and size, as well as any notes sent for a made-to-measure piece.',
        'The order becomes firm and the contract is formed when payment is confirmed, evidenced by the order confirmation email.',
        'Items placed in your cart are not reserved: they remain on sale and can be bought by someone else for as long as you have not started payment. The hold is placed when payment is started and lasts a short time, long enough to complete it. If payment does not go through within that time, the hold is released and the items go back on sale.',
      ],
    },
    {
      title: 'Gift orders',
      body: [
        'When an order comes from a gift offer, two people are involved: the giver chooses a budget and passes on an access card protected by a code to someone else, who selects the items, including by choosing pieces from the gallery, and the delivery address themselves, within that budget. The price of a assembled set is the sum of its pieces and counts toward that budget. The order becomes firm and the sales contract is formed when the giver pays for that order from their gift space, exactly as for an order placed directly (see Account and ordering above).',
        'The giver is the sole party to the sales contract: they hold the customer account linked to the order, they receive its invoice (marked Gift order), and they are the point of contact for any question, change, return, refund or complaint relating to that order, on the same terms as for any other order on this site. The delivery address is the one entered by the recipient at the time of their selection; it may differ from the giver’s account address.',
        'The maximum budget set by the giver only caps the value of the items the recipient can select: it is neither a payment method nor a credit. Actual payment of the order, once the selection is confirmed, follows the payment rules described below.',
        'A selection confirmed by the recipient is only a promise to buy, not an order: it holds the chosen items for the payment period shown in the giver’s gift space. If the giver does not pay within that period, the promise is cancelled and the items go back on sale, without any order ever having existed or any payment ever having been requested from anyone.',
      ],
    },
    {
      title: 'Availability',
      body: [
        'Sets are made in small quantities and the stock shown is limited, by shape, length and size. An item kept in your cart is not set aside: it stays on sale until you start payment. So we suggest not waiting too long if a piece appeals to you.',
        'A assembled set can be added to the cart only if every piece is offered in the chosen size. A request sent when a size is not offered is neither a reservation nor an order: it only asks whether that size can be prepared.',
        'From the moment payment starts, however, the items being paid for are held in your name: nobody can take them from you while you complete the transaction. A paid item is therefore an available item.',
        'Only an event beyond our control (loss, breakage or damage affecting the item before it ships) could prevent us from fulfilling it. You would then be told without delay and offered a full refund.',
      ],
    },
    {
      title: 'Prices',
      body: [
        'Prices are shown in euros. VAT not applicable (article 293 B of the French General Tax Code). Delivery charges, which depend on the delivery method and destination chosen, are shown separately and added to the total before the order is confirmed. No other charge is added to the amount shown in the summary.',
        'Displayed prices may change at any time, but you are charged the price in force at the moment your order is recorded.',
        'A assembled set is charged as the sum of the prices of its pieces, each at the price in force when the order is recorded.',
        'Automatic offers may apply depending on what is in the cart: a discount by quantity tier, free delivery above a certain amount, or a free item. Free items appear in the cart at zero euros and cannot be removed from it for as long as the offer’s condition is met; they follow the fate of the order and cannot be refunded in cash.',
        'Discount codes are valid during their usage period, in limited numbers, and may be reserved for certain accounts. Only one code can be applied per order, and some automatic offers cannot be combined with a code. A code not used before it expires is lost, without exchange or compensation; a code held against an order that does not go through is automatically released.',
        'When the loyalty programme is active, a wallet credit may also reduce the amount payable, under the programme rules. The wallet and a discount code cannot be combined on the same order.',
      ],
    },
    {
      title: 'Loyalty wallet',
      body: [
        'When the programme is active, each paid order may generate a loyalty credit calculated on the amount of paid merchandise (after automatic discounts, any discount code and, where applicable, after using the wallet), excluding delivery charges and free gift items. The projected amount is shown in the cart and frozen when the order is confirmed.',
        'The credit is only added to your wallet after confirmation that the order was properly received (verification by Shop). For an order placed without an account, the credit is only granted once the order is linked to a customer account and after that verification.',
        'You may use all or part of your available balance on a later order by enabling it in the cart. The wallet cannot be combined with a discount code on the same order. It does not entitle you to a cash refund or to payment off this site, and it is neither transferable nor resellable.',
        'Credits are grouped into lots with an expiry date. After that date, any remaining balance in the lot is lost without compensation. Reminders may be sent before expiry, according to your notification preferences.',
        'If an order is cancelled or refunded, wallet credit used as payment on that order may be restored (unless the relevant lot has already expired). Earn from that order is lost, including after reception was confirmed: any remaining balance on that earn lot is reversed. If that earn was already spent on a later order, the equivalent is deducted from the cash reimbursement, not taken from the rest of your wallet. An earn still pending grant is voided if the order does not complete or reception is not validated.',
        'The operator may manually credit or adjust a wallet for a legitimate reason (goodwill gesture, error correction), and may disable the programme going forward. Balances already earned remain subject to these use and expiry rules. Deleting your account means losing any remaining balance.',
      ],
    },
    {
      title: 'Payment',
      body: [
        'Payment is due when ordering, by bank card, PayPal, Bancontact, Google Pay or Apple Pay. Payments are processed by Stripe, a PCI DSS certified provider: your card details are entered directly on its secure servers and never pass through ours. If you save a payment method for future orders, only the card brand, its last four digits and its expiry date are passed to us.',
        'Depending on the payment method, the amount may be authorised when the order is placed and then charged when it is prepared or shipped. If the order is cancelled before that charge, the authorisation is released and no money is taken; how long the funds take to reappear on your account then depends on your bank.',
        'If a payment succeeds but the order cannot follow the normal process, it is kept for human review. We check the payment and then decide what happens next, including a refund if needed; no refund is initiated without an explicit human decision.',
        'Where there is serious suspicion of fraud, a disputed payment method or non-payment, the order may be suspended or cancelled, and the account concerned temporarily locked while checks are carried out.',
      ],
    },
    {
      title: 'Making and shipping times',
      body: [
        'Ready-to-wear sets are prepared and shipped within 48 working hours of the order being confirmed. Assembled sets and made-to-measure sets generally take 1 to 3 days to make, followed by shipping within 48 working hours. These times are indicative and may vary with the number of orders in progress; you are told if there is a significant delay.',
        'In any event, your order is shipped at the latest 7 days after it is confirmed. This limit comes from the payment authorisation, whose validity is of the same order: beyond it, the order could no longer be charged without asking you to pay again. If that deadline could not be met, we would contact you to agree either a new deadline or cancellation of the order with a full refund.',
      ],
    },
    {
      title: 'Delivery',
      body: [
        'Orders are delivered in mainland France and in Belgium, using the method chosen when ordering: collection from a pickup point (Mondial Relay network) or home delivery. The carrier, the price and the indicative time are shown before confirmation. A tracking number is sent to you when the parcel ships.',
        'It is up to you to enter an exact and complete delivery address, together with a phone number the carrier can use to reach you. When a parcel is not collected within the holding period or is refused by the recipient, it is returned to Shop and reviewed manually. Following that review, the order may be cancelled with a full, partial or no refund. Delivery costs may remain payable by the customer and be deducted from the refund. When delivery was free through a voucher or because the qualifying order amount was reached, the delivery cost initially paid by Shop may also be retained. The customer is informed by email of the final decision, the amount refunded and any delivery costs retained.',
      ],
    },
    {
      title: 'Changing an order',
      body: [
        'After payment, the delivery or billing address can still be corrected for as long as the order has not shipped, from your personal area or by contacting us; a history of those changes is kept on the order. The contents of the order (items, sizes, options) can no longer be changed once payment is confirmed.',
      ],
    },
    {
      title: 'Returns and refunds',
      body: [
        'Our returns policy distinguishes three situations, depending on where the request comes from. In every case, a return requires a request from you and a reply from us: the practical steps are described in the next section.',
        '1. Our mistake or a fault on our side: you must contact us so that we can verify the situation with you. This covers an item that does not match your order (shape, length, size, colour or model), a manufacturing fault, or a missing item. Tell us as soon as possible after receiving it, with photos if you can. If needed, a product return will be required. After analysis, a loyalty wallet credit may be offered.',
        '2. Other return requests: on a reasoned request, and at your expense. Handmade pieces are hygiene items meant to be applied to the piece: a set that has left our hands cannot be put back on sale if it has been opened or handled. A simple change of mind is therefore not a reason for a return. If a particular difficulty arises, write to us explaining your situation: every request is looked at individually, and we look for a solution wherever one is possible.',
        'A return can only be considered if the set has remained strictly intact: original packaging unopened and undamaged, contents never handled, never tried on, never applied, set complete. Do not send anything back before you have our written agreement and the return address we will give you. A set that comes back opened, incomplete, tried on or worn cannot be taken back or refunded, and is returned to you at your expense.',
        'Where a return is accepted, the return postage is at your expense. We strongly recommend a tracked service: the parcel travels under your responsibility until we receive it. After receipt and checking, the returned items are refunded to the payment method used for the purchase, within 14 days. The original delivery charges are not refunded. If the return means the order loses the benefit of an automatic offer or a discount code, the refund is recalculated on the basis of the amounts actually due for the items kept, and the free item must be sent back with them.',
        '3. Assembled sets, made-to-measure sets and personalised items: not taken back, not exchanged, not refunded. A assembled set is prepared from the pieces, slots and size you choose. A made-to-measure set is made specially from the measurements and options you send us. Once the order is confirmed, these sets can be neither resold nor reused. So check your choices, and where applicable your measurements, carefully on the summary before paying. This exclusion obviously does not apply if the item is faulty or does not match what you ordered: that falls back into the first case (contact, verification and, where applicable, return then analysis).',
      ],
    },
    {
      title: 'Requesting a return',
      body: [
        'Every request is made by email, to the address shown in the legal notice. So that we can deal with it quickly, give your order number, the date you received it, the item or items concerned and the reason for your request, attaching photos if the item is damaged, faulty or does not match what you ordered.',
        'We reply within a few working days telling you what happens next and, where applicable, the return address and the steps to follow. Do not send anything before you have received that reply: a parcel sent back spontaneously may reach us without our being able to identify or process it.',
      ],
    },
    {
      title: 'Guarantee',
      body: [
        'We are answerable for faults that already affected the item at the time of delivery: an item that does not match your order, a manufacturing fault, a piece missing, broken or damaged on arrival. These situations fall under the first case described above. You must contact us so that we can verify the situation with you. If needed, a product return will be required. After analysis, a loyalty wallet credit may be offered.',
        'This guarantee does not, however, cover normal wear or damage caused by use. Handmade pieces are decorative items with a limited lifespan, whose hold depends on the quality of the application, the removal and the care taken. A tip that lifts, splits or breaks after application, a design that wears down with use, a set damaged during removal, or a size that does not fit because you chose an unsuitable standard size for a assembled set or sent inaccurate measurements for a made-to-measure set, are not manufacturing faults.',
        'Tell us about any fault as soon as you notice it, with photos taken before any attempt at application if possible. The sooner the request reaches us, the easier it is to establish where the problem came from and to put it right.',
      ],
    },
    {
      title: 'Invoice',
      body: [
        'A PDF invoice is issued for every order. It can be downloaded from your personal area and can be emailed to you on request. For a business order, the company name entered when ordering appears on it.',
      ],
    },
    {
      title: 'Complaints and customer service',
      body: [
        'For any question, return request or complaint, write to us at the email address shown in the legal notice, giving your order number. We do our best to reply within a few working days. Any complaint about the condition of a parcel or the conformity of an item must be sent to us as soon as possible after receipt, with photos if you can.',
      ],
    },
    {
      title: 'Governing law and disputes',
      body: [
        'These terms of sale are governed by French law. If you live in Belgium, you keep the benefit of the mandatory consumer protection provisions of your country of residence.',
        'If a difficulty arises, contact us first: the vast majority of situations are settled directly and quickly. Failing an amicable agreement, the dispute may be brought before the competent courts.',
      ],
    },
    {
      title: 'Changes to these terms',
      body: [
        'These terms of sale may be changed at any time. The version applicable to your order is the one in force on the day you place it. See the last updated date at the top of this page.',
      ],
    },
  ],
  mediationTitle: 'Consumer mediation',
  mediationIntro:
    'Under articles L616-1 and following of the French Consumer Code, if a dispute is not resolved directly with the operator, you may refer the matter free of charge to a consumer mediator.',
  mediationNameLabel: 'Mediator',
  mediationWebsiteLabel: 'Website',
};
