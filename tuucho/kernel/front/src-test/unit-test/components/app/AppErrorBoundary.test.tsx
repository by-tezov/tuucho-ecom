import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from '@/components/app/AppErrorBoundary';

const reportClientError = vi.hoisted(() => vi.fn());

vi.mock('@/assets/i18n', () => ({
  useLang: () => ({
    t: {
      appError: {
        title: 'Something went wrong',
        message: 'The page could not be displayed.',
        retry: 'Try again',
      },
    },
  }),
}));
vi.mock('@/observability/clientError', () => ({ reportClientError }));

let shouldThrow = true;

function RecoverableChild() {
  if (shouldThrow) throw new Error('private implementation detail');
  return <p>Recovered</p>;
}

afterEach(() => {
  shouldThrow = true;
  reportClientError.mockReset();
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('shows localized recovery UI, reports safely, and retries its children', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <RecoverableChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(reportClientError).toHaveBeenCalledWith('render');
    expect(reportClientError).toHaveBeenCalledTimes(1);

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});
