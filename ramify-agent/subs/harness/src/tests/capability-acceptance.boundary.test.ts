import { afterEach, test } from 'vitest';
import { runAcceptedHandback } from './helpers/acceptance-flow.js';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const failures: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) {
    try { await cleanup(); } catch (error) { failures.push(error); }
  }
  if (failures.length > 0) throw new AggregateError(failures, 'Actual boundary cleanup failed');
});
test('CA08 CA11–CA15 CA17 CA25 CA30: actual Git and local-command multi-owner migration, repair, handback and linked revision',
  () => runAcceptedHandback('revision', cleanups, true), 150_000);
