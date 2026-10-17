import { Router } from 'express';
import { galleryCatalogRouter } from '../modules/catalog/http/galleryCatalog.router.js';
import { galleryPreviewRouter } from '../modules/catalog/http/galleryPreview.router.js';
import { seoRenderRouter } from '../modules/catalog/http/seoRender.router.js';
import { vintedReviewsPublicRouter } from './vintedReviews.routes.js';

export const galleryRouter = Router();

galleryRouter.use(galleryCatalogRouter);
galleryRouter.use(galleryPreviewRouter);
galleryRouter.use(vintedReviewsPublicRouter);
galleryRouter.use(seoRenderRouter);
