import type { Strings } from './types';
import { about } from './strings/nl/about';
import { accessibilityStatement } from './strings/nl/accessibilityStatement';
import { account } from './strings/nl/account';
import { address } from './strings/nl/address';
import { admin } from './strings/nl/admin';
import { appError } from './strings/nl/appError';
import { atelier } from './strings/nl/atelier';
import { auth } from './strings/nl/auth';
import { bootSplash } from './strings/nl/bootSplash';
import { capsules } from './strings/nl/capsules';
import { cart } from './strings/nl/cart';
import { checkoutSessionExpired } from './strings/nl/checkoutSessionExpired';
import { common } from './strings/nl/common';
import { contact } from './strings/nl/contact';
import { customDesign } from './strings/nl/customDesign';
import { faq } from './strings/nl/faq';
import { footer } from './strings/nl/footer';
import { gallery } from './strings/nl/gallery';
import { galleryNail } from './strings/nl/galleryNail';
import { gift } from './strings/nl/gift';
import { guide } from './strings/nl/guide';
import { hero } from './strings/nl/hero';
import { legalNotice } from './strings/nl/legalNotice';
import { loyalty } from './strings/nl/loyalty';
import { nav } from './strings/nl/nav';
import { newArrivals } from './strings/nl/newArrivals';
import { notFound } from './strings/nl/notFound';
import { notifications } from './strings/nl/notifications';
import { onboarding } from './strings/nl/onboarding';
import { order } from './strings/nl/order';
import { ordersPage } from './strings/nl/ordersPage';
import { paymentMethods } from './strings/nl/paymentMethods';
import { platforms } from './strings/nl/platforms';
import { pose } from './strings/nl/pose';
import { poseVideoPage } from './strings/nl/poseVideoPage';
import { privacy } from './strings/nl/privacy';
import { product } from './strings/nl/product';
import { reviews } from './strings/nl/reviews';
import { salesTerms } from './strings/nl/salesTerms';
import { seo } from './strings/nl/seo';
import { serviceDisrupted } from './strings/nl/serviceDisrupted';
import { sitemapPage } from './strings/nl/sitemapPage';
import { terms } from './strings/nl/terms';
import { values } from './strings/nl/values';

/** Assembled from `strings/nl/`, one file per screen. Nothing is authored
 * in this file: edit the namespace file, or use `npm run i18n`. */
export const nl: Strings = {
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
