import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { batchBoundary, helpVersionBoundary } from './entry-boundary-cases.js';
import { fixture } from './fixture.js';

const assertions = {
  equal: (name: string, actual: unknown, expected: unknown) => assert.deepEqual(actual, expected, name),
  ok: (name: string, actual: unknown) => assert.ok(actual, name),
};

describe('compiled entry boundaries', () => {
  it('keeps help and version free of engine loads, connections and launches', async () => {
    await helpVersionBoundary(assertions);
  }, 15_000);
  it('keeps explicit batch independent of the daemon and preserves report bytes', async () => {
    await fixture(root => batchBoundary(root, assertions).then(() => {}));
  }, 60_000);
  // The independent Plan 2 process gate exercises daemon and resident boundaries.
});
