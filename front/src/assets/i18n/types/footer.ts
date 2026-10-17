export interface FooterStrings {
  /** What the shop sells, under the footer brand name. */
  brandTagline: string;
  /** Second line under the brand: alternate spelling people type into search
   * ("Lumen", the same form as the shop's own contact address).
   * Mirrors shopConfig.brandAliases, which feeds schema.org alternateName. */
  brandAlsoKnownAs: string;
  legalSuffix: string;
  navAria: string;
  legalNavAria: string;
  legalLink: string;
  privacyLink: string;
  termsLink: string;
  salesTermsLink: string;
  sitemapLink: string;

  accessibilityLink: string;

  acceptedPayments: string;
}
