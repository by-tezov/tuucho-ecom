import { Router } from 'express';
import { courierPacketsRouter } from '../modules/operations/http/courierPackets.router.js';
import { courierRecordsRouter } from '../modules/operations/http/courierRecords.router.js';
import { courierVocabularyRouter } from '../modules/operations/http/courierVocabulary.router.js';

export const courierImportRouter = Router();

courierImportRouter.use(courierPacketsRouter);
courierImportRouter.use(courierVocabularyRouter);
courierImportRouter.use(courierRecordsRouter);
