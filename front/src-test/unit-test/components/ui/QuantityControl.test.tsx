import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pressLikeUser, stubFocusableLayout, stubViewport } from '../../helpers/pointerPress';

vi.mock('../../../../src/config/env', () => ({
  shopConfig: { quantitySelectThreshold: 5 },
}));

import { QuantityControl } from '../../../../src/components/ui/QuantityControl';

const labels = {
  ariaLabel: 'Quantité',
  decreaseAria: 'Diminuer la quantité',
  increaseAria: 'Augmenter la quantité',
};

function StatefulQuantity() {
  const [value, setValue] = useState(1);
  return (
    <QuantityControl
      value={value}
      max={8}
      onChange={setValue}
      ariaLabel={labels.ariaLabel}
      decreaseAria={labels.decreaseAria}
      increaseAria={labels.increaseAria}
    />
  );
}

beforeAll(() => {
  stubFocusableLayout();
});

beforeEach(() => {
  stubViewport('desktop');
});

afterEach(() => {
  stubViewport('desktop');
});

describe('QuantityControl picker', () => {
  it('opens the desktop dropdown after a mouse press, keeps it open, and accepts a press on 2', async () => {
    stubViewport('desktop');
    render(<StatefulQuantity />);

    const trigger = screen.getByRole('button', { name: `${labels.ariaLabel}, 1` });
    pressLikeUser(trigger, 'mouse');

    const option = await screen.findByRole('option', { name: '2' });
    expect(option).toBeVisible();
    pressLikeUser(option, 'mouse');

    expect(screen.queryByRole('listbox', { name: labels.ariaLabel })).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('2');
    // The visible count stays part of the accessible name.
    expect(trigger).toHaveAccessibleName(`${labels.ariaLabel}, 2`);
  });

  it('opens the mobile quantity sheet after a tap, keeps it open, and accepts a tap on 2', async () => {
    stubViewport('mobile');
    render(<StatefulQuantity />);

    const trigger = screen.getByRole('button', { name: `${labels.ariaLabel}, 1` });
    pressLikeUser(trigger, 'touch');

    const option = await screen.findByRole('option', { name: '2' });
    expect(option).toBeVisible();
    pressLikeUser(option, 'touch');

    expect(trigger).toHaveTextContent('2');
  });
});
