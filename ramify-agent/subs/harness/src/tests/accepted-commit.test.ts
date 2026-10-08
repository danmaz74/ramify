import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { commitMessage } from '../run/gates.js';
import { acceptedCommit } from '../checks/accepted.js';
import type { ConfiguredAuditPort } from '../../subs/audit/src/check-execution.js';
import type { GateAttempt } from '../checks/records.js';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import type { RunWrite } from '../run/service.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, edit, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { passingAudit } from './helpers/direct-check-execution.js';
import { gateGit, scenariosCommit, type GateCommit, type GateGitOptions } from './helpers/gate-git.js';
import { finalCandidate } from './helpers/final-candidate.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { RunQueries } from '../projections/queries.js';
import {
  staleCrashLock, freeze, installTestRunner, onlyRun, openRuns,
  runEventsOnDisk, runPath, startRun, until,
} from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * The commit at an accepted boundary.
 *
 * A change to the working directory blocks nothing: once the gate plan is
 * verified, the harness commits and audits that exact revision. A crash after
 * the commit re-audits one commit, because the effect is keyed by the gate
 * attempt and a repeat finds it by its trailers.
 *
 * Git is an external system here, not a repository. Each scenario states the
 * revision Git answers at every boundary it reaches — including the
 * boundaries where Git reports an unchanged tree and answers none — and the
 * commits a repeat of an attempt finds, each under the exact identity
 * trailers Git would have to be asked for. What the assertions read is the
 * run's own durable records and the ordered ledger of what it asked Git,
 * never a tree, a diff or a history.
 *
 * A direct stale-lock fixture marks crash recovery without starting a helper
 * process; the process guard proves these lifecycle cases cross no process
 * boundary.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { expectNoProcesses(); } finally { forgetExternalTools(); }
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

/** The revision the fixture is on before a run commits anything. */
const base = 'revision-00';
/** The harness's own commit of the run's feature files, made once readiness has passed. */
const materialized = 'scenarios-00';
const scenarios = scenariosCommit('review-notes', materialized, base);

/** A boundary Git reports as unchanged, which commits nothing. */
const unchanged: GateCommit = { commit: null };

const firstTest = [
  'import { test, expect } from \'vitest\';',
  'import { noteLimit } from \'../notes.ts\';',
  '',
  'test(\'the note limit is what the plan asks for\', () => {',
  '  expect(noteLimit).toBe(500);',
  '});',
  '',
].join('\n');

async function target(options: { readonly withNotes?: boolean } = {}) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  if (options.withNotes !== false) {
    await addModule(fixture.root, notesDirectory, 'notes', {
      'src/notes.ts': 'export const noteLimit = 500;\n',
      'src/tests/notes.test.ts': firstTest,
    });
  }
  await installTestRunner(fixture.root);
  return fixture.root;
}

async function readResult(root: string, runId: string, number: number): Promise<IterationResult> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.result('wi-001', number)), 'utf8')) as IterationResult;
}

/** One accepted iteration over the notes module, with whatever the engineer does. */
function onePass(steps: Parameters<typeof submit>[1][] = []) {
  return {
    'initial-architect': [submit(analysis([entry('review-note', notes)]))],
    'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
    engineer: [submit(completionProposed('Raised the limit and left the rest alone.'), ...steps)],
  };
}

/** The store the engineer writes, and the entry Git reports for it. */
const storePath = `${notesDirectory}/src/store.ts`;

/** What Git reports the created notes module added. */
const moduleEntries = [
  { status: 'A', path: `${notesDirectory}/module.ramify` },
  { status: 'A', path: `${notesDirectory}/README.md` },
  { status: 'A', path: `${notesDirectory}/src/notes.ts` },
  { status: 'A', path: `${notesDirectory}/src/tests/notes.test.ts` },
];
const storeWrite = write('store.ts', 'export const store = new Map();\n');
const latePath = `${notesDirectory}/src/late.ts`;

