import type { Strings } from './types';
import { about } from './strings/en/about';
import { accessibilityStatement } from './strings/en/accessibilityStatement';
import { account } from './strings/en/account';
import { address } from './strings/en/address';
import { admin } from './strings/en/admin';
import { appError } from './strings/en/appError';
import { atelier } from './strings/en/atelier';
import { auth } from './strings/en/auth';
import { bootSplash } from './strings/en/bootSplash';
import { capsules } from './strings/en/capsules';
import { cart } from './strings/en/cart';
import { checkoutSessionExpired } from './strings/en/checkoutSessionExpired';
import { common } from './strings/en/common';
import { contact } from './strings/en/contact';
import { customDesign } from './strings/en/customDesign';
import { faq } from './strings/en/faq';
import { footer } from './strings/en/footer';
import { gallery } from './strings/en/gallery';
import { galleryNail } from './strings/en/galleryNail';
import { gift } from './strings/en/gift';
import { guide } from './strings/en/guide';
import { hero } from './strings/en/hero';
import { legalNotice } from './strings/en/legalNotice';
import { loyalty } from './strings/en/loyalty';
import { nav } from './strings/en/nav';
import { newArrivals } from './strings/en/newArrivals';
import { notFound } from './strings/en/notFound';
import { notifications } from './strings/en/notifications';
import { onboarding } from './strings/en/onboarding';
import { order } from './strings/en/order';
import { ordersPage } from './strings/en/ordersPage';
import { paymentMethods } from './strings/en/paymentMethods';
import { platforms } from './strings/en/platforms';
import { pose } from './strings/en/pose';
import { poseVideoPage } from './strings/en/poseVideoPage';
import { privacy } from './strings/en/privacy';
import { product } from './strings/en/product';
import { reviews } from './strings/en/reviews';
import { salesTerms } from './strings/en/salesTerms';
import { seo } from './strings/en/seo';
import { serviceDisrupted } from './strings/en/serviceDisrupted';
import { sitemapPage } from './strings/en/sitemapPage';
import { terms } from './strings/en/terms';
import { values } from './strings/en/values';

/** Assembled from `strings/en/`, one file per screen. Nothing is authored
 * in this file: edit the namespace file, or use `npm run i18n`. */
export const en: Strings = {
  skip: common.skip,
  skipFooter: common.skipFooter,
  checkoutSessionExpired,
  backLink: common.backLink,
  brandAria: common.brandAria,
  navAria: common.navAria,
  menuOpenAria: common.menuOpenAria,
  menuCloseAria: common.menuCloseAria,
  newWindowAria: common.newWindowAria,
  continueAction: common.continueAction,
  requiredFieldsNote: common.requiredFieldsNote,
  bootSplash,
  seo,
  notFound,
  appError,
  serviceDisrupted,
  nav,
  hero,
  newArrivals,
  values,
  about,
  atelier,
  capsules,
  pose,
  customDesign,
  onboarding,
  order,
  platforms,
  reviews,
  contact,
  faq,
  guide,
  footer,
  product,
  gallery,
  galleryNail,
  cart,
  ordersPage,
  auth,
  account,
  admin,
  gift,
  loyalty,
  paymentMethods,
  notifications,
  address,
  legalNotice,
  privacy,
  terms,
  salesTerms,
  accessibilityStatement,
  poseVideoPage,
  sitemapPage,
};
