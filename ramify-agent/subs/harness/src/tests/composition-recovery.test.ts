import { describe, test } from 'vitest';
import { allRows, machineNames, verifyRow } from './helpers/recovery-table.js';

/*
 * The composed recovery table (T1), for the rows whose scenarios are the
 * run, its work items, iterations, gates, writer, budget and stop. Each row crashes its scenario after one durable boundary, deletes every
 * record file the log commits, restarts twice with the scripted agent and
 * no network, and holds the recovered state to the checks in
 * `helpers/recovery-table.ts`. The rows are split across three files only
 * so that they run in parallel; `composition.test.ts` asserts that
 * together they are the whole table.
 */

const scenarios: readonly string[] = ['iteration', 'stop'];

describe('the composed recovery table: the run, its work items, iterations, gates, writer, budget and stop', () => {
  for (const row of allRows().filter(candidate => scenarios.includes(candidate.scenario))) {
    test(`${row.name} (${row.machines.map(machine => `${machine}, ${machineNames[machine]}`).join('; ')}): ${row.stated}`, async () => {
      await verifyRow(row);
    }, 300_000);
  }
});
