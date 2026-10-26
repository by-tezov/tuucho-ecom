import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlotPropsContext, useSlotProps } from '@/plugins/slotProps';

function Probe() {
  const props = useSlotProps<{ product?: { id: string } }>();
  return <span data-testid="probe">{props.product?.id ?? 'none'}</span>;
}

describe('useSlotProps', () => {
  it('reads the record the hosting surface published', () => {
    render(
      <SlotPropsContext.Provider value={{ product: { id: 'p1' } }}>
        <Probe />
      </SlotPropsContext.Provider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('p1');
  });

  it('defaults to an empty record outside any provider, so legacy slots keep working', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('none');
  });

  it('sees the latest value when the provider re-renders with new props', () => {
    const { rerender } = render(
      <SlotPropsContext.Provider value={{ product: { id: 'p1' } }}>
        <Probe />
      </SlotPropsContext.Provider>,
    );
    rerender(
      <SlotPropsContext.Provider value={{ product: { id: 'p2' } }}>
        <Probe />
      </SlotPropsContext.Provider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('p2');
  });
});
