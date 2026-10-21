import { Router, type NextFunction, type Request, type Response } from 'express';
import { listHttpMounts, type HttpMount } from '@tuucho/plugin-sdk';

/** Dispatch into routers registered by loaded plugins. Re-reads the shell
 * on every request so enable/disable takes effect without restarting.
 * Express strips each mount path, same as `app.use('/gift', router)`. */
export function pluginHttpMiddleware(scope: HttpMount['scope']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const mounts = listHttpMounts().filter((mount) => mount.scope === scope);
    if (mounts.length === 0) {
      next();
      return;
    }
    const layer = Router();
    for (const mount of mounts) {
      layer.use(mount.path || '/', mount.router as Router);
    }
    layer(req, res, next);
  };
}
