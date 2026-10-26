import type { Strings } from '@kernel/front/assets/i18n/types';
import { common } from './strings/common';
import { checkoutSessionExpired } from './strings/checkoutSessionExpired';
import { bootSplash } from './strings/bootSplash';
import { seo } from './strings/seo';
import { notFound } from './strings/notFound';
import { appError } from './strings/appError';
import { serviceDisrupted } from './strings/serviceDisrupted';
import { nav } from './strings/nav';
import { footer } from './strings/footer';
import { product } from './strings/product';
import { gallery } from './strings/gallery';
import { cart } from './strings/cart';
import { ordersPage } from './strings/ordersPage';
import { order } from './strings/order';
import { auth } from './strings/auth';
import { account } from './strings/account';
import { admin } from './strings/admin';
import { paymentMethods } from './strings/paymentMethods';
import { notifications } from './strings/notifications';
import { address } from './strings/address';
import { contact } from './strings/contact';
import { sitemapPage } from './strings/sitemapPage';

/** English values for kernel chrome keys. */
export const catalog: Partial<Strings> = {
  skip: common.skip,
  skipFooter: common.skipFooter,
  backLink: common.backLink,
  brandAria: common.brandAria,
  navAria: common.navAria,
  menuOpenAria: common.menuOpenAria,
  menuCloseAria: common.menuCloseAria,
  newWindowAria: common.newWindowAria,
  continueAction: common.continueAction,
  requiredFieldsNote: common.requiredFieldsNote,
  languageSwitcherLabel: common.languageSwitcherLabel,
  checkoutSessionExpired,
  bootSplash,
  seo,
  notFound,
  appError,
  serviceDisrupted,
  nav,
  footer,
  product,
  gallery,
  cart,
  ordersPage,
  order,
  auth,
  account,
  admin,
  paymentMethods,
  notifications,
  address,
  contact,
  sitemapPage,
};
