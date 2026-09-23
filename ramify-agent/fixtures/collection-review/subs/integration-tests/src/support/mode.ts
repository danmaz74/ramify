import { startServedTestSystem } from '../../../../src/tests/setup.js';

/**
 * The execution mode of this run, and the served system full mode needs.
 *
 * The mode is fixed for one run of the runner and never written into a
 * scenario: `acceptance:quick` sets `TEST_MODE=quick` and `acceptance:full`
 * sets `TEST_MODE=full`. Quick mode drives the configured system in process,
 * as every other test in this package does. Full mode drives the same system
 * through the real listener on a loopback port, which the hooks start once
 * before the first scenario and stop after the last. A run started without
 * the variable, such as `test:cucumber`, is quick.
 *
 * Neither mode needs a browser, a database or a `setup` command: the one
 * server full mode needs is started by the hooks, so a dry run starts nothing.
 */

export type TestMode = 'quick' | 'full';

/** The mode this runtime runs in, from `TEST_MODE`. Anything else is an error, not a default. */
export function testMode(): TestMode {
  const value = process.env['TEST_MODE'] ?? 'quick';

  if (value !== 'quick' && value !== 'full') {
    throw new Error(`TEST_MODE is "${value}"; it must be "quick" or "full".`);
  }

  return value;
}

/** The system full mode serves, as the root's exposed setup hands it out. */
export type ServedSystem = Awaited<ReturnType<typeof startServedTestSystem>>;

let served: ServedSystem | null = null;

/** Starts the listener, once per run. The `BeforeAll` hook calls it in full mode. */
export async function startServedSystem(): Promise<void> {
  if (served === null) {
    served = await startServedTestSystem();
  }
}

/** The running listener's clients, for a scenario in full mode. */
export function servedSystem(): ServedSystem {
  if (served === null) {
    throw new Error('Full mode has no served system: the BeforeAll hook did not start one.');
  }

  return served;
}

/** Stops the listener if one was started. The `AfterAll` hook calls it. */
export async function stopServedSystem(): Promise<void> {
  const running = served;

  served = null;
  await running?.close();
}
