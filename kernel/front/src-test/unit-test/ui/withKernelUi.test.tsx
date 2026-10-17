import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorefrontPlugin } from '@/plugins/types';
import {
  registerUiComponent,
  resetUiRegistry,
  withKernelUi,
  type UiComponent,
} from '@/ui/registry';

const { pluginsRef } = vi.hoisted(() => ({
  pluginsRef: { current: [] as StorefrontPlugin[] },
}));

vi.mock('@/plugins/StorefrontBootstrap', () => ({
  useStorefrontBootstrap: () => ({ plugins: pluginsRef.current }),
}));

function DefaultMark() {
  return <span>kernel-default</span>;
}

function ThemeMark() {
  return <span>theme-button</span>;
}

afterEach(() => {
  resetUiRegistry();
  pluginsRef.current = [];
});

describe('withKernelUi', () => {
  it('renders the kernel default when no replace is enabled', () => {
    const Bound = withKernelUi('ui.Probe', DefaultMark);
    render(<Bound />);
    expect(screen.getByText('kernel-default')).toBeInTheDocument();
  });

  it('renders an enabled replace so kernel call sites restyle', () => {
    const Bound = withKernelUi('ui.Probe', DefaultMark);
    registerUiComponent('ui.Probe', ThemeMark as UiComponent, { pluginId: 'theme', replace: true });
    pluginsRef.current = [
      {
        id: 'theme',
        enabled: true,
        kind: 'theme',
        required: true,
        name: 'Default theme',
      },
    ];
    render(<Bound />);
    expect(screen.getByText('theme-button')).toBeInTheDocument();
    expect(screen.queryByText('kernel-default')).not.toBeInTheDocument();
  });
});
