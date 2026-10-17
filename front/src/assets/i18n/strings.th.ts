import type { Strings } from './types';
import { about } from './strings/th/about';
import { accessibilityStatement } from './strings/th/accessibilityStatement';
import { account } from './strings/th/account';
import { address } from './strings/th/address';
import { admin } from './strings/th/admin';
import { appError } from './strings/th/appError';
import { atelier } from './strings/th/atelier';
import { auth } from './strings/th/auth';
import { bootSplash } from './strings/th/bootSplash';
import { capsules } from './strings/th/capsules';
import { cart } from './strings/th/cart';
import { checkoutSessionExpired } from './strings/th/checkoutSessionExpired';
import { common } from './strings/th/common';
import { contact } from './strings/th/contact';
import { customDesign } from './strings/th/customDesign';
import { faq } from './strings/th/faq';
import { footer } from './strings/th/footer';
import { gallery } from './strings/th/gallery';
import { galleryNail } from './strings/th/galleryNail';
import { gift } from './strings/th/gift';
import { guide } from './strings/th/guide';
import { hero } from './strings/th/hero';
import { legalNotice } from './strings/th/legalNotice';
import { loyalty } from './strings/th/loyalty';
import { nav } from './strings/th/nav';
import { newArrivals } from './strings/th/newArrivals';
import { notFound } from './strings/th/notFound';
import { notifications } from './strings/th/notifications';
import { onboarding } from './strings/th/onboarding';
import { order } from './strings/th/order';
import { ordersPage } from './strings/th/ordersPage';
import { paymentMethods } from './strings/th/paymentMethods';
import { platforms } from './strings/th/platforms';
import { pose } from './strings/th/pose';
import { poseVideoPage } from './strings/th/poseVideoPage';
import { privacy } from './strings/th/privacy';
import { product } from './strings/th/product';
import { reviews } from './strings/th/reviews';
import { salesTerms } from './strings/th/salesTerms';
import { seo } from './strings/th/seo';
import { serviceDisrupted } from './strings/th/serviceDisrupted';
import { sitemapPage } from './strings/th/sitemapPage';
import { terms } from './strings/th/terms';
import { values } from './strings/th/values';

/** Assembled from `strings/th/`, one file per screen. Nothing is authored
 * in this file: edit the namespace file, or use `npm run i18n`. */
export const th: Strings = {
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