describe('a change to the working directory blocks nothing', () => {
  test('an engineer uses ignored scratch through acceptance, then closure removes it before final audit', async () => {
    const root = await target();
    const temporary = join(root, notesDirectory, 'src/tmp/draft.txt');
    const final = finalCandidate(root, 'revision-01');
    const scripted = gateGit(root, {
      head: base, previews: final.previews,
      commits: [scenarios, { commit: 'revision-01', changes: [{ status: 'A', path: storePath }] }, unchanged, unchanged],
    });
    const opened = await openRuns(root, {
      script: byRole(onePass([write('tmp/draft.txt', 'temporary evidence\n'), storeWrite])),
      inputs: treeInputs(), git: scripted.git, candidates: final.candidates,

      afterWrite: async current => {
        if (current === 'gate-attempted' && scripted.messages.length === 1) {
          expect(await readFile(temporary, 'utf8')).toBe('temporary evidence\n');
        }
      },
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    expect(onlyRun(opened.service, 'review-notes').state, JSON.stringify(onlyRun(opened.service, 'review-notes').failure)).toBe('completed');
    await expect(readFile(temporary)).rejects.toThrow();
    const result = await readResult(root, receipt.jobId, 1);
    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate(result.gate!)), 'utf8')) as GateAttempt;
    expect(attempt).toMatchObject({ verdict: 'passed', audited: 'revision-01' });
    expect(scripted.messages[1]).toContain('Ramify-Iteration: wi-001.i01');
    expect(scripted.calls.filter(call => call.operation === 'commitAccepted')).toHaveLength(4);
    scripted.assertComplete();
  }, 120_000);

  test('recovery finishes cleanup after the durable accepted close event', async () => {
    const root = await target();
    const scratch = join(root, notesDirectory, 'src/tmp/recovery.txt');
    const scripted = gateGit(root, { head: base,
      commits: [scenarios, { commit: 'revision-01', changes: [{ status: 'A', path: storePath }] }] });
    const crashed = await openRuns(root, {
      script: byRole(onePass([write('tmp/recovery.txt', 'recover me\n'), storeWrite])),
      inputs: treeInputs(), git: scripted.git,
      afterWrite: async current => { if (current === 'iteration-closed') await freeze(); },
    });
    const receipt = await crashed.service.execute(startRun('review-notes'));
    await until(() => (crashed.service.events('review-notes', receipt.jobId) ?? []).some(event => event.type === 'iteration-closed'), 30_000);
    expect(await readFile(scratch, 'utf8')).toBe('recover me\n');
    await staleCrashLock(root);
    const recoveryGit = gateGit(root, { head: 'revision-01', commits: [] });
    const reopened = await openRuns(root, { inputs: treeInputs(), git: recoveryGit.git,
      });
    cleanups.push(() => reopened.service.close());
    await expect(readFile(scratch)).rejects.toMatchObject({ code: 'ENOENT' });
    recoveryGit.assertComplete();
  }, 120_000);

  test('a nested ignore exception fails the gate before commit and repair retains scratch', async () => {
    const root = await target();
    const override = join(root, notesDirectory, 'src/.gitignore');
    const scratch = join(root, notesDirectory, 'src/tmp/draft.txt');
    const final = finalCandidate(root, 'revision-01');
    const scripted = gateGit(root, {
      head: base, previews: final.previews,
      commits: [scenarios, { commit: 'revision-01', changes: [{ status: 'A', path: storePath }] }, unchanged, unchanged],
    });
    const git = {
      ...scripted.git,
      async trackedPaths() { return []; },
      async ignoreStatus(_project: string, paths: readonly string[]) {
        const changed = await readFile(override, 'utf8').catch(() => '');
        return paths.map(path => path === `${notesDirectory}/src/tmp/` && changed.includes('!tmp/')
          ? { path, ignored: false, rule: { source: `${notesDirectory}/src/.gitignore`, line: 1, pattern: '!tmp/' } }
          : { path, ignored: true, rule: { source: '.gitignore', line: 1, pattern: '**/src/tmp/' } });
      },
    };
    const plan = onePass();
    const opened = await openRuns(root, {
      script: byRole({ ...plan, engineer: [
        submit(completionProposed('First candidate.'), write('tmp/draft.txt', 'draft\n'), write('.gitignore', '!tmp/\n')),
        submit(completionProposed('Repaired ignore exception.'), edit('tmp/draft.txt', 'draft', 'kept'), write('.gitignore', ''), storeWrite),
      ] }),
      inputs: treeInputs(), git, scratchGit: 'provided', candidates: final.candidates,

    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    expect(onlyRun(opened.service, 'review-notes').state, JSON.stringify(onlyRun(opened.service, 'review-notes').failure)).toBe('completed');
    const first = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate('ga-0002')), 'utf8')) as GateAttempt;
    expect(first).toMatchObject({ verdict: 'failed', cause: 'check-failed', commit: null, audited: null, next: 'repair' });
    // The rule failed before commit, so the audit was never asked, and no
    // command record stands in for the checks it did not run.
    expect(first.commands).toEqual([]);
    expect(first.audit).toBeUndefined();
    expect(first.rules?.find(rule => rule.rule === 'scratch-safety')?.violations).toEqual([expect.objectContaining({
      path: `${notesDirectory}/src/tmp/`, detail: expect.stringContaining(`${notesDirectory}/src/.gitignore:1`),
    })]);
    expect(scripted.messages).toHaveLength(4);
    await expect(readFile(scratch)).rejects.toThrow();
    scripted.assertComplete();
  }, 120_000);

  test('a forced-staged scratch file fails the run gate and closure preserves only indexed scratch', async () => {
    const root = await target();
    const indexed = `${notesDirectory}/src/tmp/indexed.txt`;
    const other = `${notesDirectory}/src/tmp/other.txt`;
    const scripted = gateGit(root, { head: base, commits: [scenarios] });
    const git = {
      ...scripted.git,
      async trackedPaths() { return await readFile(join(root, indexed)).then(() => [indexed], () => []); },
      async ignoreStatus(_project: string, paths: readonly string[]) {
        return paths.map(path => ({ path, ignored: true,
          rule: { source: '.gitignore', line: 1, pattern: '**/src/tmp/' } }));
      },
    };
    const plan = onePass();
    const opened = await openRuns(root, {
      script: byRole({ ...plan, engineer: [
        submit(completionProposed('Candidate with indexed scratch.'), write('tmp/indexed.txt', 'indexed\n'), write('tmp/other.txt', 'other\n')),
        submit({ kind: 'partial', done: ['Source inspected'], unfinished: ['Remove indexed scratch'], findings: [] }),
      ] }),
      inputs: treeInputs(), git, scratchGit: 'provided',
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await until(() => (opened.service.events('review-notes', receipt.jobId) ?? []).some(event => event.type === 'scratch-preserved'), 30_000);
    const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    expect(events.find(event => event.type === 'scratch-preserved')?.data).toMatchObject({
      iteration: 'wi-001.i01', paths: [indexed],
    });
    const failed = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate('ga-0002')), 'utf8')) as GateAttempt;
    expect(failed).toMatchObject({ verdict: 'failed', cause: 'check-failed', commit: null, audited: null });
    expect(failed.rules?.find(rule => rule.rule === 'scratch-safety')?.violations).toEqual([expect.objectContaining({ path: indexed })]);
    expect(await readFile(join(root, indexed), 'utf8')).toBe('indexed\n');
    await expect(readFile(join(root, other))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(scripted.messages).toHaveLength(1);
  }, 120_000);

  test('a verified gate makes one commit before audit, including a late change before that commit', async () => {
    const root = await target();
    const final = finalCandidate(root, 'revision-01');
    const scripted = gateGit(root, {
      head: base,
      previews: final.previews,
      commits: [
        scenarios,
        {
          commit: 'revision-01',
          changes: [{ status: 'A', path: storePath }, { status: 'A', path: latePath }],
        },
        unchanged,
        unchanged,
      ],
    });
    const opened = await openRuns(root, {
      script: byRole(onePass([storeWrite])),
      inputs: treeInputs(),
      git: scripted.git,
      candidates: final.candidates,

      afterWrite: async current => {
        // A late write lands after verification and before the commit. It
        // blocks nothing and joins the revision the audit checks.
        if (current === 'gate-attempted') {
          await writeFile(join(root, latePath), 'export const late = true;\n');
          scripted.mark('the late write');
        }
      },
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);

    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    const result = await readResult(root, receipt.jobId, 1);
    expect(result.outcome).toBe('accepted');
    expect(result.commit).toBe('revision-01');
    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate(result.gate!)), 'utf8')) as GateAttempt;
    expect(attempt).toMatchObject({ verdict: 'passed', head: materialized, commit: 'revision-01', audited: 'revision-01' });

    // One commit for the iteration, and the late write really happened
    // before the harness asked for it: the ledger of what the run asked Git
    // puts the mark between the verification and the commit.
    const ledger = scripted.calls.map(call => `${call.operation}${call.operation === 'mark' ? `:${call.detail}` : ''}`);
    // The first commit is the feature files', made before the iteration.
    const commits = ledger.flatMap((operation, index) => (operation === 'commitAccepted' ? [index] : []));
    expect(commits).toHaveLength(4);
    expect(ledger.indexOf('mark:the late write')).toBeGreaterThan(-1);
    expect(ledger.indexOf('mark:the late write')).toBeLessThan(commits[1]!);
    expect(scripted.messages[1]).toContain('Ramify-Iteration: wi-001.i01');
    // Both files are really in the tree the commit boundary was reached over.
    expect(await readFile(join(root, storePath), 'utf8')).toBe('export const store = new Map();\n');
    expect(await readFile(join(root, latePath), 'utf8')).toBe('export const late = true;\n');
    scripted.assertComplete();
  }, 120_000);

  test('a crash between the gate\'s verification and audit completion makes exactly one commit', async () => {
    // Three crashes at the commit-and-audit effect, each with the commits
    // its repeat finds. The gate is `ga-0002` in every one of them, and the
    // last states a commit under another run's identity carrying that same
    // gate id, which this run's lookup must not find.
    const rows = [
      { name: 'crashed before the commit', boundary: 'gate-attempted', committed: 0, trailed: [] as Array<{ run: string; gate: string; commit: string }> },
      {
        name: 'crashed after the commit',
        boundary: 'gate-committing',
        committed: 1,
        trailed: [{ run: 'this', gate: 'ga-0002', commit: 'revision-01' }],
      },
      {
        name: 'crashed before the commit, with another run\'s commit at the same gate id',
        boundary: 'gate-attempted',
        committed: 0,
        trailed: [{ run: 'other-run', gate: 'ga-0002', commit: 'another-run-revision' }],
      },
    ] as const satisfies ReadonlyArray<{ name: string; boundary: RunWrite; committed: number; trailed: ReadonlyArray<{ run: string; gate: string; commit: string }> }>;

    for (const row of rows) {
      const root = await target();
      const crashedGit = gateGit(root, {
        head: base,
        commits: [scenarios, { commit: 'revision-01', changes: [{ status: 'A', path: storePath }] }],
      });
      const crashed = await openRuns(root, {
        script: byRole(onePass([storeWrite])),
        inputs: treeInputs(),
        git: crashedGit.git,

        afterWrite: async current => {
          if (current === row.boundary) await freeze();
        },
      });
      const receipt = await crashed.service.execute(startRun('review-notes'));
      const events = runPath(root, 'review-notes', receipt.jobId, runLayout.events);
      // The intent is in the log before the commit is made, so each boundary
      // is the intent plus the number of commits the run has asked for there.
      await until(async () => {
        const text = await readFile(events, 'utf8').catch(() => '');
        if (!text.includes('"gate-committing"')) return false;
        // The feature files' commit precedes the gate's.
        return crashedGit.calls.filter(call => call.operation === 'commitAccepted').length === row.committed + 1;
      }, 60_000);
      await staleCrashLock(root);

      const crashedLog = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
      const committing = crashedLog.filter(event => event.type === 'gate-committing');
      expect(committing).toHaveLength(1);
      const gate = committing[0]!.data.gate;
      expect(gate).toBe('ga-0002');

      // The repeat finds the commit of this run's own gate where there is
      // one, and nothing where the only commit at that gate id belongs to
      // another run.
      const recoveryGit = gateGit(root, {
        head: row.committed === 0 ? materialized : 'revision-01',
        commits: row.committed === 0 ? [{ commit: 'revision-01', changes: [{ status: 'A', path: storePath }] }] : [],
        trailed: row.trailed.map(known => ({
          trailers: [
            { key: 'Ramify-Run', value: known.run === 'this' ? receipt.jobId : known.run },
            { key: 'Ramify-Gate', value: known.gate },
          ],
          commit: known.commit,
        })),
      });
      const reopened = await openRuns(root, {
        inputs: treeInputs(),
        git: recoveryGit.git,

      });
      cleanups.push(() => reopened.service.close());
      expect(onlyRun(reopened.service, 'review-notes').state).toBe('interrupted');

      // The intent held the verified operation, and its completion is what
      // recovery wrote: one attempt, once.
      const log = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
      expect(log.filter(event => event.type === 'gate-committing')).toHaveLength(1);
      expect(log.filter(event => event.type === 'gate-attempted' && event.data.gate === gate)).toHaveLength(1);

      // The effect is keyed by the gate attempt: recovery performs it again,
      // asks for the commit by both identity trailers, and makes a second
      // one only where the first attempt made none.
      expect(recoveryGit.lookups).toEqual([[
        { key: 'Ramify-Run', value: receipt.jobId },
        { key: 'Ramify-Gate', value: gate },
      ]]);
      const asked = crashedGit.calls.filter(call => call.operation === 'commitAccepted').length
        + recoveryGit.calls.filter(call => call.operation === 'commitAccepted').length;
      // The feature files' commit, and the gate's once.
      expect(`${row.name}: ${asked}`).toBe(`${row.name}: 2`);

      const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate(gate)), 'utf8')) as GateAttempt;
      expect(attempt.verdict).toBe('passed');
      expect(attempt.commit).toBe('revision-01');
      expect(attempt.audited).toBe(attempt.commit);
      expect(attempt.commit).not.toBe('another-run-revision');
      recoveryGit.assertComplete();
    }
  }, 300_000);

  test('a later source change invalidates nothing: the accepted commit stays as it is', async () => {
    const root = await target();
    const final = finalCandidate(root, 'revision-01');
    const scripted = gateGit(root, {
      head: base,
      previews: final.previews,
      commits: [
        scenarios,
        { commit: 'revision-01', changes: [{ status: 'A', path: storePath }] },
        unchanged,
        unchanged,
      ],
    });
    const opened = await openRuns(root, {
      script: byRole(onePass([storeWrite])),
      inputs: treeInputs(),
      git: scripted.git,
      candidates: final.candidates,

    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);

    const result = await readResult(root, receipt.jobId, 1);
    expect(result.commit).toBe('revision-01');
    const settled = scripted.calls.length;
    // A change made after the boundary is uncommitted work for the next
    // gate. It does not reopen the iteration, does not touch the commit and
    // asks Git for nothing.
    await writeFile(join(root, notesDirectory, 'src', 'notes.ts'), 'export const noteLimit = 1;\n');
    expect(await readFile(join(root, notesDirectory, 'src', 'notes.ts'), 'utf8')).toBe('export const noteLimit = 1;\n');
    expect(scripted.calls).toHaveLength(settled);
    expect(scripted.revisions()).toEqual([materialized, 'revision-01']);
    const reloaded = await readResult(root, receipt.jobId, 1);
    expect(reloaded).toEqual(result);
    scripted.assertComplete();
  }, 120_000);
});

