/** Admin edits of courier texts, delivery times, packet prices and parcel
 * sizes. Rows are not created or deleted here. Enable flags stay on
 * preferences. */
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { CourierCatalogError } from '../domain/courierCatalog.js';
import {
  readCourierCatalog,
  writeCourierCatalogCountry,
  writeCourierCatalogCourier,
  writeCourierCatalogMeasurements,
  writeCourierCatalogNetwork,
} from './courierCatalogSupport.js';

export const adminCourierCatalogRouter = Router();

const gate = [requireAuth, requirePermission('courier_edit')] as const;

function fail(res: Response, error: unknown): boolean {
  if (!(error instanceof CourierCatalogError)) return false;
  const code = error.status === 404 ? 'not_found' : 'invalid_request';
  res.status(error.status).json({ success: false, error: { code, message: error.message } });
  return true;
}

function param(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : '';
}

adminCourierCatalogRouter.get('/courier-catalog', ...gate, async (_req, res, next) => {
  try {
    res.json({ success: true, ...(await readCourierCatalog()) });
  } catch (error) {
    next(error);
  }
});

adminCourierCatalogRouter.put('/courier-catalog/couriers/:courierCode', ...gate, async (req, res, next) => {
  try {
    await writeCourierCatalogCourier(req.user!, param(req, 'courierCode'), req.body);
    res.json({ success: true });
  } catch (error) {
    if (!fail(res, error)) next(error);
  }
});

adminCourierCatalogRouter.put('/courier-catalog/countries/:countryCode', ...gate, async (req, res, next) => {
  try {
    await writeCourierCatalogCountry(req.user!, param(req, 'countryCode'), req.body);
    res.json({ success: true });
  } catch (error) {
    if (!fail(res, error)) next(error);
  }
});

adminCourierCatalogRouter.put('/courier-catalog/networks/:networkCode', ...gate, async (req, res, next) => {
  try {
    await writeCourierCatalogNetwork(req.user!, param(req, 'networkCode'), req.body);
    res.json({ success: true });
  } catch (error) {
    if (!fail(res, error)) next(error);
  }
});

adminCourierCatalogRouter.put('/courier-catalog/measurements', ...gate, async (req, res, next) => {
  try {
    await writeCourierCatalogMeasurements(req.user!, req.body);
    res.json({ success: true });
  } catch (error) {
    if (!fail(res, error)) next(error);
  }
});
