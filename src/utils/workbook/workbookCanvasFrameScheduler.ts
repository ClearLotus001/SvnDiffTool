export interface WorkbookCanvasScrollFrame {
  scrollTop: number;
  scrollLeft: number;
}

type WorkbookCanvasFrameSubscriber = (frame: WorkbookCanvasScrollFrame) => void;

interface WorkbookCanvasFrameState {
  frameId: number;
  subscribers: Set<WorkbookCanvasFrameSubscriber>;
  handleScroll: () => void;
}

const frameStateByScroller = new WeakMap<HTMLElement, WorkbookCanvasFrameState>();

export function subscribeWorkbookCanvasScrollFrame(
  scroller: HTMLElement,
  subscriber: WorkbookCanvasFrameSubscriber,
): () => void {
  let state = frameStateByScroller.get(scroller);
  if (!state) {
    const subscribers = new Set<WorkbookCanvasFrameSubscriber>();
    state = {
      frameId: 0,
      subscribers,
      handleScroll: () => {
        const current = frameStateByScroller.get(scroller);
        if (!current || current.frameId) return;
        current.frameId = requestAnimationFrame(() => {
          current.frameId = 0;
          const frame = {
            scrollTop: Math.max(0, scroller.scrollTop),
            scrollLeft: Math.max(0, scroller.scrollLeft),
          };
          [...current.subscribers].forEach(callback => callback(frame));
        });
      },
    };
    frameStateByScroller.set(scroller, state);
    scroller.addEventListener('scroll', state.handleScroll, { passive: true });
  }

  state.subscribers.add(subscriber);
  return () => {
    const current = frameStateByScroller.get(scroller);
    if (!current) return;
    current.subscribers.delete(subscriber);
    if (current.subscribers.size > 0) return;
    scroller.removeEventListener('scroll', current.handleScroll);
    if (current.frameId) cancelAnimationFrame(current.frameId);
    frameStateByScroller.delete(scroller);
  };
}
