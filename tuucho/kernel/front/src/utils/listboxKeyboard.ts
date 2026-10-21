import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/** Arrow / Home / End / Tab cycling for a portaled listbox of option buttons. */
export function handleListboxKeyDown(
  event: ReactKeyboardEvent | KeyboardEvent,
  optionElements: HTMLElement[],
  {
    onEscape,
  }: {
    onEscape: () => void;
  },
): void {
  if (!optionElements.length) return;
  const current = optionElements.findIndex((el) => el === document.activeElement);
  const focusAt = (index: number) => {
    const next = ((index % optionElements.length) + optionElements.length) % optionElements.length;
    optionElements[next]?.focus();
  };

  // With nothing focused yet, ArrowDown lands on the first option and ArrowUp
  // on the last — `current + 1` from a placeholder 0 would skip the first one.
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    focusAt(current < 0 ? 0 : current + 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    focusAt(current < 0 ? -1 : current - 1);
  } else if (event.key === 'Home') {
    event.preventDefault();
    focusAt(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    focusAt(optionElements.length - 1);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    onEscape();
  } else if (event.key === 'Tab') {
    event.preventDefault();
    focusAt(event.shiftKey ? (current < 0 ? 0 : current) - 1 : (current < 0 ? -1 : current) + 1);
  }
}

export function focusSelectedOrFirstOption(container: HTMLElement | null): void {
  const selected = container?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
  const first = container?.querySelector<HTMLElement>('[role="option"]');
  (selected ?? first)?.focus();
}
