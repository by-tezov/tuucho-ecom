/** Manager-shaped product JSON for the admin catalogue editor. */
export {
  CatalogueDocumentError,
  emptyCatalogueTemplate,
  formatCatalogueJson,
  orderDocumentKeys,
  catalogueAudience,
  cataloguePermission,
  catalogueProductType,
  parseAdminCatalogue,
  ref,
  unref,
  type AdminCatalogue,
  type CatalogueDocument,
  type CataloguePhotoSlot,
} from './catalogueDocumentTypes.js';

export { documentToImportBody, extractPhotoSlots } from './catalogueDocumentParse.js';
export { listRowToDocument, type CatalogueSourceRow } from './catalogueDocumentSerialize.js';
export { isBlankProductUid, pickUnusedProductUid, randomProductUid } from './catalogueProductUid.js';
