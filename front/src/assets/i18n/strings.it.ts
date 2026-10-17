import type { Strings } from './types';
import { about } from './strings/it/about';
import { accessibilityStatement } from './strings/it/accessibilityStatement';
import { account } from './strings/it/account';
import { address } from './strings/it/address';
import { admin } from './strings/it/admin';
import { appError } from './strings/it/appError';
import { atelier } from './strings/it/atelier';
import { auth } from './strings/it/auth';
import { bootSplash } from './strings/it/bootSplash';
import { capsules } from './strings/it/capsules';
import { cart } from './strings/it/cart';
import { checkoutSessionExpired } from './strings/it/checkoutSessionExpired';
import { common } from './strings/it/common';
import { contact } from './strings/it/contact';
import { customDesign } from './strings/it/customDesign';
import { faq } from './strings/it/faq';
import { footer } from './strings/it/footer';
import { gallery } from './strings/it/gallery';
import { galleryNail } from './strings/it/galleryNail';
import { gift } from './strings/it/gift';
import { guide } from './strings/it/guide';
import { hero } from './strings/it/hero';
import { legalNotice } from './strings/it/legalNotice';
import { loyalty } from './strings/it/loyalty';
import { nav } from './strings/it/nav';
import { newArrivals } from './strings/it/newArrivals';
import { notFound } from './strings/it/notFound';
import { notifications } from './strings/it/notifications';
import { onboarding } from './strings/it/onboarding';
import { order } from './strings/it/order';
import { ordersPage } from './strings/it/ordersPage';
import { paymentMethods } from './strings/it/paymentMethods';
import { platforms } from './strings/it/platforms';
import { pose } from './strings/it/pose';
import { poseVideoPage } from './strings/it/poseVideoPage';
import { privacy } from './strings/it/privacy';
import { product } from './strings/it/product';
import { reviews } from './strings/it/reviews';
import { salesTerms } from './strings/it/salesTerms';
import { seo } from './strings/it/seo';
import { serviceDisrupted } from './strings/it/serviceDisrupted';
import { sitemapPage } from './strings/it/sitemapPage';
import { terms } from './strings/it/terms';
import { values } from './strings/it/values';

/** Assembled from `strings/it/`, one file per screen. Nothing is authored
 * in this file: edit the namespace file, or use `npm run i18n`. */
export const it: Strings = {
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
