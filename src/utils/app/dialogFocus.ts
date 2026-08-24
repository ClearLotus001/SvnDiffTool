const DIALOG_FOCUSABLE_SELECTOR = [
  '[data-dialog-initial-focus]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function resolveDialogTabIndex(
  focusableCount: number,
  activeIndex: number,
  shiftKey: boolean,
): number | null {
  if (focusableCount <= 0) return null;
  if (activeIndex < 0 || activeIndex >= focusableCount) {
    return shiftKey ? focusableCount - 1 : 0;
  }
  return (activeIndex + (shiftKey ? -1 : 1) + focusableCount) % focusableCount;
}

export function getDialogFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)]
    .filter((element) => (
      !element.hasAttribute('disabled')
      && element.getAttribute('aria-disabled') !== 'true'
      && element.getAttribute('aria-hidden') !== 'true'
      && !element.hidden
      && element.tabIndex >= 0
    ));
}
