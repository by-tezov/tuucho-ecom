import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureGalleryImageGate } from '../../../src/utils/galleryImageGate';
import { useGatedGalleryImage } from '../../../src/hooks/useGatedGalleryImage';

const SMALL_URL = 'https://media.example.test/product/small/photo.webp';
const MODAL_URL = 'https://media.example.test/product/modal/photo.webp';

function Probe() {
  const image = useGatedGalleryImage(SMALL_URL, MODAL_URL);
  return (
    <>
      <output data-testid="status">{image.status}</output>
      <output data-testid="src">{image.src ?? ''}</output>
      <button type="button" onClick={image.onLoad}>
        load
      </button>
      <button type="button" onClick={image.onError}>
        error
      </button>
      <button type="button" onClick={image.retry}>
        retry
      </button>
    </>
  );
}

describe('useGatedGalleryImage', () => {
  beforeEach(() => configureGalleryImageGate(0, 0));
  afterEach(() => configureGalleryImageGate(4, 0));

  it('retries a failed thumbnail, then falls back to the modal image', async () => {
    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId('src')).toHaveTextContent(SMALL_URL));

    fireEvent.click(screen.getByRole('button', { name: 'error' }));
    await waitFor(() => {
      const retryUrl = new URL(screen.getByTestId('src').textContent ?? '');
      expect(`${retryUrl.origin}${retryUrl.pathname}`).toBe(SMALL_URL);
      expect(retryUrl.searchParams.has('__gallery_retry')).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'error' }));
    await waitFor(() => {
      const fallbackUrl = new URL(screen.getByTestId('src').textContent ?? '');
      expect(`${fallbackUrl.origin}${fallbackUrl.pathname}`).toBe(MODAL_URL);
      expect(fallbackUrl.searchParams.has('__gallery_retry')).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'load' }));
    expect(screen.getByTestId('status')).toHaveTextContent('loaded');
  });

  it('settles into a local retry state after bounded failures', async () => {
    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('loading'));
    fireEvent.click(screen.getByRole('button', { name: 'error' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('loading'));
    fireEvent.click(screen.getByRole('button', { name: 'error' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('loading'));
    fireEvent.click(screen.getByRole('button', { name: 'error' }));

    expect(screen.getByTestId('status')).toHaveTextContent('unavailable');
    expect(screen.getByTestId('src')).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('loading');
      const retryUrl = new URL(screen.getByTestId('src').textContent ?? '');
      expect(`${retryUrl.origin}${retryUrl.pathname}`).toBe(SMALL_URL);
      expect(retryUrl.searchParams.has('__gallery_retry')).toBe(true);
    });
  });

  it('does not leave a hung browser request loading forever', async () => {
    configureGalleryImageGate(1, 20);
    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'));
    expect(screen.getByTestId('src')).toBeEmptyDOMElement();
  });
});
