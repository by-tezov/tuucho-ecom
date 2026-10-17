import { Router } from 'express';
import { buildStorefrontBootstrap } from '../application/storefrontBootstrap.js';

export const storefrontBootstrapRouter = Router();

storefrontBootstrapRouter.get('/storefront/bootstrap', async (_req, res) => {
  const bootstrap = await buildStorefrontBootstrap();
  res.json({ success: true, bootstrap });
});
