import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { inPlaceCheckExecution, type GateCommandStart } from '../checks/execution.js';
import { runGate } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import { projectEvent } from '../projections/events.js';
import type { RunEvent } from '../run/log.js';
import { copyFixture } from './helpers/fixture.js';
import { announcingCheckExecution, createPassingCheckExecution } from './helpers/direct-check-execution.js';
import { directReadinessExecution } from './helpers/external-tools.js';
import { emptyAnalysis, installTestRunner, onlyRun, runEventsOnDisk, startRun } from './helpers/runs.js';
import { assertUnchangedGit, openUnchangedRuns } from './helpers/unchanged-run.js';

/*
 * A running gate says which step it is on: each command it starts is a
 * `gate-command-started` line, readiness's included, with its kind and its
 * place among the gate's commands.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  assertUnchangedGit();
});

describe('the in-place executor', () => {
  test('announces each command as it starts, in order, with its place among the gate\'s commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-progress-'));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const passes = checkCommand({ argv: [process.execPath, '-e', ''], cwd: root, timeoutMs: 30_000 });
    const announced: GateCommandStart[] = [];

    const gate = await runGate(inPlaceCheckExecution, 'readiness', {
      id: 'ga-0001',
      projectRoot: root,
      directory: join(root, 'gate'),
      head: 'HEAD',
      checks: [
        { kind: 'tests', command: passes },
        { kind: 'type-check', command: passes },
        { kind: 'ramify-check', command: passes },
      ],
      started: async command => { announced.push(command); },
    });

    expect(gate.verdict).toBe('passed');
    expect(announced).toEqual([
      { kind: 'tests', position: 1, total: 3 },
      { kind: 'type-check', position: 2, total: 3 },
      { kind: 'ramify-check', position: 3, total: 3 },
    ]);
  }, 60_000);
});

describe('a run', () => {
  test('records the start of each command of readiness and of a committing gate', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    const { service } = await openUnchangedRuns(fixture.root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      unchangedCheckpoints: ['final verification of plan "review-notes"'],
      readinessExecution: announcingCheckExecution(directReadinessExecution()),
      checkExecution: announcingCheckExecution(createPassingCheckExecution()),
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    expect(onlyRun(service, 'review-notes').state).toBe('completed');

    const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
    const types = events.map(event => event.type);
    const started = events.filter((event): event is Extract<RunEvent, { type: 'gate-command-started' }> => event.type === 'gate-command-started');
    const readiness = started.filter(event => event.data.gate === 'ga-0001');
    const final = started.filter(event => event.data.gate === 'ga-0002');

    expect(readiness.length).toBeGreaterThan(0);
    expect(readiness.map(event => event.data)).toEqual(readiness.map((event, index) => ({
      gate: 'ga-0001', checkpoint: 'readiness', kind: event.data.kind, position: index + 1, total: readiness.length,
    })));
    expect(readiness.map(event => event.data.kind).slice(0, 3)).toEqual(['tests', 'type-check', 'ramify-check']);
    expect(final.map(event => [event.data.checkpoint, event.data.position, event.data.total]))
      .toEqual(final.map((_, index) => ['final', index + 1, final.length]));
    // Each lies between its gate's start and its end.
    expect(types.indexOf('gate-started')).toBeLessThan(events.indexOf(readiness[0]!));
    expect(events.indexOf(readiness.at(-1)!)).toBeLessThan(types.indexOf('readiness-passed'));
    expect(types.indexOf('gate-committing')).toBeLessThan(events.indexOf(final[0]!));
    expect(events.indexOf(final.at(-1)!)).toBeLessThan(types.indexOf('gate-attempted'));

    expect(projectEvent(final[1]!)).toMatchObject({
      transition: 'gate-command-started',
      summary: `Gate ga-0002 (final): the type check started, command 2 of ${final.length}`,
      refs: [{ kind: 'gate', id: 'ga-0002' }],
    });
  }, 120_000);
});
