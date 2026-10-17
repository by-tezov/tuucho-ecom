import { shopConfig } from '../../config/env';

/** Design-second duration at authored timing (speed 1). Tagline lands ~4s. */
const BOOT_SPLASH_DESIGN_MS = 5_200;

/** Hold the final frame after motion ends before navigating away (unscaled). */
const BOOT_SPLASH_END_HOLD_MS = 250;

/**
 * Scale a design-time duration (seconds) by `VITE_BOOT_SPLASH_SPEED`.
 * Values &gt; 1 make the intro faster (1.25 ⇒ 1.25× faster).
 */
export function splashSec(designSeconds: number): string {
  return `${designSeconds / shopConfig.bootSplashSpeed}s`;
}

/** Motion window only (scaled) — excludes the end hold. */
function bootSplashAnimationMs(): number {
  return Math.round(BOOT_SPLASH_DESIGN_MS / shopConfig.bootSplashSpeed);
}

/** Pause on the finished composition before SplashEntry navigates away. */
export function bootSplashEndHoldMs(): number {
  return BOOT_SPLASH_END_HOLD_MS;
}

/** Motion + end hold — earliest moment SplashEntry may leave the splash. */
export function bootSplashExitAfterMs(): number {
  return bootSplashAnimationMs() + bootSplashEndHoldMs();
}
