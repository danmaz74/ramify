import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { GateAttempt } from '../checks/records.js';
import { iterationLayout, type IterationAssignment, type IterationResult } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import { createConfiguredAudit } from '../../subs/audit/src/check-execution.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import {
  addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline,
  submit, viewedInputs, write,
} from './helpers/iterations.js';
import {
  git, initRepository, onlyRun, openRuns, realRamify, runEventsOnDisk, runPath, startRun,
} from './helpers/runs.js';
import { gitService } from '../../subs/evidence/src/git.js';

/*
 * One accepted iteration, with every external system this project has.
 *
 * This is the retained witness of a passing commit publication: a real git
 * repository, the installed Ramify with a daemon of its own, the project's
 * committed audit definition that makes the commit's worktree, runs the mini
 * runner over the tests it names and publishes its refs. What it
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
    const fixture = await copyFixture({ scratchRule: false });
    cleanups.push(fixture.remove);
    const root = fixture.root;
    await addModule(root, notesDirectory, 'notes', {
      'src/notes.ts': 'export const noteLimit = 400;\n',
      'src/tests/notes.test.ts': [
        'import { test, expect } from \'vitest\';',
        'import { noteLimit } from \'../notes.ts\';',
        '',
        'test(\'the note limit is what the plan asks for\', () => {',
        // Readiness audits the starting commit in full, so it starts passing.
        '  expect(noteLimit).toBe(400);',
        '});',
        '',
      ].join('\n'),
    });
    // A suite beside the fixture's own. The harness keeps no runner
    // inventory: whether it runs is the committed audit definition's to say.
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    manifest.scripts['test:e2e'] = 'playwright test';
    await writeFile(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await installMiniRunner(root);
    await writeFile(join(root, 'ramify-audit.json'), `${JSON.stringify({
      ignorePaths: [],
      workspace: { preparation: 'nodejs', options: { packageDirectories: [''], setupCommands: [] } },
      checks: [{
        id: 'notes-tests', name: 'Notes tests', description: 'The notes module\'s tests under the stand-in runner',
        scope: 'both', category: 'deterministic', onFailure: 'record',
        executor: { kind: 'command', commands: [
          { name: 'tests', cmd: 'node_modules/.bin/vitest', args: ['run', `${notesDirectory}/src/tests/notes.test.ts`], parser: 'none', timeoutMs: 60_000 },
        ], continueOnFailure: true },
      }],
    }, null, 2)}\n`);
    await initRepository(root);
    const lockDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-iteration-lock-'));
    cleanups.push(() => rm(lockDirectory, { recursive: true, force: true }));
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
          write('tmp/draft.txt', 'throwaway note\n'),
          edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
          edit('tests/notes.test.ts', 'toBe(400)', 'toBe(500)'),
        )],
      }),
      ramify: daemon.ramify,
      inputs: viewedInputs(daemon.ramify),
      configuredAudit: createConfiguredAudit({ workspaceOwnership: createAuditWorkspaceOwnership(root),
        testLock: { lockPath: join(lockDirectory, 'machine-test.lock') } }),
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
    expect(types).toContain('scratch-setup-complete');
    // The writer is acquired before the session starts and released before
    // the gate runs.
    expect(types.indexOf('writer-acquired')).toBeLessThan(types.indexOf('writer-released'));

    const assignment = JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.assignment('wi-001', 1)), 'utf8')) as IterationAssignment;
    expect(assignment.id).toBe('wi-001.i01');
    expect(assignment.gate).toEqual({
      checkpoint: 'iteration',
      tests: { policy: 'owned-by-scope', exactOwners: [notes], subtrees: [], extraSuites: [] },
    });
    expect(assignment.scope.resolved.roots.some(path => path.endsWith(notesDirectory))).toBe(true);
    expect(assignment.guarded.map(file => file.path)).toContain('package.json');

    const result = JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.result('wi-001', 1)), 'utf8')) as IterationResult;
    expect(result.outcome).toBe('accepted');
    expect(result.gate).not.toBeNull();
    expect(result.commit).not.toBeNull();

    // The gate asked the committed audit about the commit it made; the
    // harness listed no test of its own.
    const gate = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate(result.gate!)), 'utf8')) as GateAttempt;
    expect(gate.verdict).toBe('passed');
    expect(gate.subject).toEqual({ workItem: 'wi-001', iteration: 'wi-001.i01' });
    expect(gate.commands).toEqual([]);
    expect(gate.audit).toMatchObject({ status: 'completed', verdict: 'pass', mode: 'project-default',
      requestedSourceCommit: result.commit, auditedSourceCommit: result.commit });
    // The provider chose the mode: partial was requested of a Ramify
    // project, and the baseline readiness published, whose only check parses
    // no runner, could not narrow it, so it ran full and said why.
    expect(gate.audit).toMatchObject({ requestedMode: 'ramify-partial', executedMode: 'full', reuse: null });
    expect(gate.audit!.fallbackReason).toContain('baseline-incompatible');
    expect(await readFile(join(root, notesDirectory, 'src', 'notes.ts'), 'utf8')).toBe('export const noteLimit = 500;\n');

    // One commit for the accepted iteration, with the harness's own message
    // and the audit evidence attached separately under the audit notes ref.
    const log = await git(root, 'log', '--format=%H%x1f%B%x1e', `ramify-agent-run/${runId}`);
    const commits = log.split('').map(part => part.trim()).filter(Boolean);
    const accepted = commits.find(commit => commit.includes('Ramify-Iteration: wi-001.i01'));
    expect(accepted).toBeDefined();
    expect(accepted).toContain('Raised the note limit to the 500 characters the plan asks for.');
    expect(accepted).not.toContain('Checks:');
    expect(accepted).toContain('Audit-Note: git notes --ref=audit show');
    expect(accepted).toContain(`Ramify-Gate: ${result.gate}`);
    expect(gate.audited).toBe(result.commit);
    expect((await git(root, 'ls-tree', '-r', '--name-only', gate.audited!)).split('\n').filter(path => path.includes('/src/tmp/'))).toEqual([]);
    await expect(readFile(join(root, notesDirectory, 'src/tmp/draft.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(gate.evidence).not.toBeNull();
    const auditNote = await git(root, 'notes', '--ref=audit', 'show', gate.audited!);
    expect(auditNote).toContain('Audited-Overall: pass');
    const notedRunRef = auditNote.match(/^Audited-Reports-Ref: (.+)$/mu)?.[1];
    expect(notedRunRef).toBeDefined();
    const currentAuditSummary = JSON.parse(await git(root, 'show', `${notedRunRef!}:reports/audit/summary.json`)) as unknown;
    expect(currentAuditSummary).toBeTypeOf('object');
    const auditSummary = JSON.parse(await git(root, 'show', `${gate.evidence!.runRef}:reports/audit/summary.json`)) as {
      coverage: { universe: { checkIds: string[] }; selection: { kind: string; selectedCheckIds: string[] } };
    };
    // The provider selected from the committed definition's universe.
    expect(auditSummary.coverage.universe.checkIds).toEqual(['notes-tests']);
    expect(auditSummary.coverage.selection).toMatchObject({ kind: 'full', selectedCheckIds: ['notes-tests'] });

    // Readiness judged the project configuration; no acceptance runner is the harness's to find.
    const readiness = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.readiness(1)), 'utf8')) as { steps: Array<{ step: string; outcome: string }> };
    expect(readiness.steps.filter(step => step.step === 'project-config' || step.step === 'acceptance-runner').map(step => `${step.step} ${step.outcome}`))
      .toEqual(['project-config passed']);
  }, 300_000);
});
