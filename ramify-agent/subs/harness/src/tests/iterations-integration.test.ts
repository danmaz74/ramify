import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { GateAttempt } from '../checks/records.js';
import { iterationLayout, type IterationAssignment, type IterationResult } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import type { Observation, ObservationOf } from '../run/observations.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import { createAuditCheckExecution } from '../../subs/audit/src/check-execution.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import {
  addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline,
  runScopeTests, submit, viewedInputs,
} from './helpers/iterations.js';
import {
  git, initRepository, onlyRun, openRuns, realRamify, runEventsOnDisk, runPath, startRun,
} from './helpers/runs.js';
import { gitService } from '../../subs/evidence/src/git.js';

/*
 * One accepted iteration, with every external system this project has.
 *
 * This is the retained witness of a passing commit publication: a real git
 * repository, the installed Ramify with a daemon of its own, the real audit
 * execution that makes the commit's worktree and publishes its refs, and the
 * mini runner really running the files the selection resolved to. What it
 * proves is the boundary itself — the commit the harness made, the note it
 * attached to it and the report that note names — which no scripted answer
 * can establish. Every other iteration scenario states Git's answers instead
 * of running it, in `iterations.test.ts`.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

describe('G8: one small work item completes in one iteration', () => {
  test('a local architect assigns it, an engineer works it, the gate accepts it and the harness commits', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    const root = fixture.root;
    await addModule(root, notesDirectory, 'notes', {
      'src/notes.ts': 'export const noteLimit = 400;\n',
      'src/tests/notes.test.ts': [
        'import { test, expect } from \'vitest\';',
        'import { noteLimit } from \'../notes.ts\';',
        '',
        'test(\'the note limit is what the plan asks for\', () => {',
        '  expect(noteLimit).toBe(500);',
        '});',
        '',
      ].join('\n'),
    });
    await installMiniRunner(root);
    await initRepository(root);
    const daemon = await realRamify();
    cleanups.push(() => daemon.dispose());

    const opened = await openRuns(root, {
      git: gitService,
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [
          submit(assign(notes, {}, outline())),
          submit(requestCompletion({ changes: 'The iteration carried the goal; the work item is ready.', revisionReason: 'The iteration is accepted.' })),
        ],
        engineer: [submit(
          completionProposed('Raised the note limit to the 500 characters the plan asks for.'),
          edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500'),
          runScopeTests(),
        )],
      }),
      ramify: daemon.ramify,
      inputs: viewedInputs(daemon.ramify),
      checkExecution: createAuditCheckExecution({ workspaceOwnership: createAuditWorkspaceOwnership(root) }),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;

    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const types = events.map(event => event.type);
    expect(types).toContain('iteration-assigned');
    expect(types).toContain('writer-acquired');
    expect(types).toContain('writer-released');
    expect(types).toContain('iteration-closed');
    // The writer is acquired before the session starts and released before
    // the gate runs.
    expect(types.indexOf('writer-acquired')).toBeLessThan(types.indexOf('writer-released'));

    const assignment = JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.assignment('wi-001', 1)), 'utf8')) as IterationAssignment;
    expect(assignment.id).toBe('wi-001.i01');
    expect(assignment.gate).toEqual({
      checkpoint: 'iteration',
      tests: { policy: 'owned-by-scope', exactOwners: [notes], subtrees: [], extraSuites: [] },
    });
    expect(assignment.scope.resolved.roots.some(path => path.endsWith(`${notesDirectory}/src`))).toBe(true);
    expect(assignment.guarded.map(file => file.path)).toContain('package.json');

    const result = JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.result('wi-001', 1)), 'utf8')) as IterationResult;
    expect(result.outcome).toBe('accepted');
    expect(result.gate).not.toBeNull();
    expect(result.commit).not.toBeNull();

    // The gate ran the files the policy resolved to, and the repair the
    // engineer made is what let it pass.
    const gate = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate(result.gate!)), 'utf8')) as GateAttempt;
    expect(gate.verdict).toBe('passed');
    expect(gate.subject).toEqual({ workItem: 'wi-001', iteration: 'wi-001.i01' });
    expect(gate.commands[0]!.selection!.resolved).toEqual([`${notesDirectory}/src/tests/notes.test.ts`]);
    expect(await readFile(join(root, notesDirectory, 'src', 'notes.ts'), 'utf8')).toBe('export const noteLimit = 500;\n');

    // One commit for the accepted iteration, with the harness's own message
    // and the audit evidence attached separately under the audit notes ref.
    const log = await git(root, 'log', '--format=%H%x1f%B%x1e', `ramify-agent/run-${runId}`);
    const commits = log.split('').map(part => part.trim()).filter(Boolean);
    const accepted = commits.find(commit => commit.includes('Ramify-Iteration: wi-001.i01'));
    expect(accepted).toBeDefined();
    expect(accepted).toContain('Raised the note limit to the 500 characters the plan asks for.');
    expect(accepted).not.toContain('Checks:');
    expect(accepted).toContain('Audit-Note: git notes --ref=audit show');
    expect(accepted).toContain(`Ramify-Gate: ${result.gate}`);
    expect(gate.audited).toBe(result.commit);
    expect(gate.evidence).not.toBeNull();
    const auditNote = await git(root, 'notes', '--ref=audit', 'show', gate.audited!);
    expect(auditNote).toContain('Audited-Overall: pass');
    const notedRunRef = auditNote.match(/^Audited-Reports-Ref: (.+)$/mu)?.[1];
    expect(notedRunRef).toBeDefined();
    const currentAuditSummary = JSON.parse(await git(root, 'show', `${notedRunRef!}:reports/audit/summary.json`)) as unknown;
    expect(currentAuditSummary).toBeTypeOf('object');
    const auditSummary = JSON.parse(await git(root, 'show', `${gate.evidence!.runRef}:reports/audit/summary.json`)) as {
      coverage: { claim: { owners?: string[] } };
    };
    expect(auditSummary.coverage.claim.owners).toEqual([`exact:${notes}`]);

    // The fixture's Cucumber suite is outside the one runner this MVP
    // selects. It is a coverage gap on the attempt, never an absence of
    // tests, and it is read from the project's own manifest.
    const observations = (await readFile(runPath(root, 'review-notes', runId, runLayout.observations(result.invocations[0]!)), 'utf8'))
      .split('\n').filter(Boolean).map(line => JSON.parse(line) as Observation)
      .filter((line): line is ObservationOf<'coverage-gap'> => line.type === 'coverage-gap');
    const unsupported = observations.filter(line => line.data.kind === 'unsupported-runner');
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]!.data.detail).toContain('test:cucumber');
  }, 300_000);
});
