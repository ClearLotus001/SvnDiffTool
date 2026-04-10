import { useEffect, useState, type RefObject } from 'react';

export default function useElementWidth<T extends HTMLElement>(
  ref: RefObject<T | null>,
  fallbackWidth = 1600,
) {
  const [width, setWidth] = useState(fallbackWidth);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const updateWidth = (nextWidth: number) => {
      const roundedWidth = Math.max(0, Math.round(nextWidth));
      setWidth((currentWidth) => (currentWidth === roundedWidth ? currentWidth : roundedWidth));
    };

    updateWidth(node.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateWidth(entry.contentRect.width);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [fallbackWidth, ref]);

  return width;
}
