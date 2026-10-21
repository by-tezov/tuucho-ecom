import { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getFocusableElements, useFocusTrap } from '@/hooks/useFocusTrap';

beforeAll(() => {
  // JSDOM has no layout. The production hook intentionally ignores hidden
  // controls, so give test controls a visible layout box.
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1,
  });
});

function Dialog({
  onClose,
  initialFocusClose,
  initialFocusConfirm,
  label = 'Dialog',
}: {
  onClose: () => void;
  initialFocusClose?: boolean;
  initialFocusConfirm?: boolean;
  label?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(dialogRef, {
    onEscape: onClose,
    initialFocusRef: initialFocusClose ? closeRef : initialFocusConfirm ? confirmRef : undefined,
  });
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label}>
      <button ref={closeRef} type="button" className="closeButton" data-testid={`${label}-close`}>
        {`${label} close`}
      </button>
      <button ref={confirmRef} type="button">
        {`${label} confirm`}
      </button>
    </div>
  );
}

function tab(target: Element, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('useFocusTrap', () => {
  it('parks opening focus on the shell, cycles Tab, and restores the opener', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <>
        <button type="button">Open</button>
      </>,
    );
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();

    rerender(
      <>
        <button type="button">Open</button>
        <Dialog onClose={onClose} />
      </>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(dialog).toHaveAttribute('data-focus-shell');
    expect(screen.getByRole('button', { name: 'Dialog confirm' })).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'Dialog close' })).not.toHaveFocus();

    expect(getFocusableElements(dialog)).toHaveLength(2);
    // From the shell, Tab enters the dialog and Shift+Tab wraps to its end:
    // neither may fall through to the page behind.
    expect(tab(dialog).defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: 'Dialog close' })).toHaveFocus();
    dialog.focus();
    expect(tab(dialog, true).defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: 'Dialog confirm' })).toHaveFocus();

    const confirm = screen.getByRole('button', { name: 'Dialog confirm' });
    expect(tab(confirm).defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: 'Dialog close' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    rerender(
      <>
        <button type="button">Open</button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('never gives opening focus to the close button, even when it is passed as initialFocusRef', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} initialFocusClose />);
    expect(screen.getByTestId('Dialog-close')).not.toHaveFocus();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('a dialog opened over another owns Tab and Escape alone', () => {
    const onCloseBehind = vi.fn();
    const onCloseFront = vi.fn();
    render(
      <>
        <Dialog label="Behind" onClose={onCloseBehind} />
        <Dialog label="Front" onClose={onCloseFront} />
      </>,
    );
    const frontClose = screen.getByRole('button', { name: 'Front close' });
    const frontConfirm = screen.getByRole('button', { name: 'Front confirm' });

    // Tab from the close button is left to the browser (next control in the
    // front dialog): the dialog behind must not pull focus back out of it.
    frontClose.focus();
    expect(tab(frontClose).defaultPrevented).toBe(false);
    expect(frontClose).toHaveFocus();

    // Wrapping happens inside the front dialog only.
    frontConfirm.focus();
    expect(tab(frontConfirm).defaultPrevented).toBe(true);
    expect(frontClose).toHaveFocus();

    fireEvent.keyDown(frontClose, { key: 'Escape' });
    expect(onCloseFront).toHaveBeenCalledOnce();
    expect(onCloseBehind).not.toHaveBeenCalled();
  });

  it('leaves Tab and Escape to a control that already handled them', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    const confirm = screen.getByRole('button', { name: 'Dialog confirm' });
    confirm.focus();
    // A portaled option list prevents the default as it moves focus itself.
    const handled = (event: KeyboardEvent) => event.preventDefault();
    confirm.addEventListener('keydown', handled);
    tab(confirm);
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    confirm.removeEventListener('keydown', handled);
  });

  it('honours an explicit non-dismiss initialFocusRef', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} initialFocusConfirm />);
    expect(screen.getByRole('button', { name: 'Dialog confirm' })).toHaveFocus();
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-focus-shell');
  });
});
