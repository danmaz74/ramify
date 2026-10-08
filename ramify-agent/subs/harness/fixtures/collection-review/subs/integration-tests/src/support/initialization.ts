/**
 * The shared initialization these feature tests perform, and the two counters
 * that make its effect observable.
 *
 * Evaluating this file is the initialization. Nothing exports an
 * `initialize()` for a caller to invoke, because nothing needs to: a load with
 * a real effect is ordinary source, not something a module has to dress up as
 * an operation to be allowed. That is half of reference case K05; the other
 * half is in `hooks.ts`, which is reached through two setup paths.
 *
 * The tally lives on `globalThis` rather than in module scope on purpose. A
 * module reached through two specifiers that resolve to two URLs is evaluated
 * twice, and two module-scoped counters would then each read 1, which would
 * make "exactly once" an assertion that cannot fail. One tally per process
 * records what this runtime actually did.
 */

/** What this run has done so far. */
interface InitializationTally {
  loads: number;
  beforeAllRuns: number;
}

/** Where the tally hangs: on the process, not on one copy of this module. */
const tallyKey = Symbol.for('collection-review/feature-initialization');

function isTally(value: unknown): value is InitializationTally {
  return (
    typeof value === 'object' &&
    value !== null &&
    'loads' in value &&
    typeof value.loads === 'number' &&
    'beforeAllRuns' in value &&
    typeof value.beforeAllRuns === 'number'
  );
}

/** The one tally of this runtime, created by whichever load arrives first. */
function tally(): InitializationTally {
  const existing: unknown = Reflect.get(globalThis, tallyKey);

  if (isTally(existing)) {
    return existing;
  }

  const created: InitializationTally = { loads: 0, beforeAllRuns: 0 };

  Reflect.set(globalThis, tallyKey, created);

  return created;
}

// The side effect itself: one load, counted as this file is evaluated.
tally().loads += 1;

/** How many times this file has been evaluated in this runtime. */
export function initializationLoads(): number {
  return tally().loads;
}

/** Records one execution of the run-level hook. */
export function recordBeforeAll(): void {
  tally().beforeAllRuns += 1;
}

/** How many times the run-level hook has executed in this runtime. */
export function beforeAllRuns(): number {
  return tally().beforeAllRuns;
}
