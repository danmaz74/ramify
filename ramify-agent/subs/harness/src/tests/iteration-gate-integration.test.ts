import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import type { GateAttempt } from '../checks/records.js';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { runLayout, type LineEventSummary } from '../run/records.js';
import { changedPaths, diffNumstat } from '../../subs/evidence/src/git.js';
import { childEnvironment, runCommand } from '../../subs/evidence/src/run-command.js';
import { createAuditCheckExecution } from '../../subs/audit/src/check-execution.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { git, initRepository, onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { gitService } from '../../subs/evidence/src/git.js';

/*
 * A gate that really fails, with every external system this project has.
 *
 * This is the retained witness of real failing diagnostics: a real defect in
 * real source, a real runner over the files the selection resolved to, the
 * real audit execution publishing its notes and refs against each committed
 * revision, and the audit command line reading the branch back. What it
 * proves is the boundary itself, which no scripted answer can establish.
 * Every other gate-policy scenario states its command results and Git's
 * answers instead, in `iteration-gate.test.ts`.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const auditCli = fileURLToPath(new URL('../../../../node_modules/ramify-audit/dist/cli.js', import.meta.url));

const limitTest = [
  'import { test, expect } from \'vitest\';',
  'import { noteLimit } from \'../notes.ts\';',
  '',
  'test(\'the note limit is what the plan asks for\', () => {',
  '  expect(noteLimit).toBe(500);',
  '});',
  '',
].join('\n');

describe('K1: a module gate fails, is repaired and reruns the complete gate', () => {
  test('a real failing assertion in scope returns in-scope diagnostics and one repair round', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    const root = fixture.root;
    await addModule(root, notesDirectory, 'notes', {
      'src/notes.ts': 'export const noteLimit = 400;\n',
      'src/tests/notes.test.ts': limitTest,
    });
    await installMiniRunner(root);
    await initRepository(root);

    const opened = await openRuns(root, {
      git: gitService,
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
        engineer: [
          // The first attempt proposes completion with the defect still there.
          submit(completionProposed('Added the note store.'), write(`${notesDirectory}/src/store.ts`, 'export const store = new Map();\n')),
          // The repair is a real edit of the real defect.
          submit(completionProposed('Raised the limit to 500, which is what the test states.'),
            edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500')),
        ],
      }),
      inputs: treeInputs(),
      checkExecution: createAuditCheckExecution({ workspaceOwnership: createAuditWorkspaceOwnership(root) }),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;

    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const ids = [...new Set(events.filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate))];
    const attempts = await Promise.all(ids.map(async id =>
      JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate(id)), 'utf8')) as GateAttempt));
    const iterationGates = attempts.filter(gate => gate.checkpoint === 'iteration');
    expect(iterationGates).toHaveLength(2);

    const [failed, repaired] = iterationGates as [GateAttempt, GateAttempt];
    expect(failed.verdict).toBe('failed');
    expect(failed.cause).toBe('in-scope');
    expect(failed.next).toBe('repair');
    expect(failed.repairRound).toBe(0);
    expect(failed.commit).not.toBeNull();
    expect(failed.audited).toBe(failed.commit);
    expect(failed.evidence).not.toBeNull();
    expect(failed.commands[0]!.exitCode).toBe(1);
    expect(failed.commands[0]!.output.tail).toContain('not ok');

    // The rerun is a repair round and runs the complete required set again,
    // not only the command that failed.
    expect(repaired.repairRound).toBe(1);
    expect(repaired.verdict).toBe('passed');
    expect(repaired.commit).not.toBeNull();
    expect(repaired.audited).toBe(repaired.commit);
    expect(repaired.evidence).not.toBeNull();
    expect(repaired.commands.map(command => command.kind)).toEqual(failed.commands.map(command => command.kind));
    expect(repaired.commands.every(command => command.outcome === 'passed')).toBe(true);

    const result = JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.result('wi-001', 1)), 'utf8')) as IterationResult;
    expect(result.outcome).toBe('accepted');
    expect(result.gate).toBe(repaired.id);
    expect(result.commit).toBe(repaired.audited);
    expect(result.invocations).toHaveLength(2);

    // The two attempts report the delivered change once: their line events
    // and paths equal the final accepted diff from the preceding boundary,
    // just as if that final tree had been committed in one attempt.
    const lines = await Promise.all(result.invocations.map(async invocation =>
      JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.lineEvents(invocation)), 'utf8')) as LineEventSummary));
    const delivered = await diffNumstat(root, failed.head, result.commit!);
    expect(lines.flatMap(summary => summary.paths).map(path => [path.path, path.added, path.deleted] as const).sort()).toEqual(
      delivered.map(path => [path.path, path.added, path.deleted] as const).sort(),
    );
    // Past the accepted commit, the tree holds only the feature file the
    // work-item gate's commit rendered without its pending tag, once the
    // completion request declared its scenario.
    expect(await changedPaths(root, result.commit!)).toEqual([`${notesDirectory}/src/tests/features/review-notes/review-note.feature`]);
    expect(await changedPaths(root, 'HEAD')).toEqual([]);
    const closed = events.find(event => event.type === 'iteration-closed' && event.data.iteration === result.iteration);
    expect(closed?.type === 'iteration-closed' && closed.data.notices).toEqual([]);

    // Each changed attempt made one commit before its audit: fail, then pass.
    const log = await git(root, 'log', '--format=%H%x1f%B%x1e', `ramify-agent-run/${runId}`);
    const commits = log.split('').map(part => part.trim()).filter(Boolean);
    expect(commits.filter(commit => commit.includes('Ramify-Iteration: wi-001.i01'))).toHaveLength(2);
    expect(commits.some(commit => commit.includes(`Ramify-Gate: ${failed.id}`))).toBe(true);
    expect(await git(root, 'notes', '--ref=audit', 'show', failed.audited!)).toContain('Audited-Overall: fail');
    expect(await git(root, 'notes', '--ref=audit', 'show', repaired.audited!)).toContain('Audited-Overall: pass');
    const branchAudit = await runCommand({
      argv: [process.execPath, auditCli, 'check-branch', `ramify-agent-run/${runId}`, '--cwd', root, '--json'],
      cwd: root,
      env: childEnvironment({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }),
      timeoutMs: 30_000,
    });
    expect(branchAudit.outcome).toEqual({ kind: 'completed', exitCode: 0 });
    expect(JSON.parse(branchAudit.stdout) as unknown).toMatchObject({ auditStillApplies: true, auditPassed: true });
    expect(await readFile(join(root, notesDirectory, 'src', 'notes.ts'), 'utf8')).toBe('export const noteLimit = 500;\n');
  }, 300_000);
});
