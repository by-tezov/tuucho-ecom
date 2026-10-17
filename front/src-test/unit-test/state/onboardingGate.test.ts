import { beforeEach, describe, expect, it, vi } from 'vitest';

type OnboardingGateModule = typeof import('../../../src/state/onboardingGate');
let gate: OnboardingGateModule;

beforeEach(async () => {
  vi.resetModules();
  gate = await import('../../../src/state/onboardingGate');
});

describe('onboarding gate', () => {
  it('persists guest completion locally', () => {
    expect(gate.isLocalOnboardingCompleted()).toBe(false);
    gate.markLocalOnboardingCompleted();
    expect(gate.isLocalOnboardingCompleted()).toBe(true);
  });

  it('consumes a replay request exactly once and notifies subscribers', () => {
    const listener = vi.fn();
    gate.subscribeOnboardingGate(listener);
    gate.requestOnboardingReplay();
    expect(gate.isOnboardingReplayRequested()).toBe(true);
    expect(gate.consumeOnboardingReplay()).toBe(true);
    expect(gate.consumeOnboardingReplay()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps the tour closed during a shared product visit until the visitor leaves the gallery', () => {
    gate.syncProductShareOnboardingDeferral('/fr/gallery', '?product=AB-CD-001');
    expect(gate.isOnboardingDeferredForProductShare()).toBe(true);

    gate.syncProductShareOnboardingDeferral('/fr/gallery', '');
    expect(gate.isOnboardingDeferredForProductShare()).toBe(true);

    gate.syncProductShareOnboardingDeferral('/fr/cart', '');
    expect(gate.isOnboardingDeferredForProductShare()).toBe(false);
  });

  it('treats the single-nail share link like a set share link', () => {
    gate.syncProductShareOnboardingDeferral('/en/gallery-nail', '?product=AB-CD-001&variation=x');
    gate.syncProductShareOnboardingDeferral('/en/gallery-nail', '');
    expect(gate.isOnboardingDeferredForProductShare()).toBe(true);
  });
});
