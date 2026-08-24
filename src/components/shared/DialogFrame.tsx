import {
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import type { AnimatedVisibilityState } from '@/hooks/ui/useAnimatedVisibility';
import {
  getDialogFocusableElements,
  resolveDialogTabIndex,
} from '@/utils/app/dialogFocus';

let lastNonDialogFocus: HTMLElement | null = null;

interface DialogFrameProps {
  animationState: AnimatedVisibilityState;
  children?: ReactNode;
  className: string;
  titleId: string;
  descriptionId?: string | undefined;
  onClose: () => void;
  style?: CSSProperties | undefined;
}

export default function DialogFrame({
  animationState,
  children,
  className,
  titleId,
  descriptionId,
  onClose,
  style,
}: DialogFrameProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const focusSessionActiveRef = useRef(false);
  const isExiting = animationState === 'exiting';

  const restorePreviousFocus = useCallback(() => {
    if (!focusSessionActiveRef.current) return;
    focusSessionActiveRef.current = false;
    const previousFocus = previousFocusRef.current;
    previousFocusRef.current = null;
    if (previousFocus?.isConnected) previousFocus.focus();
  }, []);

  useLayoutEffect(() => {
    if (isExiting) {
      restorePreviousFocus();
      return undefined;
    }
    if (focusSessionActiveRef.current || typeof document === 'undefined') return undefined;

    focusSessionActiveRef.current = true;
    const activeElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (activeElement && !activeElement.closest('[role="dialog"]')) {
      lastNonDialogFocus = activeElement;
    }
    previousFocusRef.current = lastNonDialogFocus;
    const frameId = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const initialFocus = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')
        ?? getDialogFocusableElements(dialog)[0]
        ?? dialog;
      initialFocus.focus();
    });
    return () => cancelAnimationFrame(frameId);
  }, [isExiting, restorePreviousFocus]);

  useEffect(() => () => restorePreviousFocus(), [restorePreviousFocus]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableElements = getDialogFocusableElements(dialog);
    const activeIndex = document.activeElement instanceof HTMLElement
      ? focusableElements.indexOf(document.activeElement)
      : -1;
    const nextIndex = resolveDialogTabIndex(
      focusableElements.length,
      activeIndex,
      event.shiftKey,
    );
    event.preventDefault();
    if (nextIndex == null) dialog.focus();
    else focusableElements[nextIndex]?.focus();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 pointer-events-none">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-hidden={isExiting ? 'true' : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        data-state={animationState}
        className={`motion-dialog-surface relative ${isExiting ? 'pointer-events-none' : 'pointer-events-auto'} ${className}`}
        style={style}>
        {children}
      </div>
    </div>
  );
}
