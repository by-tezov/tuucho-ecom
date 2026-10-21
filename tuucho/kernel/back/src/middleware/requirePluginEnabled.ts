import type { NextFunction, Request, Response } from 'express';
import { isPluginEffectivelyEnabled } from '../modules/plugins/application/pluginStore.js';

/** 404 `plugin_disabled` when the plugin (or a dependsOn parent) is off. */
export function requirePluginEnabled(id: string) {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!(await isPluginEffectivelyEnabled(id))) {
      res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
      return;
    }
    next();
  };
}