describe('the accepted boundary after an audit infrastructure retry', () => {
  test('an unchanged retry accepts the earlier commit, and later unchanged checkpoints retain it without repeating notices', async () => {
    const root = await target({ withNotes: false });
    const final = finalCandidate(root, 'revision-01');
    const scripted = gateGit(root, {
      head: base,
      previews: final.previews,
      commits: [
        scenarios,
        // The attempt whose audit could not run still committed what the
        // engineer wrote, including the declaration of the new module.
        { commit: 'revision-01', changes: moduleEntries, against: materialized, subject: 'wi-001.i01' },
        // The retry finds the same files still standing against the
        // accepted boundary, which has not moved, and a tree Git reports as
        // unchanged against the commit the first attempt made. The work
        // item's gate and the run's own gate then stand on that accepted
        // revision, with nothing changed against it.
        { commit: null, changes: moduleEntries, against: materialized },
        { commit: null, against: 'revision-01' },
        { commit: null, against: 'revision-01' },
      ],
    });
    const passing = passingAudit();
    let failedOnce = false;
    // The first iteration gate's request cannot be answered: the audit
    // service is unavailable. Readiness made the one full request before it.
    const configuredAudit: ConfiguredAuditPort = {
      read: passing.read,
      async run(input) {
        if (!failedOnce && input.mode === 'project-default') {
          failedOnce = true;
          throw new Error('the audit service was unavailable');
        }
        return passing.run(input);
      },
    };
    const opened = await openRuns(root, {
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes, 'A reviewer note.', {
          parent: 'collection-review/workspace/reviews', directory: notesDirectory,
          purpose: 'Holds reviewer notes.', tags: [],
        })]))],
        'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
        engineer: [submit(
          completionProposed('Created the notes module.'),
          write('../module.ramify', 'ramify 1\nmodule notes\n'),
          write('../README.md', '# notes\n\nHolds reviewer notes.\n'),
          write('notes.ts', 'export const noteLimit = 500;\n'),
          write('tests/notes.test.ts', firstTest),
        )],
      }),
      inputs: treeInputs(),
      git: scripted.git,
      candidates: final.candidates,

      configuredAudit,
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);

    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    const committed = opened.service.committed('review-notes', receipt.jobId)!;
    const attempts = committed.entries.flatMap(line => line.transaction.records)
      .map(record => record.body as Partial<GateAttempt>)
      .filter((body): body is GateAttempt => body.schema === 'ramify-agent.gate-attempt/3');
    const [failed, retry] = attempts.filter(attempt => attempt.checkpoint === 'iteration');
    expect(failed).toMatchObject({ verdict: 'not-verified', cause: 'infrastructure' });
    expect(failed!.commit).toBe('revision-01');
    expect(failed!.audited).toBeNull();
    expect(failed!.audit).toMatchObject({ status: 'failed', requestedSourceCommit: 'revision-01', auditedSourceCommit: null });
    expect(failed!.audit!.detail).toContain('the audit service was unavailable');
    expect(retry).toMatchObject({ verdict: 'passed', commit: null, audited: 'revision-01' });

    const accepted = failed!.commit!;
    expect(acceptedCommit(committed.entries, committed.record.manifest.source?.commit ?? attempts[0]!.head)).toBe(accepted);
    const result = await readResult(root, receipt.jobId, 1);
    expect(result).toMatchObject({ outcome: 'accepted', gate: retry!.id, commit: accepted });

    const later = attempts.filter(attempt => attempt.checkpoint === 'work-item' || attempt.checkpoint === 'final');
    expect(later.map(attempt => ({ checkpoint: attempt.checkpoint, commit: attempt.commit, audited: attempt.audited, verdict: attempt.verdict }))).toEqual([
      { checkpoint: 'work-item', commit: null, audited: accepted, verdict: 'passed' },
      { checkpoint: 'final', commit: null, audited: accepted, verdict: 'passed' },
    ]);
    const closed = committed.entries.filter(line => line.transaction.event.type === 'iteration-closed');
    expect(closed).toHaveLength(1);
    expect(closed[0]!.transaction.event.type === 'iteration-closed' && closed[0]!.transaction.event.data.notices).toEqual([{
      kind: 'module-created', module: notes, declaration: `${notesDirectory}/module.ramify`,
      commit: accepted, iteration: 'wi-001.i01', decision: null,
    }]);
    // Exactly one revision was ever minted after the feature files', and the
    // three boundaries that followed it were each told the tree was unchanged.
    expect(scripted.revisions()).toEqual([materialized, accepted]);
    expect(attempts.map(attempt => attempt.head)).toEqual([base, materialized, accepted, accepted, accepted]);

    const queries = new RunQueries(opened.service);
    const metrics = await queries.metrics('review-notes', receipt.jobId);
    expect(metrics.metrics.find(metric => metric.id === 'gate-attempts-per-accepted-iteration')).toMatchObject({
      state: 'measured', numerator: 2, denominator: 1, value: 2,
      evidence: [failed!.id, retry!.id],
    });
    const projected = await queries.workItem('review-notes', receipt.jobId, 'wi-001');
    expect(projected.iterations[0]!.result?.commit).toBe(accepted);
    const events = await queries.events('review-notes', receipt.jobId, 0);
    expect(events.events.find(event => event.transition === 'iteration-closed')?.refs).toContainEqual({ kind: 'commit', id: accepted });
    expect(events.events.find(event => event.transition === 'job-completed')?.refs).toContainEqual({ kind: 'commit', id: accepted });

    const invocations = committed.entries.flatMap(line => line.transaction.records)
      .map(record => record.body as { schema?: string; role?: string; base?: string })
      .filter(body => body.schema === 'ramify-agent.invocation/1');
    expect(invocations.filter(invocation => invocation.role === 'local-architect').at(-1)?.base).toBe(accepted);
    const architect = opened.agent!.sessions.filter(session => session.spec.role === 'local-architect').at(-1)!;
    expect(architect.spec.prompt).toContain(`committed as ${accepted}`);
    scripted.assertComplete();
  }, 120_000);
});

