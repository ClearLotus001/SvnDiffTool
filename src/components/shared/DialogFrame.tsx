import type { CSSProperties, ReactNode } from 'react';

import type { AnimatedVisibilityState } from '@/hooks/ui/useAnimatedVisibility';

interface DialogFrameProps {
  animationState: AnimatedVisibilityState;
  children: ReactNode;
  className: string;
  style?: CSSProperties | undefined;
}

export default function DialogFrame({
  animationState,
  children,
  className,
  style,
}: DialogFrameProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 pointer-events-none">
      <div
        role="dialog"
        aria-modal="true"
        data-state={animationState}
        className={`motion-dialog-surface pointer-events-auto relative ${className}`}
        style={style}>
        {children}
      </div>
    </div>
  );
}
