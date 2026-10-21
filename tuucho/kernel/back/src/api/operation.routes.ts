import { Router } from 'express';
import { operationAccountsRouter } from '../modules/operations/http/operationAccounts.router.js';
import { operationDatabaseRouter } from '../modules/operations/http/operationDatabase.router.js';
import { operationLogsRouter } from '../modules/operations/http/operationLogs.router.js';
import { operationMaintenanceRouter } from '../modules/operations/http/operationMaintenance.router.js';
import { operationOrdersRouter } from '../modules/operations/http/operationOrders.router.js';
import { operationEmailFolderRouter } from '../modules/operations/http/operationEmailFolder.router.js';
import { operationRelaxRateLimitsRouter } from '../modules/operations/http/operationRelaxRateLimits.router.js';
import { operationActivityRouter } from '../modules/activity/http/operationActivity.router.js';

export const operationRouter = Router();

operationRouter.use(operationActivityRouter);
operationRouter.use(operationLogsRouter);
operationRouter.use(operationDatabaseRouter);
operationRouter.use(operationMaintenanceRouter);
operationRouter.use(operationAccountsRouter);
operationRouter.use(operationOrdersRouter);
operationRouter.use(operationEmailFolderRouter);
operationRouter.use(operationRelaxRateLimitsRouter);
