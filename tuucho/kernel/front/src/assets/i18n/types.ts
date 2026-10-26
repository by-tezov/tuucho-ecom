/** Key shapes for storefront copy. Values live in locale packs
 * (`tuucho-kernel-locale-en` / `tuucho-kernel-locale-fr` and plugin complements). Nothing is
 * authored here except the top-level labels that belong to no screen and the
 * `Strings` assembly itself: add a key with `npm run i18n`, and it lands in the
 * namespace type file. */
import type { AboutStrings } from './types/about';
import type { AccessibilityStatementStrings } from './types/accessibilityStatement';
import type { AccountStrings } from './types/account';
import type { AddressStrings } from './types/address';
import type { AdminStrings } from './types/admin';
import type { AppErrorStrings } from './types/appError';
import type { AtelierStrings } from './types/atelier';
import type { AuthStrings } from './types/auth';
import type { BootSplashStrings } from './types/bootSplash';
import type { CapsulesStrings } from './types/capsules';
import type { CartStrings } from './types/cart';
import type { ContactStrings } from './types/contact';
import type { CustomDesignStrings } from './types/customDesign';
import type { FaqStrings } from './types/faq';
import type { FooterStrings } from './types/footer';
import type { GalleryStrings } from './types/gallery';
import type { GiftStrings } from './types/gift';
import type { GuideStrings } from './types/guide';
import type { HeroStrings } from './types/hero';
import type { LegalNoticeStrings } from './types/legalNotice';
import type { LoyaltyStrings } from './types/loyalty';
import type { NavStrings } from './types/nav';
import type { NewArrivalsStrings } from './types/newArrivals';
import type { NotFoundStrings } from './types/notFound';
import type { NotificationsStrings } from './types/notifications';
import type { OnboardingStrings } from './types/onboarding';
import type { OrderStrings } from './types/order';
import type { OrdersPageStrings } from './types/ordersPage';
import type { PaymentMethodsStrings } from './types/paymentMethods';
import type { PlatformsStrings } from './types/platforms';
import type { PoseStrings } from './types/pose';
import type { PoseVideoPageStrings } from './types/poseVideoPage';
import type { PrivacyStrings } from './types/privacy';
import type { ProductStrings } from './types/product';
import type { ReviewsStrings } from './types/reviews';
import type { SalesTermsStrings } from './types/salesTerms';
import type { SeoStrings } from './types/seo';
import type { ServiceDisruptedStrings } from './types/serviceDisrupted';
import type { SitemapPageStrings } from './types/sitemapPage';
import type { TermsStrings } from './types/terms';
import type { ValuesStrings } from './types/values';

export type Lang = 'en' | 'fr';

