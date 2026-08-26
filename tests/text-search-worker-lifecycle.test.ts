import assert from 'node:assert/strict';
import test from 'node:test';

test('clearing a search query terminates the worker that retains searchable lines', async () => {
  const previousWorker = globalThis.Worker;
  let terminateCount = 0;

  class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: (() => void) | null = null;

    postMessage(message: unknown) {
      const request = message as { type?: string; requestId?: number };
      if (request.type !== 'search') return;
      queueMicrotask(() => this.onmessage?.({
        data: {
          ok: true,
          requestId: request.requestId,
          result: { matches: [], totalCount: 0, truncated: false },
        },
      } as MessageEvent));
    }

    terminate() {
      terminateCount += 1;
    }
  }

  globalThis.Worker = FakeWorker as unknown as typeof Worker;
  try {
    const { computeSearchMatchesAsync } = await import('../src/utils/diff/computeSearchMatchesAsync');
    const lines = Array.from({ length: 2_000 }, (_, index) => `retained-${index}`);
    await computeSearchMatchesAsync(lines, {
      query: 'retained',
      isRegex: false,
      isCaseSensitive: false,
    });
    await computeSearchMatchesAsync(lines, {
      query: '',
      isRegex: false,
      isCaseSensitive: false,
    });

    assert.equal(terminateCount, 1);
  } finally {
    if (previousWorker === undefined) {
      Reflect.deleteProperty(globalThis, 'Worker');
    } else {
      globalThis.Worker = previousWorker;
    }
  }
});
