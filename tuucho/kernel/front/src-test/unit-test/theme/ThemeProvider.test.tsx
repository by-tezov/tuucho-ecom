import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContrastPreference, ThemePreference } from '@/theme/types';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/themeContext';

const testState = vi.hoisted(() => ({
  getThemePreference: vi.fn(),
  updateThemePreference: vi.fn(),
  getContrastPreference: vi.fn(),
  updateContrastPreference: vi.fn(),
}));

vi.mock('@/state/AuthContext', () => ({
  useAuthSession: () => ({
    status: 'authenticated',
    user: { id: 'account-a' },
    authedRequest: async <T,>(request: (token: string) => Promise<T>) => request('token'),
  }),
}));
vi.mock('@/api/account', () => ({
  getThemePreference: testState.getThemePreference,
  updateThemePreference: testState.updateThemePreference,
  getContrastPreference: testState.getContrastPreference,
  updateContrastPreference: testState.updateContrastPreference,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function Probe() {
  const { contrastPreference, preference, setContrastPreference, setPreference } = useTheme();
  return (
    <div>
      <output data-testid="preference">{preference}</output>
      <output data-testid="contrast-preference">{contrastPreference}</output>
      <button type="button" onClick={() => setPreference('dark')}>
        Dark
      </button>
      <button type="button" onClick={() => setContrastPreference('more')}>
        More contrast
      </button>
    </div>
  );
}

describe('ThemeProvider reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.getThemePreference.mockResolvedValue({ success: true, theme: null });
    testState.updateThemePreference.mockResolvedValue({ success: true, theme: 'system' });
    testState.getContrastPreference.mockResolvedValue({ success: true, contrast: null });
    testState.updateContrastPreference.mockResolvedValue({ success: true, contrast: 'system' });
    window.localStorage.setItem('psn-theme-preference-v1', 'system');
    window.localStorage.setItem('psn-contrast-preference-v1', 'system');
  });

  it('does not let an older account read overwrite a newer local selection', async () => {
    const remote = deferred<{ theme: ThemePreference | null }>();
    testState.getThemePreference.mockReturnValue(remote.promise);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(testState.getThemePreference).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    await waitFor(() => expect(screen.getByTestId('preference')).toHaveTextContent('dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');

    await act(async () => remote.resolve({ theme: 'light' }));
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(window.localStorage.getItem('psn-theme-preference-v1')).toBe('dark');
  });

  it('keeps a newer enhanced-contrast choice when an older account read finishes', async () => {
    const remote = deferred<{ contrast: ContrastPreference | null }>();
    testState.getContrastPreference.mockReturnValue(remote.promise);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(testState.getContrastPreference).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'More contrast' }));
    await waitFor(() => expect(screen.getByTestId('contrast-preference')).toHaveTextContent('more'));
    expect(document.documentElement.dataset.contrast).toBe('more');

    await act(async () => remote.resolve({ contrast: 'standard' }));
    expect(screen.getByTestId('contrast-preference')).toHaveTextContent('more');
    expect(window.localStorage.getItem('psn-contrast-preference-v1')).toBe('more');
  });
});
