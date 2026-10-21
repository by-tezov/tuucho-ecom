import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartSummarySticky } from '@/routes/cart/useCartSummarySticky';

type RectBox = { top: number; left: number; width: number; height: number };

let anchorBox: RectBox = { top: 0, left: 0, width: 0, height: 0 };
let resizeCallbacks: ResizeObserverCallback[] = [];

function rectFromBox(box: RectBox): DOMRect {
  return DOMRect.fromRect({ x: box.left, y: box.top, width: box.width, height: box.height });
}

function Harness({ holdHidden, mountAside }: { holdHidden: boolean; mountAside: boolean }) {
  const { summaryAnchorRef, summaryStackRef, mainColRef, summaryPinned, summaryBounds } =
    useCartSummarySticky('anonymous');
  return (
    <div data-cart-hold="" data-testid="hold" style={holdHidden ? { display: 'none' } : undefined}>
      {mountAside ? (
        <div ref={mainColRef} data-testid="main-col">
          <aside ref={summaryAnchorRef} data-testid="anchor">
            <div
              ref={summaryStackRef}
              data-testid="stack"
              data-pinned={summaryPinned ? 'true' : 'false'}
              data-left={summaryPinned && summaryBounds ? String(summaryBounds.left) : ''}
              data-width={summaryPinned && summaryBounds ? String(summaryBounds.width) : ''}
            >
              recap
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function DelayedAside() {
  const [mountAside, setMountAside] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setMountAside(true)}>
        show
      </button>
      <Harness holdHidden={false} mountAside={mountAside} />
    </>
  );
}

describe('useCartSummarySticky', () => {
  beforeEach(() => {
    anchorBox = { top: 0, left: 0, width: 0, height: 0 };
    resizeCallbacks = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallbacks.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === 'anchor') return rectFromBox(anchorBox);
      if (this.dataset.testid === 'main-col') {
        return rectFromBox({
          top: 80,
          left: 24,
          width: 700,
          height: 900,
        });
      }
      return rectFromBox({ top: 0, left: 0, width: 0, height: 0 });
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset.testid === 'stack' ? 320 : 0;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not pin a hidden zero-size recap even when its box sits at the top', async () => {
    render(<Harness holdHidden mountAside />);
    await waitFor(() => {
      expect(screen.getByTestId('stack')).toHaveAttribute('data-pinned', 'false');
    });
  });

  it('remeasures when data-cart-hold becomes visible without a resize', async () => {
    const { rerender } = render(<Harness holdHidden mountAside />);
    await waitFor(() => {
      expect(screen.getByTestId('stack')).toHaveAttribute('data-pinned', 'false');
    });

    anchorBox = { top: 8, left: 820, width: 414, height: 480 };
    rerender(<Harness holdHidden={false} mountAside />);

    await waitFor(() => {
      const stack = screen.getByTestId('stack');
      expect(stack).toHaveAttribute('data-pinned', 'true');
      expect(stack).toHaveAttribute('data-left', '820');
      expect(stack).toHaveAttribute('data-width', '414');
    });
  });

  it('remeasures when a hidden ancestor is shown and the recap gets a real box', async () => {
    const { rerender } = render(<Harness holdHidden mountAside />);
    await waitFor(() => {
      expect(screen.getByTestId('stack')).toHaveAttribute('data-pinned', 'false');
    });

    anchorBox = { top: 8, left: 820, width: 414, height: 480 };
    rerender(<Harness holdHidden={false} mountAside />);

    await act(async () => {
      resizeCallbacks.forEach((callback) => {
        callback([], {} as ResizeObserver);
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      const stack = screen.getByTestId('stack');
      expect(stack).toHaveAttribute('data-pinned', 'true');
      expect(stack).toHaveAttribute('data-left', '820');
      expect(stack).toHaveAttribute('data-width', '414');
    });
  });

  it('attaches measurement when the recap mounts after the first paint', async () => {
    render(<DelayedAside />);
    expect(screen.queryByTestId('stack')).toBeNull();

    anchorBox = { top: 8, left: 820, width: 414, height: 480 };
    await act(async () => {
      screen.getByRole('button', { name: 'show' }).click();
    });

    await waitFor(() => {
      const stack = screen.getByTestId('stack');
      expect(stack).toHaveAttribute('data-pinned', 'true');
      expect(stack).toHaveAttribute('data-width', '414');
    });
  });

  it('reserves the aside height while the recap is pinned', async () => {
    anchorBox = { top: 8, left: 820, width: 414, height: 480 };
    render(<Harness holdHidden={false} mountAside />);

    await waitFor(() => {
      expect(screen.getByTestId('stack')).toHaveAttribute('data-pinned', 'true');
    });
    expect(screen.getByTestId('anchor')).toHaveStyle({ minHeight: '320px' });
  });

  it('stays pinned if the aside collapses after the stack leaves flow', async () => {
    anchorBox = { top: 8, left: 820, width: 414, height: 480 };
    render(<Harness holdHidden={false} mountAside />);
    await waitFor(() => {
      expect(screen.getByTestId('stack')).toHaveAttribute('data-pinned', 'true');
    });

    anchorBox = { top: 8, left: 820, width: 414, height: 0 };
    await act(async () => {
      resizeCallbacks.forEach((callback) => {
        callback([], {} as ResizeObserver);
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('stack')).toHaveAttribute('data-pinned', 'true');
    });
  });
});