export interface Strings {
  skip: string;
  /** Second skip link: the footer (legal pages, sitemap, accessibility
   * statement) stays reachable while the gallery keeps loading. */
  skipFooter: string;
  checkoutSessionExpired: {
    title: string;
    message: (minutes: number) => string;
    continue: string;
    /** Shown CHECKOUT_SESSION_WARNING_LEAD_MINUTES before that expiry, with
     * `continue` as its one action (RGAA 13.1). `{n}` is those minutes. */
    warningTitle: string;
    warningMessage: string;
  };
  /** Shared mobile “back” control label (e.g. legal pages). */
  backLink: string;
  brandAria: string;
  navAria: string;
  menuOpenAria: string;
  menuCloseAria: string;
  newWindowAria: string;
  /** The one button of a success notice (StatusModal); dismissing it is what
   * runs the follow-up, never a timer. */
  continueAction: string;
  /** Explains the `*` marking a required field, shown once above each form. */
  requiredFieldsNote: string;
  /** Accessible label for the language switcher control group. */
  languageSwitcherLabel: string;
  bootSplash: BootSplashStrings;
  seo: SeoStrings;
  notFound: NotFoundStrings;
  appError: AppErrorStrings;
  serviceDisrupted: ServiceDisruptedStrings;
  nav: NavStrings;
  hero: HeroStrings;
  newArrivals: NewArrivalsStrings;
  values: ValuesStrings;
  about: AboutStrings;
  atelier: AtelierStrings;
  capsules: CapsulesStrings;
  pose: PoseStrings;
  customDesign: CustomDesignStrings;
  onboarding: OnboardingStrings;
  order: OrderStrings;
  platforms: PlatformsStrings;
  reviews: ReviewsStrings;
  contact: ContactStrings;
  faq: FaqStrings;
  guide: GuideStrings;
  footer: FooterStrings;
  product: ProductStrings;
  gallery: GalleryStrings;
  cart: CartStrings;
  ordersPage: OrdersPageStrings;
  auth: AuthStrings;
  account: AccountStrings;
  admin: AdminStrings;
  gift: GiftStrings;
  loyalty: LoyaltyStrings;
  address: AddressStrings;
  paymentMethods: PaymentMethodsStrings;
  notifications: NotificationsStrings;
  legalNotice: LegalNoticeStrings;
  privacy: PrivacyStrings;
  terms: TermsStrings;
  salesTerms: SalesTermsStrings;
  accessibilityStatement: AccessibilityStatementStrings;
  sitemapPage: SitemapPageStrings;
  poseVideoPage: PoseVideoPageStrings;
}

export type { AboutStrings } from './types/about';
export type { AccessibilityStatementStrings } from './types/accessibilityStatement';
export type { AccountStrings } from './types/account';
export type { AddressStrings } from './types/address';
export type { AdminStrings } from './types/admin';
export type { AppErrorStrings } from './types/appError';
export type { AtelierColorStrings, AtelierStrings } from './types/atelier';
export type { AuthStrings } from './types/auth';
export type { BootSplashStrings } from './types/bootSplash';
export type { CapsuleFormStrings, CapsuleLengthStrings, CapsulesStrings } from './types/capsules';
export type { CartStrings } from './types/cart';
export type { ContactStrings } from './types/contact';
export type { CustomDesignStrings } from './types/customDesign';
export type { FaqItemStrings, FaqStrings } from './types/faq';
export type { FooterStrings } from './types/footer';
export type { GalleryStrings } from './types/gallery';
export type { GiftCreateStepStrings, GiftNextStepStrings, GiftStrings } from './types/gift';
export type { GuideStepStrings, GuideStrings } from './types/guide';
export type { HeroStrings } from './types/hero';
export type { LegalNoticeStrings, LegalSectionStrings } from './types/legalNotice';
export type { LoyaltyStrings } from './types/loyalty';
export type { NavStrings } from './types/nav';
export type { NewArrivalsStrings } from './types/newArrivals';
export type { NotFoundStrings } from './types/notFound';
export type { NotificationChannelCopy, NotificationsStrings } from './types/notifications';
export type { OnboardingDealsCopy, OnboardingSlideCopy, OnboardingStrings } from './types/onboarding';
export type { OrderStepStrings, OrderStrings } from './types/order';
export type { OrdersPageStrings } from './types/ordersPage';
export type { PaymentMethodsStrings } from './types/paymentMethods';
export type { PlatformStrings, PlatformsStrings } from './types/platforms';
export type { PoseStepStrings, PoseStrings } from './types/pose';
export type { PoseVideoPageStrings } from './types/poseVideoPage';
export type { PrivacyStrings } from './types/privacy';
export type { ProductStrings } from './types/product';
export type { ReviewsStrings } from './types/reviews';
export type { SalesTermsStrings } from './types/salesTerms';
export type { SeoStrings } from './types/seo';
export type { ServiceDisruptedStrings } from './types/serviceDisrupted';
export type { SitemapPageStrings } from './types/sitemapPage';
export type { TermsStrings } from './types/terms';
export type { ValueItemStrings, ValuesStrings } from './types/values';
