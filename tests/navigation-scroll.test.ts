import assert from 'node:assert/strict';
import test from 'node:test';

import {
  easeNavigationScroll,
  easeResponsiveFocusScroll,
  getNavigationScrollDuration,
  getResponsiveFocusScrollDuration,
  scrollElementForNavigation,
} from '../src/utils/navigation/animatedScroll';

test('navigation scroll easing has a gentle, exact start and finish', () => {
  assert.equal(easeNavigationScroll(-1), 0);
  assert.equal(easeNavigationScroll(0), 0);
  assert.equal(easeNavigationScroll(0.5), 0.5);
  assert.equal(easeNavigationScroll(1), 1);
  assert.equal(easeNavigationScroll(2), 1);
  assert.ok(easeNavigationScroll(0.1) < 0.1);
  assert.ok(easeNavigationScroll(0.9) > 0.9);
});

test('responsive focus easing starts immediately and stays shorter than hunk navigation', () => {
  assert.equal(easeResponsiveFocusScroll(0), 0);
  assert.equal(easeResponsiveFocusScroll(1), 1);
  assert.ok(easeResponsiveFocusScroll(0.1) > easeNavigationScroll(0.1));
  assert.ok(easeResponsiveFocusScroll(0.1) < 0.1);
  assert.ok(easeResponsiveFocusScroll(0.9) > 0.9);
  assert.ok(easeResponsiveFocusScroll(0.9) < easeNavigationScroll(0.9));

  const focusDuration = getResponsiveFocusScrollDuration(200, 800);
  const hunkDuration = getNavigationScrollDuration(200, 800);
  assert.ok(focusDuration >= 150);
  assert.ok(focusDuration < hunkDuration);
  assert.equal(getResponsiveFocusScrollDuration(1_000_000, 800), 300);
});

test('navigation scroll duration grows with distance and stays bounded', () => {
  const nearby = getNavigationScrollDuration(200, 800);
  const severalScreens = getNavigationScrollDuration(4_000, 800);
  const veryFar = getNavigationScrollDuration(1_000_000, 800);

  assert.ok(nearby >= 180);
  assert.ok(nearby < 240);
  assert.ok(severalScreens > nearby);
  assert.equal(veryFar, 420);
});

test('navigation scroll composes horizontal and vertical movement and replaces rapid jumps', () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  let nextFrameId = 1;
  const frames = new Map<number, FrameRequestCallback>();

  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    const frameId = nextFrameId;
    nextFrameId += 1;
    frames.set(frameId, callback);
    return frameId;
  };
  globalThis.cancelAnimationFrame = (frameId: number) => {
    frames.delete(frameId);
  };

  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const element = {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 10_000,
    scrollWidth: 4_000,
    clientHeight: 500,
    clientWidth: 400,
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const registered = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      registered.add(listener);
      listeners.set(type, registered);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      listeners.get(type)?.delete(listener);
    },
  } as unknown as HTMLElement;
  const linkedElement = {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 10_000,
    scrollWidth: 4_000,
    clientHeight: 500,
    clientWidth: 400,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as HTMLElement;

  try {
    scrollElementForNavigation(element, {
      top: 9_000,
      behavior: 'smooth',
      linkedElements: [linkedElement],
    });
    scrollElementForNavigation(element, {
      left: 2_000,
      behavior: 'smooth',
      linkedElements: [linkedElement],
    });
    scrollElementForNavigation(element, {
      top: 1_200,
      behavior: 'smooth',
      linkedElements: [linkedElement],
    });

    assert.equal(frames.size, 1);
    const frame = [...frames.values()][0];
    assert.ok(frame);
    frames.clear();
    frame(performance.now() + 1_000);

    assert.equal(element.scrollTop, 1_200);
    assert.equal(element.scrollLeft, 2_000);
    assert.equal(linkedElement.scrollTop, 1_200);
    assert.equal(linkedElement.scrollLeft, 2_000);
    assert.equal(frames.size, 0);
    assert.equal(listeners.get('wheel')?.size ?? 0, 0);

    scrollElementForNavigation(element, { top: 3_000, behavior: 'smooth' });
    const wheelListener = [...(listeners.get('wheel') ?? [])][0];
    assert.ok(wheelListener);
    if (typeof wheelListener === 'function') {
      wheelListener(new Event('wheel'));
    } else {
      wheelListener.handleEvent(new Event('wheel'));
    }
    assert.equal(frames.size, 0);
    assert.equal(element.scrollTop, 1_200);

    scrollElementForNavigation(element, { top: 3_000, behavior: 'smart' });
    scrollElementForNavigation(element, { left: 3_000, behavior: 'smart' });
    const firstSmartFrame = [...frames.values()][0];
    assert.ok(firstSmartFrame);
    frames.clear();
    firstSmartFrame(performance.now() + 16);
    const firstSmartPosition = element.scrollTop;
    assert.ok(firstSmartPosition > 1_200);
    const verticalProgress = (element.scrollTop - 1_200) / (3_000 - 1_200);
    const horizontalProgress = (element.scrollLeft - 2_000) / (3_000 - 2_000);
    assert.ok(Math.abs(verticalProgress - horizontalProgress) < 0.001);

    scrollElementForNavigation(element, { top: 3_500, behavior: 'smart' });
    const retargetedSmartFrame = [...frames.values()][0];
    assert.ok(retargetedSmartFrame);
    frames.clear();
    retargetedSmartFrame(performance.now() + 16);
    assert.ok(element.scrollTop > firstSmartPosition);
    const smartCompletionFrame = [...frames.values()][0];
    assert.ok(smartCompletionFrame);
    frames.clear();
    smartCompletionFrame(performance.now() + 1_000);
    assert.equal(element.scrollTop, 3_500);
    assert.equal(element.scrollLeft, 3_000);
    assert.equal(frames.size, 0);
  } finally {
    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    } else {
      Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    }
    if (originalCancelAnimationFrame) {
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    } else {
      Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
    }
  }
});
