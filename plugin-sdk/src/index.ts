export {
  addAction,
  addFilter,
  applyFilters,
  doAction,
  listedActionNames,
  listedFilterNames,
  resetHooks,
  type FilterFn,
  type HookFn,
} from './hooks.js';

export {
  getPluginService,
  listedPluginServices,
  peekPluginService,
  registerPluginService,
  resetPluginServices,
  unregisterPluginService,
} from './services.js';

export {
  getPaymentGateway,
  getPaymentGatewayForMethod,
  isPaymentGatewayRegistered,
  listHttpMounts,
  listPaymentGateways,
  listShippingMethods,
  getShippingMethod,
  registerHttpMount,
  registerPaymentGateway,
  registerShippingMethod,
  registeredCourierCodes,
  resetShells,
  unregisterPaymentGateway,
} from './shells.js';

export {
  CORE_FRONT_SLOTS,
  CORE_FRONT_VIEWS,
  CORE_OPENING_FILTERS,
  appendSpyChannel,
  type CheckoutCartRulesState,
  type CheckoutQuote,
  type CheckoutQuoteContext,
  type CheckoutVoucher,
  type CoreOpeningEntry,
  type DependsOnMode,
  type ExtraLine,
  type HttpMount,
  type InvoiceCopy,
  type InvoiceDocumentOverride,
  type InvoiceFingerLabels,
  type InvoiceRenderState,
  type InvoiceThemeTokens,
  type MailTemplateMessage,
  type OrderPluginSnapshot,
  type PaymentGateway,
  type PluginAdminNavItem,
  type PluginDependency,
  type PluginFrontMount,
  type PluginKind,
  type PluginManifest,
  type PluginSettingField,
  type Review,
  type ReviewsContract,
  type ShippingMethod,
  type SpyChannelDeclaration,
  type SpyChannelFilter,
  type SpyResolveState,
  type StorefrontPageContract,
  type ThemeContract,
  type ThemeTokens,
} from './contracts.js';

export {
  flushPluginCache,
  pluginCacheNamespace,
  resetPluginCache,
  setPluginCacheSealer,
  type PluginCacheNamespace,
  type PluginCacheSensitivity,
  type PluginCacheSetOptions,
} from './cache.js';

export {
  getMailTemplate,
  listMailTemplates,
  registerMailTemplate,
  resetMailTemplates,
  type MailTemplateFn,
} from './mail.js';

export {
  enqueuePluginMailJob,
  resetMailSender,
  sendPluginMail,
  sendPluginTemplatedMail,
  setMailSender,
  type PluginMailMessage,
  type PluginMailSender,
  type PluginTemplatedMail,
} from './mailSend.js';

export { getEmailCatalog, localizedCatalog, registerEmailCatalog, resetEmailCatalogs } from './locale.js';

import { addAction, addFilter } from './hooks.js';
import { registerPluginService } from './services.js';
import { registerHttpMount, registerPaymentGateway, registerShippingMethod } from './shells.js';
import { pluginCacheNamespace } from './cache.js';
import { registerMailTemplate } from './mail.js';
import { enqueuePluginMailJob, sendPluginMail, sendPluginTemplatedMail } from './mailSend.js';
import { registerEmailCatalog } from './locale.js';
import type { HttpMount, PluginManifest } from './contracts.js';
import type { PluginCacheNamespace } from './cache.js';
import type { MailTemplateFn } from './mail.js';
import type { PluginMailMessage, PluginTemplatedMail } from './mailSend.js';

/** Object the plugin host passes to `register()`. */
export interface PluginRegisterApi {
  pluginId: string;
  manifest: PluginManifest;
  addFilter: typeof addFilter;
  addAction: typeof addAction;
  registerPluginService: typeof registerPluginService;
  registerPaymentGateway: typeof registerPaymentGateway;
  registerShippingMethod: typeof registerShippingMethod;
  registerHttpMount: (mount: Omit<HttpMount, 'pluginId'>) => void;
  cache: PluginCacheNamespace;
  registerMailTemplate: (id: string, render: MailTemplateFn) => void;
  registerEmailCatalog: (lang: string, catalog: unknown) => void;
  /** Kernel mail shell. Plugins never own SMTP. */
  sendMail: (message: PluginMailMessage) => Promise<void>;
  sendTemplatedMail: (input: PluginTemplatedMail) => Promise<void>;
  enqueueMailJob: (kind: string, payload: Record<string, unknown>) => Promise<string>;
}

export function createPluginRegisterApi(pluginId: string, manifest: PluginManifest): PluginRegisterApi {
  return {
    pluginId,
    manifest,
    addFilter,
    addAction,
    registerPluginService,
    registerPaymentGateway,
    registerShippingMethod,
    registerHttpMount: (mount) => registerHttpMount({ ...mount, pluginId }),
    cache: pluginCacheNamespace(pluginId),
    registerMailTemplate,
    registerEmailCatalog,
    sendMail: sendPluginMail,
    sendTemplatedMail: sendPluginTemplatedMail,
    enqueueMailJob: enqueuePluginMailJob,
  };
}

export type PluginRegisterFn = (api: PluginRegisterApi) => void | Promise<void>;