describe('the message the harness writes', () => {
  test('it is a pure function of the records, and an agent\'s words reach it only as the summary', () => {
    const gate: GateAttempt = {
      schema: 'ramify-agent.gate-attempt/3',
      id: 'ga-0012', checkpoint: 'iteration',
      subject: { workItem: 'wi-001', iteration: 'wi-001.i02' },
      proposedBy: 'inv-0014', repairRound: 1, infrastructureAttempt: 0,
      head: 'abc', commit: null, audited: 'abc', evidence: null, guardedChanges: [],
      commands: [],
      audit: {
        requestId: '20260920T101500Z-3f9a1c:ga-0012', mode: 'project-default', status: 'completed',
        definition: { path: 'ramify-audit.json', blob: 'b'.repeat(40) },
        requestedSourceCommit: 'abc', auditedSourceCommit: 'abc', requestedMode: 'ramify-partial', executedMode: 'ramify-partial',
        fallbackReason: null, reuse: null, verdict: 'pass', detail: 'composed pass',
      },
      verdict: 'passed', cause: null, next: 'accept',
    };
    const parts = {
      runId: '20260920T101500Z-3f9a1c', planId: 'review-notes', gate,
      goal: 'send the customer email from the page',
      summary: 'Send the customer email from the page.',
      earlier: [{ id: 'ga-0011', verdict: 'failed', cause: 'in-scope' }],
      notCovered: ['test:cucumber (one supported runner)'],
      invocations: ['inv-0012', 'inv-0014'],
      modules: [{ kind: 'module-created' as const, module: 'workspace/reviews/notes', declaration: 'subs/workspace/subs/reviews/subs/notes/module.ramify' }],
    };

    const message = commitMessage(parts);
    expect(commitMessage(parts)).toBe(message);
    expect(message).toContain('wi-001.i02: send the customer email from the page');
    expect(message).toContain('Send the customer email from the page.');
    expect(message).not.toContain('Checks:');
    expect(message).toContain('Earlier attempts: ga-0011 failed (in-scope)');
    expect(message).toContain('Not covered: test:cucumber (one supported runner)');
    expect(message).toContain('Modules created: workspace/reviews/notes (subs/workspace/subs/reviews/subs/notes/module.ramify)');
    expect(message).toContain('Ramify-Run: 20260920T101500Z-3f9a1c');
    expect(message).toContain('Ramify-Gate: ga-0012');
    expect(message).toContain('Audit-Note: git notes --ref=audit show <commit>');
    expect(message).toContain('Ramify-Invocations: inv-0012, inv-0014');
  });
});
