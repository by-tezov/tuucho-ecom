import type { Strings } from './types';
import { about } from './strings/es/about';
import { accessibilityStatement } from './strings/es/accessibilityStatement';
import { account } from './strings/es/account';
import { address } from './strings/es/address';
import { admin } from './strings/es/admin';
import { appError } from './strings/es/appError';
import { atelier } from './strings/es/atelier';
import { auth } from './strings/es/auth';
import { bootSplash } from './strings/es/bootSplash';
import { capsules } from './strings/es/capsules';
import { cart } from './strings/es/cart';
import { checkoutSessionExpired } from './strings/es/checkoutSessionExpired';
import { common } from './strings/es/common';
import { contact } from './strings/es/contact';
import { customDesign } from './strings/es/customDesign';
import { faq } from './strings/es/faq';
import { footer } from './strings/es/footer';
import { gallery } from './strings/es/gallery';
import { galleryNail } from './strings/es/galleryNail';
import { gift } from './strings/es/gift';
import { guide } from './strings/es/guide';
import { hero } from './strings/es/hero';
import { legalNotice } from './strings/es/legalNotice';
import { loyalty } from './strings/es/loyalty';
import { nav } from './strings/es/nav';
import { newArrivals } from './strings/es/newArrivals';
import { notFound } from './strings/es/notFound';
import { notifications } from './strings/es/notifications';
import { onboarding } from './strings/es/onboarding';
import { order } from './strings/es/order';
import { ordersPage } from './strings/es/ordersPage';
import { paymentMethods } from './strings/es/paymentMethods';
import { platforms } from './strings/es/platforms';
import { pose } from './strings/es/pose';
import { poseVideoPage } from './strings/es/poseVideoPage';
import { privacy } from './strings/es/privacy';
import { product } from './strings/es/product';
import { reviews } from './strings/es/reviews';
import { salesTerms } from './strings/es/salesTerms';
import { seo } from './strings/es/seo';
import { serviceDisrupted } from './strings/es/serviceDisrupted';
import { sitemapPage } from './strings/es/sitemapPage';
import { terms } from './strings/es/terms';
import { values } from './strings/es/values';

/** Assembled from `strings/es/`, one file per screen. Nothing is authored
 * in this file: edit the namespace file, or use `npm run i18n`. */
export const es: Strings = {
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
