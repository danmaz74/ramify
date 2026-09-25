import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { gateDiagnostics } from '../checks/diagnostics.js';
import { runGate } from '../checks/gate.js';
import { setupChecks } from '../checks/checkpoint.js';
import { checkCommand, type GateAttempt } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { runLayout } from '../run/records.js';
import { copyFixture, temporaryDirectory } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, edit, outline, submit, treeInputs } from './helpers/iterations.js';
import { mockGit } from './helpers/mock-git.js';
import { finalCandidate } from './helpers/final-candidate.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { createMappedCheckExecution, type DirectCheckStep } from './helpers/direct-check-execution.js';
import { installTestRunner, onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';

/*
 * The project's setup commands at a committing gate, and what a failure of
 * one is attributed to.
 *
 * A setup command that ran and exited non-zero failed on the source it was
 * given: after readiness passed, the change since the last passing state is
 * the assignment's own, so the failure is in scope and the engineer repairs
 * it from what the command printed. One that did not finish, could not start
 * or was stopped is infrastructure, whose bounded retry follows. Either way
 * nothing after it ran, and the attempt says so rather than that its
 * commands selected or found nothing.
 *
 * Every command here is answered by a direct executor, which keeps every
 * later command from running once a setup command did not pass, as the
 * in-place and audit executors do; no process is started.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { expectNoProcesses(); } finally { forgetExternalTools(); }
});

const buildError = "src/notes.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.";

/** One iteration attempt over a temporary project, its setup answered by `setup` and every other command passing. */
async function attempt(setup: DirectCheckStep, checkpoint: GateAttempt['checkpoint'] = 'iteration'): Promise<GateAttempt> {
  const directory = await temporaryDirectory();
  cleanups.push(directory.remove);
  const checks: PlannedCheck[] = [
    ...setupChecks([{ name: 'build', command: [process.execPath, 'scripts/build.mjs'] }], directory.path),
    {
      kind: 'tests', command: checkCommand({ argv: [process.execPath, 'run'], cwd: directory.path, timeoutMs: 30_000 }), attribution: 'in-scope',
      selection: { policy: 'owned-by-scope', exactOwners: ['project/notes'], subtrees: [], extraSuites: [], resolved: ['src/tests/notes.test.ts'] },
      requiresTests: true,
    },
    { kind: 'type-check', command: checkCommand({ argv: [process.execPath, 'tsc'], cwd: directory.path, timeoutMs: 30_000 }), attribution: 'project' },
  ];
  return runGate(createMappedCheckExecution({ script: ({ check }) => (check.kind === 'setup' ? setup : {}) }), checkpoint, {
    id: 'ga-0002',
    projectRoot: directory.path,
    directory: join(directory.path, 'gate'),
    head: 'HEAD',
    checks,
    limits: { repairRounds: 2, infrastructureRetries: 2 },
    writeScope: ['src'],
  });
}

describe('a setup command that did not pass at a gate', () => {
  test('one that exited non-zero is in scope, the engineer\'s to repair, and its briefing quotes the command and what it printed', async () => {
    const gate = await attempt({ stderr: `${buildError}\n`, outcome: { kind: 'completed', exitCode: 2 } });

    expect(gate.commands.map(command => [command.kind, command.outcome, command.notVerified ?? null])).toEqual([
      ['setup', 'failed', null],
      ['tests', 'not-verified', 'setup-failed'],
      ['type-check', 'not-verified', 'setup-failed'],
    ]);
    expect([gate.verdict, gate.cause, gate.next]).toEqual(['failed', 'in-scope', 'repair']);
    expect(gate.commands[0]).toMatchObject({ name: 'build', exitCode: 2 });

    const briefed = await gateDiagnostics(gate, 'engineer');
    expect(briefed.summary).toEqual([
      `- \`setup\`, the setup command "build" (\`${process.execPath} scripts/build.mjs\`): failed, exit 2; its complete output is in \`${gate.commands[0]!.output.path}\`; the end of what it printed:`,
      `      ${buildError}`,
      '- not run, because the setup command "build" (`' + `${process.execPath} scripts/build.mjs` + '`) did not pass: `tests`, `type-check`',
    ]);
    // Nothing says a selection was empty or a test was missing.
    expect(briefed.summary.join('\n')).not.toMatch(/selected no|empty-selection|not verified/u);
  });

  test('one that did not finish in time is infrastructure, and its bounded retry follows', async () => {
    const gate = await attempt({ outcome: { kind: 'timed-out', timeoutMs: 600_000 } });
    expect(gate.commands.map(command => command.notVerified)).toEqual(['timeout', 'setup-failed', 'setup-failed']);
    expect([gate.verdict, gate.cause, gate.next]).toEqual(['not-verified', 'timeout', 'retry-infrastructure']);
  });

  test('one that could not start is infrastructure, with the error that stopped it', async () => {
    const gate = await attempt({ outcome: { kind: 'runner-error', error: { kind: 'setup-command-spawn-failed', message: 'Setup command 1/1 "build" could not start' } } });
    expect(gate.commands[0]).toMatchObject({ outcome: 'not-verified', notVerified: 'runner-error', runnerError: { kind: 'setup-command-spawn-failed' } });
    expect([gate.verdict, gate.cause, gate.next]).toEqual(['not-verified', 'infrastructure', 'retry-infrastructure']);
  });

  test('at a work-item gate, one that exited non-zero follows the work item\'s own next step, with no probe to tell scope', async () => {
    const gate = await attempt({ stderr: `${buildError}\n`, outcome: { kind: 'completed', exitCode: 2 } }, 'work-item');
    expect([gate.verdict, gate.cause]).toEqual(['failed', 'in-scope']);
    const briefed = await gateDiagnostics(gate, 'local-architect');
    expect(briefed.summary[0]).toContain('the setup command "build"');
  });
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const source = `${notesDirectory}/src/notes.ts`;

describe('the declared setup over a run', () => {
  test('the build the engineer broke fails its iteration gate in scope, and the engineer repairs it from the build\'s own output', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    const root = fixture.root;
    await addModule(root, notesDirectory, 'notes', {
      'src/notes.ts': 'export const noteLimit = 400;\n',
      'src/tests/notes.test.ts': 'import { test } from \'vitest\';\ntest(\'the limit\', () => undefined);\n',
    });
    await installTestRunner(root);
    const config = JSON.parse(await readFile(join(root, 'ramify-agent.json'), 'utf8')) as Record<string, unknown>;
    await writeFile(join(root, 'ramify-agent.json'), `${JSON.stringify({ ...config, setup: [{ name: 'build', command: ['node', 'scripts/build.mjs'] }] }, null, 2)}\n`);

    let head = 'base';
    const final = finalCandidate(root, 'repaired-build');
    let previewIndex = 0;
    const git = mockGit({
      previewCandidateTree: async project => {
        expect(project).toBe(root);
        const preview = final.previews[previewIndex++];
        if (preview === undefined) throw new Error(`Unscripted final tree preview ${previewIndex}`);
        expect(preview.head).toBe(head);
        return preview;
      },
      currentHead: async () => head,
      isCleanRepository: async () => true,
      createRunBranch: async (_root, runId) => ({ branch: `ramify-agent-run/${runId}`, created: true }),
      findCommitByTrailers: async () => null,
      changedPaths: async (_root, accepted) => accepted === 'scenarios' ? [source] : [],
      changedEntries: async (_root, accepted) => accepted === 'scenarios' ? [{ status: 'M', path: source }] : [],
      diffNameStatus: async () => [{ status: 'M', path: source }],
      worktreeLineChanges: async () => { throw new Error('Line metrics not scripted in the setup scenario'); },
    });
    git.commitAccepted
      .mockImplementationOnce(async (_root, message) => { expect(message).toMatch(/^Scenarios of /u); head = 'scenarios'; return head; })
      .mockImplementationOnce(async () => { head = 'broken-build'; return head; })
      .mockImplementationOnce(async () => { head = 'repaired-build'; return head; })
      .mockResolvedValue(null);
    const opened = await openRuns(root, {
      inputs: treeInputs(), git, candidates: final.candidates, readinessExecution: directReadinessExecution(),
      // The engineer's first change breaks the build; its repair builds.
      checkScript: ({ check, context }) => check.kind === 'setup' && context.sourceCommit === 'broken-build'
        ? { stderr: `${buildError}\n`, outcome: { kind: 'completed', exitCode: 2 } }
        : {},
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
        engineer: [
          submit(completionProposed('Raised the limit to 500.'), edit(source, 'noteLimit = 400', 'noteLimit = \'500\'')),
          submit(completionProposed('The limit is a number again.'), edit(source, 'noteLimit = \'500\'', 'noteLimit = 500')),
        ],
      }),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    expect(previewIndex).toBe(final.previews.length);

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const ids = [...new Set(events.filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate))];
    const attempts = await Promise.all(ids.map(async id =>
      JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate(id)), 'utf8')) as GateAttempt));
    const iteration = attempts.filter(gate => gate.checkpoint === 'iteration');
    expect(iteration.map(gate => [gate.verdict, gate.cause, gate.next])).toEqual([['failed', 'in-scope', 'repair'], ['passed', null, 'accept']]);
    // Every committing gate ran the declared setup first; the first found the build broken and ran nothing after it.
    for (const gate of attempts) expect(gate.commands[0]).toMatchObject({ kind: 'setup', name: 'build' });
    expect(iteration[0]!.commands.slice(1).every(command => command.notVerified === 'setup-failed')).toBe(true);
    expect(iteration[0]!.evidence).toBeNull();

    // The engineer's repair was briefed with the command, its exit code and what it printed.
    const engineers = opened.agent!.sessions.filter(session => session.spec.role === 'engineer');
    const repair = engineers.at(-1)!.spec.prompt;
    expect(repair).toContain(`Attempt \`${iteration[0]!.id}\` (in-scope). What ran, and what it reported:`);
    expect(repair).toContain('- `setup`, the setup command "build" (`node scripts/build.mjs`): failed, exit 2');
    expect(repair).toContain(buildError);
    expect(repair).toContain('- not run, because the setup command "build"');
    expect(git.unexpected).toEqual([]);
  }, 300_000);
});
