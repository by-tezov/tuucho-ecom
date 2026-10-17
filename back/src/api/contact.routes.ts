import { Router } from 'express';
import { contactFormRouter } from '../modules/contact/http/contactForm.router.js';
import { productRequestRouter } from '../modules/contact/http/productRequest.router.js';

export const contactRouter = Router();

contactRouter.use(contactFormRouter);
contactRouter.use(productRequestRouter);
