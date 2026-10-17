import { Router } from 'express';
import { librarySetsRouter } from '../modules/operations/http/librarySets.router.js';
import { libraryVocabularyRouter } from '../modules/operations/http/libraryVocabulary.router.js';

/** OPS-token-gated composition root mounted at /operation/library-import. */
export const libraryImportRouter = Router();

libraryImportRouter.use(libraryVocabularyRouter);
libraryImportRouter.use(librarySetsRouter);
