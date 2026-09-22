import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { runLayout, type InvocationOutcome } from '../run/records.js';
import type { Observation } from '../run/observations.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, installMiniRunner, outline, shell, submit, treeInputs } from './helpers/iterations.js';
import { initRepository, onlyRun, openRuns, runEventsOnDisk, runPath, startRun, stopRun, until } from './helpers/runs.js';
import { gitService } from '../../subs/evidence/src/git.js';

/*
 * C3: a stop is bounded, a late write settles before the next writer or the
 * next check, and a late result cannot complete the work it was superseded
 * on.
 *
 * Discarding a reply is not shutdown. The command an engineer left running
 * is ended with its process group before anything else may write or check,
 * and what it would have written never arrives. What the session produced
 * after the stop is kept for diagnosis with `disposition: 'superseded'`, and
 * it completes nothing.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 500;\n',
    'src/tests/notes.test.ts': [
      'import { test, expect } from \'vitest\';',
      'import { noteLimit } from \'../notes.ts\';',
      '',
      'test(\'the limit is what the plan asks for\', () => { expect(noteLimit).toBe(500); });',
      '',
    ].join('\n'),
  });
  await installMiniRunner(fixture.root);
  await initRepository(fixture.root);
  return fixture.root;
}

describe('a tool that writes after cancellation', () => {
  test('is settled with its process group, and its result completes nothing', async () => {
    const root = await target();
    const started = join(root, 'command-started.txt');
    const late = join(root, `${notesDirectory}/src/late.ts`);

    const { service } = await openRuns(root, {
      git: gitService,
      inputs: treeInputs(),
      // The policy's own bound, not the tests' impatient one: the run's
      // terminal event is its last write, so the invocation the driver has
      // open is closed before it, and settling a command takes longer than
      // half a second.
      stopGraceMs: 30_000,
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
        engineer: [submit(
          // The submission the session would make if it were allowed to
          // finish. It is produced after the stop and applies to nothing.
          completionProposed('The work is done.'),
          shell(`touch ${started}; sleep 20; printf 'export const late = true;\\n' > ${late}`, { timeoutMs: 60_000 }),
        )],
      }),
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    // Stop while the command is in flight, not before it and not after it.
    await until(async () => await exists(started));
    await service.execute(stopRun('review-notes', receipt.jobId, service.getRun('review-notes', receipt.jobId)!.version));
    await service.settled('review-notes', receipt.jobId);
    await until(() => onlyRun(service, 'review-notes').state === 'stopped');

    // The write the command would have made never arrived: it was settled
    // with its group, not merely told to stop.
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(await exists(late)).toBe(false);

    const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    const types = events.map(event => event.type);

    // The writer was released before the run's terminal event, and nothing
    // checked or wrote after the stop.
    expect(types.indexOf('writer-released')).toBeGreaterThan(-1);
    expect(types.indexOf('writer-released')).toBeLessThan(types.indexOf('job-stopped'));
    expect(types.lastIndexOf('job-stopped')).toBe(types.length - 1);
    expect(types).not.toContain('gate-attempted');
    expect(types).not.toContain('iteration-closed');
    const released = events.find(event => event.type === 'writer-released');
    expect((released!.data as { confirmed: boolean }).confirmed).toBe(true);

    // No second writer was acquired after the released one.
    expect(types.filter(type => type === 'writer-acquired')).toHaveLength(1);

    // The engineer's invocation is retained, and it applies to nothing.
    const engineer = events.filter(event => event.type === 'invocation-started')
      .map(event => (event.data as { invocation: string; role: string }))
      .find(data => data.role === 'engineer')!;
    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.outcome(engineer.invocation)), 'utf8')) as InvocationOutcome;
    expect(outcome.disposition).toBe('superseded');
    expect(outcome.settled.confirmed).toBe(true);
    // Everything observed of it is kept: the command it ran is in the record.
    const observations = (await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.observations(engineer.invocation)), 'utf8'))
      .split('\n').filter(Boolean).map(line => JSON.parse(line) as Observation);
    expect(observations.some(line => line.type === 'coverage-gap' && line.data.kind === 'unguarded-shell')).toBe(true);
    expect(observations.some(line => line.type === 'activity' && line.data.activity.kind === 'tool' && line.data.activity.tool === 'shell')).toBe(true);

    // The iteration it was working is not accepted by anything it produced.
    const result = await exists(runPath(root, 'review-notes', receipt.jobId, 'work-items', 'wi-001', 'iterations', '01', 'result.json'));
    expect(result).toBe(false);
  }, 300_000);
});

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
