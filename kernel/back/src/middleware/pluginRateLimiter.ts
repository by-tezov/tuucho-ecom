import type { RequestHandler } from 'express';
import { createRateLimiter, lazyRateLimiter } from '../platform/http/createRateLimiter.js';
import type { RateLimitSpyKind } from '../platform/http/rateLimitSpy.js';
import { pluginSettingBool, pluginSettingRate } from '../modules/plugins/application/pluginSettingValues.js';

export function pluginOwnedRateLimiter(input: {
  pluginId: string;
  rateKey: string;
  fallback: string;
  disableKey: string;
  kind: RateLimitSpyKind;
}): RequestHandler {
  return lazyRateLimiter(() => {
    const { windowMs, limit } = pluginSettingRate(input.pluginId, input.rateKey, input.fallback);
    return createRateLimiter({
      windowMs,
      limit,
      disabled: () => pluginSettingBool(input.pluginId, input.disableKey),
      kind: input.kind,
    });
  });
}
