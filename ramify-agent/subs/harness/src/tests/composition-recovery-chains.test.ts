import { afterEach, describe, test, vi } from 'vitest';
import { allRows, machineNames, verifyRow, verifyAvailableAppend } from './helpers/recovery-table.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

afterEach(() => {
  try { expectNoProcesses(); } finally { forgetExternalTools(); }
});

/*
 * The composed recovery table (T1), for the rows whose scenarios are
 * placement, contract revision and a cycle. Each row crashes its scenario after one durable boundary, deletes every
 * record file the log commits, restarts twice without an execution port or
 * network, and holds the recovered state to the checks in
 * `helpers/recovery-table.ts`. Git and the commands readiness would spawn
 * are answered rather than run, by answers the scenario states and the crash
 * and both restarts share. The rows are split across three files only
 * so that they run in parallel; `composition.test.ts` asserts that
 * together they are the whole table.
 */

const scenarios: readonly string[] = ['placement', 'revision', 'cycle'];

describe('the composed recovery table: placement, contract revision and a cycle', () => {
  for (const boundary of ['context-package-append-requested', 'decision-accepted', 'brief-appending'] as const) {
    test(`an available original ${boundary} appends the same bytes once without model dispatch or invented owning completion`, async () => {
      await verifyAvailableAppend(boundary);
    }, 300_000);
  }
  for (const row of allRows().filter(candidate => scenarios.includes(candidate.scenario))) {
    test(`${row.name} (${row.machines.map(machine => `${machine}, ${machineNames[machine]}`).join('; ')}): ${row.stated}`, async () => {
      await verifyRow(row);
    }, 300_000);
  }
});
