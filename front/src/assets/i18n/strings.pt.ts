import type { Strings } from './types';
import { about } from './strings/pt/about';
import { accessibilityStatement } from './strings/pt/accessibilityStatement';
import { account } from './strings/pt/account';
import { address } from './strings/pt/address';
import { admin } from './strings/pt/admin';
import { appError } from './strings/pt/appError';
import { atelier } from './strings/pt/atelier';
import { auth } from './strings/pt/auth';
import { bootSplash } from './strings/pt/bootSplash';
import { capsules } from './strings/pt/capsules';
import { cart } from './strings/pt/cart';
import { checkoutSessionExpired } from './strings/pt/checkoutSessionExpired';
import { common } from './strings/pt/common';
import { contact } from './strings/pt/contact';
import { customDesign } from './strings/pt/customDesign';
import { faq } from './strings/pt/faq';
import { footer } from './strings/pt/footer';
import { gallery } from './strings/pt/gallery';
import { galleryNail } from './strings/pt/galleryNail';
import { gift } from './strings/pt/gift';
import { guide } from './strings/pt/guide';
import { hero } from './strings/pt/hero';
import { legalNotice } from './strings/pt/legalNotice';
import { loyalty } from './strings/pt/loyalty';
import { nav } from './strings/pt/nav';
import { newArrivals } from './strings/pt/newArrivals';
import { notFound } from './strings/pt/notFound';
import { notifications } from './strings/pt/notifications';
import { onboarding } from './strings/pt/onboarding';
import { order } from './strings/pt/order';
import { ordersPage } from './strings/pt/ordersPage';
import { paymentMethods } from './strings/pt/paymentMethods';
import { platforms } from './strings/pt/platforms';
import { pose } from './strings/pt/pose';
import { poseVideoPage } from './strings/pt/poseVideoPage';
import { privacy } from './strings/pt/privacy';
import { product } from './strings/pt/product';
import { reviews } from './strings/pt/reviews';
import { salesTerms } from './strings/pt/salesTerms';
import { seo } from './strings/pt/seo';
import { serviceDisrupted } from './strings/pt/serviceDisrupted';
import { sitemapPage } from './strings/pt/sitemapPage';
import { terms } from './strings/pt/terms';
import { values } from './strings/pt/values';

/** Assembled from `strings/pt/`, one file per screen. Nothing is authored
 * in this file: edit the namespace file, or use `npm run i18n`. */
export const pt: Strings = {
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
