import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VIRTUAL_FAST_SCROLL_END_EVENT,
  VIRTUAL_FAST_SCROLL_START_EVENT,
  beginVirtualFastScrollSession,
  clearVirtualFastScrollSession,
  endVirtualFastScrollSession,
  getVirtualFastScrollOwner,
  isVirtualFastScrollSessionActive,
} from '../src/utils/virtualization/fastScrollSession';

function createFakeElement() {
  const attributes = new Map<string, string>();
  const events: string[] = [];
  const element = {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    dispatchEvent: (event: Event) => {
      events.push(event.type);
      return true;
    },
  } as unknown as HTMLElement;
  return { element, events };
}

test('virtual fast scroll sessions expose one owner and balanced lifecycle events', () => {
  const { element, events } = createFakeElement();

  beginVirtualFastScrollSession(element, 'minimap');
  assert.equal(isVirtualFastScrollSessionActive(element), true);
  assert.equal(getVirtualFastScrollOwner(element), 'minimap');
  beginVirtualFastScrollSession(element, 'minimap');
  assert.deepEqual(events, [VIRTUAL_FAST_SCROLL_START_EVENT]);

  endVirtualFastScrollSession(element, 'minimap');
  assert.equal(isVirtualFastScrollSessionActive(element), false);
  assert.equal(getVirtualFastScrollOwner(element), null);
  assert.deepEqual(events, [VIRTUAL_FAST_SCROLL_START_EVENT, VIRTUAL_FAST_SCROLL_END_EVENT]);
});

test('clearing an unmounted fast scroll session does not emit a settle event', () => {
  const { element, events } = createFakeElement();
  beginVirtualFastScrollSession(element, 'implicit');
  clearVirtualFastScrollSession(element, 'implicit');

  assert.equal(isVirtualFastScrollSessionActive(element), false);
  assert.equal(getVirtualFastScrollOwner(element), null);
  assert.deepEqual(events, [VIRTUAL_FAST_SCROLL_START_EVENT]);
});
