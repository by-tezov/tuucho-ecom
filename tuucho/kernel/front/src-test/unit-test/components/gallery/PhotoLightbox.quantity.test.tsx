import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryItem } from '@/data/types';
import { pressLikeUser, stubFocusableLayout, stubViewport } from '../../helpers/pointerPress';
import { assembleDictionary, ensureLocaleCatalogsLoaded } from '@/plugins/localeCatalog';
import type { Strings } from '@/assets/i18n/types';

let en: Strings;
beforeAll(async () => {
  await ensureLocaleCatalogsLoaded();
  en = assembleDictionary('en', 'all');
});

vi.mock('@/config/env', () => ({
  shopConfig: {
    quantitySelectThreshold: 5,
    siteUrl: 'https://shop.test',
    enabledLanguages: ['en', 'fr'],
  },
}));

vi.mock('@/assets/i18n', () => ({
  useLang: () => ({ lang: 'en', t: en }),
}));

vi.mock('@/hooks/useCart', () => ({
  useCartData: () => ({ cartReady: true, getCartLine: () => undefined }),
  useCartCommands: () => ({ addToCart: vi.fn() }),
}));

vi.mock('@/state/AuthContext', () => ({
  useAuthSession: () => ({ status: 'anonymous', user: null }),
}));

vi.mock('@/hooks/useProductRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useProductRequest')>();
  return {
    ...actual,
    useSubmitProductRequest: () => vi.fn(),
  };
});

vi.mock('@/hooks/useFilterOptions', () => ({
  useFilterOptions: () => undefined,
  useOutOfStockSizeFlags: () => ({ allowSizeRequest: true }),
}));

import { PhotoLightbox } from '@/components/gallery/PhotoLightbox';
import { SizeRequestModal } from '@/components/gallery/SizeRequestModal';

const item: GalleryItem = {
  id: 'product-1',
  occasion: 'everyday',
  shape: { almond: 'Amande' },
  lengthsByShape: { almond: { medium: 'Standard' } },
  colorMain: ['nude'],
  colorSecondary: [],
  title: 'Set test',
  desc: 'Description',
  alt: 'Set test',
  photosByShapeLength: {
    almond: { medium: [{ small: '/small.webp', modal: '/modal.webp' }] },
  },
  productUid: 'AA-BB-001',
  isFeatured: false,
  price: 29,
  available: { almond: { medium: { XS: 0, S: 4, M: 4, L: 0 } } },
};

const lightboxProps = {
  item,
  activeShape: 'almond',
  activeLength: 'medium',
  onSelectShape: () => undefined,
  index: 0,
  onIndexChange: () => undefined,
  alt: 'Set test',
  onClose: vi.fn(),
};

async function renderLightbox() {
  const view = render(
    <MemoryRouter>
      <PhotoLightbox {...lightboxProps} />
    </MemoryRouter>,
  );
  // PhotoLightbox is lazy(); wait past Suspense before querying the dialog.
  await screen.findByTestId('gallery-lightbox');
  return view;
}

/** The trigger's accessible name is the label plus the visible count. */
function quantityTriggerName(): RegExp {
  return new RegExp(`^${en.cart.quantityLabel}, \\d+$`);
}

function quantityTrigger() {
  return screen.getByRole('button', { name: quantityTriggerName(), expanded: false });
}

beforeAll(() => {
  stubFocusableLayout();
});

beforeEach(() => {
  stubViewport('desktop');
  lightboxProps.onClose.mockReset();
});

afterEach(() => {
  stubViewport('desktop');
});

describe('PhotoLightbox quantity picker', () => {
  it('does not focus the close button when the zoom modal opens', async () => {
    stubViewport('desktop');
    await renderLightbox();

    expect(screen.getByTestId('gallery-lightbox-close')).not.toHaveFocus();
    expect(screen.getByTestId('gallery-lightbox')).toHaveFocus();
  });

  it('keeps the zoom modal open and shows the desktop quantity list after a mouse press', async () => {
    stubViewport('desktop');
    await renderLightbox();

    pressLikeUser(quantityTrigger(), 'mouse');

    expect(screen.getByTestId('gallery-lightbox')).toBeVisible();
    const option = await screen.findByRole('option', { name: '2' });
    expect(option).toBeVisible();
    pressLikeUser(option, 'mouse');
    expect(lightboxProps.onClose).not.toHaveBeenCalled();
    expect(quantityTrigger()).toHaveTextContent('2');
  });

  it('keeps the zoom modal open and shows the mobile quantity sheet after a tap', async () => {
    stubViewport('mobile');
    await renderLightbox();

    pressLikeUser(quantityTrigger(), 'touch');

    expect(screen.getByTestId('gallery-lightbox')).toBeVisible();
    const option = await screen.findByRole('option', { name: '2' });
    expect(option).toBeVisible();
    pressLikeUser(option, 'touch');
    expect(lightboxProps.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('gallery-lightbox')).toBeVisible();
  });

  it('keeps the size-request modal open after tapping quantity on mobile', async () => {
    stubViewport('mobile');
    await renderLightbox();

    // A sold-out size names its state for screen readers ("XS, Épuisé").
    pressLikeUser(screen.getByRole('button', { name: `XS, ${en.product.outOfStock}` }), 'touch');
    const requestModal = await screen.findByTestId('gallery-size-request-modal');

    pressLikeUser(
      within(requestModal).getByRole('button', { name: quantityTriggerName(), expanded: false }),
      'touch',
    );

    await waitFor(() => {
      expect(screen.getByTestId('gallery-size-request-modal')).toBeVisible();
      expect(screen.getByTestId('gallery-lightbox')).toBeVisible();
    });
    const option = await screen.findByRole('option', { name: '2' });
    expect(option).toBeVisible();
    pressLikeUser(option, 'touch');
    expect(lightboxProps.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('gallery-size-request-modal')).toBeVisible();
    expect(screen.getByTestId('gallery-lightbox')).toBeVisible();
  });

  it('closes the zoom modal when adding to cart', async () => {
    stubViewport('desktop');
    await renderLightbox();

    pressLikeUser(screen.getByTestId('gallery-lightbox-add'), 'mouse');

    await waitFor(() => {
      expect(lightboxProps.onClose).toHaveBeenCalled();
    });
  });

  it('keeps the size-request modal open after pressing quantity on desktop', async () => {
    stubViewport('desktop');
    render(
      <MemoryRouter>
        <SizeRequestModal
          productId={item.id}
          shapeKey="almond"
          lengthKey="medium"
          photo="/small.webp"
          title={item.title}
          shapeLabel="Amande"
          lengthLabel="Standard"
          initialSize="XS"
          onClose={() => undefined}
        />
      </MemoryRouter>,
    );

    pressLikeUser(quantityTrigger(), 'mouse');

    expect(screen.getByTestId('gallery-size-request-modal')).toBeVisible();
    const option = await screen.findByRole('option', { name: '2' });
    expect(option).toBeVisible();
    pressLikeUser(option, 'mouse');
    expect(quantityTrigger()).toHaveTextContent('2');
  });
});
