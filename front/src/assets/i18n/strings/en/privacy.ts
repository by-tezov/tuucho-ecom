import type { Strings } from '../../types';

export const privacy: Strings['privacy'] = {
  eyebrow: 'Your data',
  title: 'Privacy policy',
  updated: 'Last updated: 26 September 2026',
  sections: [
    {
      title: 'Data controller',
      body: [
        'The controller of the personal data collected on this site is the operator identified in the legal notice. Given the size of the business, no data protection officer has been appointed: any question about your data can be sent directly to the email address shown in the legal notice.',
      ],
    },
    {
      title: 'Data we collect',
      body: [
        'Depending on how you use the site, we collect the following categories of data: customer account (email address, password stored in encrypted form, first name, last name, phone, preferred language, date of the GDPR consent given at sign-up); delivery and billing addresses (recipient name, postal address, phone and, where applicable, the reference of the chosen pickup point, as well as the company name for a business order); orders (cart, items, prices, delivery method, discount code used, status, history of address changes and invoices); loyalty wallet, when the programme is active (balance, credit lots and expiry dates, movement history, choice to use the wallet on an order, and expiry-reminder preferences); content you save on the site (favourites, named carts you keep from one visit to the next); information you enter freely when ordering, in particular the order note, which may contain the measurements you send for a made-to-measure set; the detail of a composed set (chosen nails, design, shape, length, shared size and the finger for each nail), kept in the cart and then, if you order, on the order; a request for a size that is not offered for a composed set (email address, optional comment, requested size, nails and fingers); contact form (email address, identity, message and, if you are signed in, the account information needed to reply); technical and security data (IP address and browser information, recorded when you sign in and when your session is renewed).',
        'If you choose to sign in with Google or with Facebook, we receive from that provider only a stable technical identifier for your account with them (the “sub” identifier for Google, the user identifier for Facebook), the email address linked to that account and, for Google, confirmation that the address has been verified. No other part of your profile is requested or received: no photo, no friend list, no posts, no account content. The identity token issued by Google or Facebook is used only to verify your identity with the provider at sign-in: it is never stored. If your account still has to be created, these elements (provider identifier, email address, language) are placed in a temporary, single-use sign-up token while you accept the terms and this policy. No password is created or kept for an account opened this way.',
        'Regarding payment: your card details (number, expiry date, security code) never pass through our servers and are never stored there. They are entered and kept directly by our payment provider, Stripe, which is PCI DSS certified. If you choose to save a payment method for future purchases, we only receive and keep the card brand, its last four digits, its expiry date and a Stripe technical identifier.',
        'If you use the gift-offer feature: as the giver, we collect your email address, your first name, the optional message you write, the budget you set, and the non-reversible hash of the 4-digit code you choose to protect access to your offer (the code itself is never kept in plain text or sent again by email after the offer is created); as the recipient, we collect the name you provide and the delivery address you enter during your selection, but never your email address, which is neither requested nor collected.',
        'Your browser also keeps the functional data you entrust to it: display language; when you are not signed in, cart, favourites, addresses and contact details entered, delivery and billing choices, express option and discount code; during payment, technical references and limited descriptive information about payment methods (for example brand and last four digits), never the full number or the security code.',
      ],
    },
    {
      title: 'Purpose of processing',
      body: [
        'This data is used to create and manage your customer account, including when you choose to create it or access it with Google or Facebook; to process, make, ship and track your orders; to issue the corresponding invoices; to process payments and prevent fraud; to run the loyalty programme (calculate, grant, use and expire credits, and related reminders); to offer and manage gift offers, from their creation by the giver through selection by the recipient to payment of the order; to handle return and refund requests and complaints; to answer your enquiries, including a size request for a composed set, and provide after-sales service; to keep the site and your account secure; to meet our legal and accounting obligations; and to remember your preferences (language, cart, favourites) from one visit to the next.',
        'Your data is never used for targeted advertising on behalf of third parties, is not resold, and is not subject to any fully automated decision producing legal effects concerning you.',
        'We may however send you emails presenting our own creations and offers: new arrivals, promotions, a reminder about a cart in progress, or an alert when an item you favourited is sold or back in stock. You stay in control of these emails: from the notification settings in your personal area, each category can be turned off separately, and a master switch lets you stop all non-essential emails. Messages strictly necessary to your account and your orders (order confirmation, shipping, invoice, security, password reset, and loyalty-wallet expiry reminders when you have not turned them off) continue to be sent.',
      ],
    },
    {
      title: 'Legal basis',
      body: [
        'Processing is based, depending on the case, on performance of the sales contract or pre-contractual steps (account creation, order management, payment, delivery, loyalty programme, gift orders), on compliance with legal and accounting obligations (retention of invoices), on the operator’s legitimate interest in keeping the site secure, answering enquiries, preventing fraud and informing customers of its own creations and offers, and, for the GDPR consent collected at sign-up or when creating a gift offer, on your express consent. Commercial emails can be declined at any time, without justification and without any effect on your orders.',
        'Signing in with Google or Facebook falls under performance of the contract and pre-contractual steps (creating your account and giving you access to it). It remains optional: signing in with an email address and password is always available. An account is only created this way after your express consent to the terms and to this policy has been collected.',
      ],
    },
    {
      title: 'Retention period',
      body: [
        'Your account data is kept for as long as the account is active, then deleted at the end of the period indicated when an account deletion is requested. Loyalty-wallet data (balance, lots and history) is kept with your account and deleted when the account is deleted, subject to information already frozen on the related orders. Order and billing data is kept for the period required by accounting and tax obligations (10 years from the end of the financial year, French Commercial Code). Saved payment methods are kept by Stripe until you delete them or close your account. Exchanges through the contact form are kept for as long as needed to handle your request, and connection data for the period strictly necessary to keep the service secure. The link with your Google or Facebook account (the provider identifier and the associated email address) is kept for as long as that link exists: it is erased when you unlink it from your personal area or when your account is deleted. Temporary sign-up tokens created on a first sign-in through Google or Facebook expire after a few minutes and can only be used once.',
        'A size request for a composed set (email address, any comment, size, nails and fingers) is kept for as long as needed to answer it and follow it up. If that request leads to an order, the order data follows the rules above.',
        'Data from a gift offer (the giver’s email address and first name, any message, the hashed access code, the recipient’s name and delivery address) is kept for as long as the selection is open and then, if the offer results in an order, with that order’s data under the rules above. If the offer does not result in an order (cancelled or expired without payment), that data is automatically deleted at the latest 13 months after the offer was created, in line with CNIL recommendations for data that does not lead to a sale.',
        'Your language choice stays saved until you change it or clear your browser data. Non-sensitive cart data stored while signed out expires at the latest {guestStorageRetentionDays} days after it was last changed. Addresses, email/identification drafts and temporary payment references are scoped to the current tab and encrypted where applicable. They survive a page refresh while the checkout session remains valid, but are cleared after 30 minutes without interaction or when the tab session ends. Saved account addresses and payment methods are not affected.',
      ],
    },
    {
      title: 'Who receives your data',
      body: [
        'Your data is neither sold nor transferred to third parties for commercial purposes. It may be passed on, strictly as necessary and under GDPR-compliant contracts, to Stripe (card, PayPal, Bancontact, Google Pay and Apple Pay payment processing, PCI DSS certified), to the carrier chosen when ordering (for example Mondial Relay), for delivery purposes only, and to our host and our email provider, for hosting the site and sending transactional emails (order confirmation, replies to your enquiries). When a gift offer results in an order, the address entered by the recipient is passed to the carrier under the same conditions.',
        'When you use Google or Facebook sign-in, Google and Meta act as independent controllers for the authentication they carry out: they know that you authenticated on this site and may, on that occasion, process technical data (IP address, browser information) under their own privacy policies, over which we have no control. On our side, we send them no order, payment or delivery data. Using this sign-in is optional: you can create and use an account without ever doing so.',
        'Some of these providers and authentication providers, in particular Stripe, Google and Meta, may be established outside the European Union; such transfers are then governed by standard contractual clauses approved by the European Commission, or an equivalent mechanism guaranteeing an adequate level of protection for your data.',
      ],
    },
    {
      title: 'Data security',
      body: [
        'The operator applies reasonable technical and organisational measures to protect your data. Exchanges with the site are encrypted end to end (HTTPS) and passwords are stored in encrypted form, never in plain text.',
        'Sensitive personal data is further encrypted inside the database itself, not only in transit: identity and recipient name, delivery and billing postal addresses, postcode, city, phone number, company name, order notes and the history of address changes are all stored encrypted. Reading the database directly therefore does not reveal them.',
        'On the browser side, sensitive checkout information is encrypted with a tab-scoped key that exists only in memory. A page refresh can retrieve that key again only by presenting the opaque, still-valid checkout-session token; inactivity expiry clears the sensitive data and prevents the old session from being revived.',
        'Finally, no bank card data passes through or is stored on our servers: that data is handled entirely by Stripe.',
      ],
    },
    {
      title: 'Cookies and trackers',
      body: [
        'The site uses no analytics tool and no advertising tracker. Its “refresh_token” HTTP cookie is used solely for authentication and its security: without “remember me” it expires when the browser session closes; with that option, it expires after 7 days. The “psn-admin-landed-v1” session cookie (no token) records that the admin home redirect already ran for this browser opening.',
        'Site storage in your browser: “psn-lang” (language, localStorage); “psn-theme-preference-v1” and “psn-contrast-preference-v1” (appearance and contrast, localStorage, kept until changed or browser storage is cleared); “psn-auth-hint” (whether a login session may exist, localStorage); “psn-onboarding-v1” (shop introduction already seen, localStorage); “psn-guest-cart-v3” (signed-out cart, including a composed set, favourites, delivery and discount code, localStorage, {guestStorageRetentionDays} days after the last change); “psn-gift-lock-v1” (gift shop lock without the token, localStorage, 2 hours, or until the giver gift-space link is opened); “psn-gift-lock-session-v1” (gift tokens for this tab, sessionStorage); “psn-gift-create-draft-v1” (gift-offer form draft for this tab, sessionStorage); “psn-checkout-privacy-token-v1” (opaque checkout-session token, sessionStorage); “psn-guest-card-vault-v1” and “psn-checkout-ephemeral-vault-v1” (encrypted temporary addresses and payment references, sessionStorage; raw key kept in memory); and short-lived checkout/identification drafts in sessionStorage. Sensitive checkout storage is cleared after 30 minutes without interaction.',
        'Stripe is loaded only when adding a payment method or paying, in particular for security and fraud prevention. Mondial Relay and its mapping components are loaded when the pickup point picker is opened. Embedded videos use YouTube’s enhanced privacy mode. These providers may receive technical data and use their own storage as needed to provide their feature.',
        'The “Sign in with Google” and “Sign in with Facebook” components are loaded from accounts.google.com and connect.facebook.net on the pages that offer sign-in. Your browser may then send those providers the cookies they have set on their own domains, so they can offer you the account you are already signed into with them. No automatic sign-in is triggered, and no data reaches this site until you have clicked and then confirmed the authorisation with the provider. The Facebook component is configured to set no cookie on our domain. These components are used for authentication only, never for analytics or advertising.',
        'The site’s own storage listed above is necessary for the services you request (authentication, cart, payment, delivery and preferences) and is not used by the operator for advertising purposes; in line with CNIL recommendations, it does not require consent.',
      ],
    },
    {
      title: 'Data hosting',
      body: ['The site is hosted by the provider identified in the legal notice.'],
    },
    {
      title: 'Your rights',
      body: [
        'Under the General Data Protection Regulation (GDPR) and the French Data Protection Act, you have the right to access, rectify, erase, restrict, object to and port your data, as well as the right to withdraw your GDPR consent at any time. You may also set instructions about what happens to your data after your death.',
        'One limit applies to these rights: data we are legally required to keep, in particular invoices, cannot be erased before the legal deadline, even after your account has been deleted.',
        'To exercise these rights, contact us at the email address shown in the legal notice, or use your personal area to delete your account or to unlink your Google or Facebook account, after a security confirmation (entering your password, or a code sent by email). You will receive a reply within one month, which may be extended if the request is complex. You also have the right to lodge a complaint with the CNIL (www.cnil.fr).',
      ],
    },
    {
      title: 'Changes to this policy',
      body: [
        'This privacy policy may be updated at any time. See the last updated date at the top of this page.',
      ],
    },
  ],
};
