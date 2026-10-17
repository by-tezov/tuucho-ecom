import { Router } from 'express';

export const composeOpsRouter = Router();

composeOpsRouter.get('/', async (_req, res) => {
  res.json({ success: true, compose: { enabled: false } });
});
