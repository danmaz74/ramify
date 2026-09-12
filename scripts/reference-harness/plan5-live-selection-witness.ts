import assert from 'node:assert/strict';
import { plan5LiveHandlers } from './plan5-live-cases.js';
import { liveInstanceSelection, runLiveInstances } from './plan5-live-smoke.js';

/** The automatic test and focused check share these selection controls. They
 * launch no provider and cannot establish process or prerequisite evidence. */
export async function liveSelectionWitness() {
  const expected = ['reference-sequence-live', 'hundred-owner-sequence-live', 'hook-race-watcher',
    'burst-coalesced', 'removals-live'].map(name => `I5-12:${name}`);
  const assertions: string[] = [];
  function check(name: string, run: () => void): void { run(); assertions.push(name); }

  check('default selection includes every reviewed live instance', () => assert.deepEqual(liveInstanceSelection(), expected));
  const subset = [expected[4], expected[2]];
  check('explicit subset preserves the requested cases and order', () => assert.deepEqual(liveInstanceSelection(plan5LiveHandlers, subset), subset));
  check('empty selection is rejected', () => assert.throws(() => liveInstanceSelection(plan5LiveHandlers, []), /must not be empty/));
  check('duplicate selection is rejected', () => assert.throws(() => liveInstanceSelection(plan5LiveHandlers, [expected[0], expected[0]]), /duplicates/));
  check('unknown selection is rejected', () => assert.throws(() => liveInstanceSelection(plan5LiveHandlers, ['I5-12:unknown']), /Unknown live instance/));
  for (const id of expected) {
    const missing = new Map(plan5LiveHandlers);
    missing.delete(id);
    check(`omitting ${id} fails registration`, () => assert.throws(() => liveInstanceSelection(missing), /must match the reviewed inventory/));
  }
  check('empty provider registry fails registration', () => assert.throws(() => liveInstanceSelection(new Map()), /must match the reviewed inventory/));
  const extra = new Map(plan5LiveHandlers);
  extra.set('I5-12:invented', extra.get(expected[0])!);
  check('invented provider fails registration', () => assert.throws(() => liveInstanceSelection(extra), /must match the reviewed inventory/));
  await assert.rejects(runLiveInstances([]), /must not be empty/);
  assertions.push('actual focused entry rejects zero execution before producing a receipt');
  return { passed: true, assertions };
}
