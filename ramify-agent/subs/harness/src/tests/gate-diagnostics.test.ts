import { mockGit } from './helpers/mock-git.js';
import { finalCandidate } from './helpers/final-candidate.js';
import { localArchitectToolName } from '../work/submission.js';
import { engineerToolName } from '../work/engineer.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { gateDiagnostics } from '../checks/diagnostics.js';
import { runGate } from '../checks/gate.js';
import { checkCommand, type GateAttempt, type GateAuditRecord } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { runLayout } from '../run/records.js';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline, submit, treeInputs } from './helpers/iterations.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { createMappedCheckExecution, type DirectCheckStep } from './helpers/direct-check-execution.js';

/*
 * What a failing gate says, and who answers it.
 *
 * A cause is not a diagnosis: an architect that received `outside-assignment`
 * and nothing else read it as a write outside the assignment, narrowed the
 * file list, and the same failure came back. So an attempt carries what each
 * failing command reported, a Ramify check's findings are attributed to the
 * files the report itself names, and a module violation goes to the local
 * architect whatever scope it lies in.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { expectNoProcesses(); } finally { forgetExternalTools(); }
});

const scope = 'subs/workspace/subs/reviews/subs/notes/src';
const source = `${scope}/notes.ts`;

/** A finding exactly as `ramify check --batch --format json` reports one. */
function notVisible(file: string, line: number): Record<string, unknown> {
  return {
    id: `source-diagnostic/1:${file}:${line}`,
    category: 'import',
    code: 'not-visible',
    message: 'collection-review:interfaces/protocol.ts#ToolResult: not-visible',
    location: { file, start: 587, end: 597, line, column: 3 },
    importer: { owner: 'collection-review/workspace/reviews/notes', kind: 'ordinary' },
    original: { kind: 'code', owner: 'collection-review', file: 'interfaces/protocol.ts', binding: 'ToolResult' },
  };
}

function checkReport(findings: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ schemaVersion: 'ramify.check/1', outcome: findings.length === 0 ? 'checked' : 'findings', findings });
}

const responses = new Map<string, DirectCheckStep>();
/** A declared external command response, without an executable stub. */
function prints(text: string, code: number, cwd: string) {
  const id = String(responses.size);
  responses.set(id, { stdout: text, outcome: { kind: 'completed', exitCode: code } });
  return checkCommand({ argv: [process.execPath, '-e', id], cwd, timeoutMs: 30_000 });
}

/** A committing gate's audit record, completed, for the default mode of `candidate`. */
function configuredAudit(overrides: Partial<GateAuditRecord> = {}): GateAuditRecord {
  return {
    requestId: 'run-diagnostics:ga-0001', mode: 'project-default', status: 'completed',
    definition: { path: 'ramify-audit.json', blob: 'definition-blob' },
    requestedSourceCommit: 'candidate', auditedSourceCommit: 'candidate',
    requestedMode: 'ramify-partial', executedMode: 'ramify-partial', fallbackReason: null,
    reuse: null, verdict: 'pass', detail: 'composed pass', nested: false, projects: null, discovery: null, ...overrides,
  };
}

/** One attempt over a temporary directory, with the checks a test names. */
async function attempt(checks: readonly PlannedCheck[], writeScope?: readonly string[]): Promise<GateAttempt> {
  const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return runGate(createMappedCheckExecution({ script: ({ checkIndex }) => {
    const response = responses.get(checks[checkIndex]!.command.argv[2]!);
    expect(response).toBeDefined();
    return response!;
  } }), 'iteration', {
    id: 'ga-0001',
    projectRoot: directory,
    directory: join(directory, 'gate'),
    head: 'HEAD',
    checks,
    limits: { repairRounds: 2, infrastructureRetries: 1 },
    ...(writeScope === undefined ? {} : { writeScope }),
  });
}

describe('a Ramify check that failed at a gate', () => {
  test('retains every nested provider failure and malformed command error by its exact check ID', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-provider-diagnostics-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const base = await attempt([
      { kind: 'type-check', command: prints('failed\n', 1, directory) },
      { kind: 'type-check', name: 'second', command: prints('malformed\n', 1, directory) },
    ]);
    const longMessage = `first failure: ${'detail '.repeat(1500)} END`;
    const gate: GateAttempt = {
      ...base,
      commands: base.commands.map((command, index) => ({ ...command, providerCheckId: index === 0 ? 'suite-tests' : 'scenario-profiles' })),
      provider: {
        result: { status: 'completed', refs: { reportCommit: 'exact-report' } },
        checks: {
          'suite-tests': { status: 'fail', commands: {
            first: { status: 'fail', failedTests: [{ name: 'alpha', errorFull: longMessage }] },
            second: { status: 'fail', failedTests: [{ name: 'beta', errorFull: 'second failure' }] },
          } },
          'scenario-profiles': { status: 'fail', commands: { profile: { status: 'fail',
            runnerError: { kind: 'malformed-result', message: 'NDJSON line 4 is malformed' },
            cucumberMessages: { status: 'undecodable', detail: 'line 4', raw: 'private large stream', artifactPath: 'reports/raw/profile.ndjson' },
          } } },
        },
      },
    };
    const lines = (await gateDiagnostics(gate, 'engineer')).summary.join('\n');
    expect(lines).toContain(longMessage);
    expect(lines).toContain('second failure');
    expect(lines).toContain('malformed-result');
    expect(lines).toContain('reports/raw/profile.ndjson');
    expect(lines).not.toContain('private large stream');
    expect(lines).toContain('counts: unknown');
  });

  test('a committing gate names every failing configured check from the provider record, by its exact check ID', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-provider-diagnostics-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const base = await attempt([{ kind: 'type-check', command: prints('', 0, directory) }]);
    const longMessage = `first failure: ${'detail '.repeat(1500)} END`;
    const gate: GateAttempt = {
      ...base, commands: [], verdict: 'failed', cause: 'check-failed', next: 'repair',
      audit: configuredAudit({ verdict: 'fail', detail: 'composed fail' }),
      provider: {
        result: { status: 'completed', summary: { coverage: { universe: { checkIds: ['suite-tests', 'scenario-profiles', 'web-build'] } } } },
        checks: {
          'suite-tests': { status: 'fail', output: 'the suite printed this last\n', commands: {
            first: { status: 'fail', failedTests: [{ name: 'alpha', errorFull: longMessage }] },
            second: { status: 'fail', failedTests: [{ name: 'beta', errorFull: 'second failure' }] },
          } },
          'scenario-profiles': { status: 'fail', commands: { profile: { status: 'fail',
            runnerError: { kind: 'malformed-result', message: 'NDJSON line 4 is malformed' },
            cucumberMessages: { status: 'undecodable', detail: 'line 4', raw: 'private large stream', artifactPath: 'reports/raw/profile.ndjson' },
          } } },
        },
      },
    };
    const summary = (await gateDiagnostics(gate, 'engineer')).summary;
    const lines = summary.join('\n');
    expect(summary[0]).toBe('- audit `run-diagnostics:ga-0001`, the project\'s default audit of `candidate` under `ramify-audit.json`: requested ramify-partial, executed ramify-partial; composed verdict `fail`, composed fail');
    expect(lines).toContain('- `suite-tests`: fail; the provider\'s record of it follows:');
    expect(lines).toContain(longMessage);
    expect(lines).toContain('second failure');
    expect(lines).toContain('malformed-result');
    expect(lines).toContain('reports/raw/profile.ndjson');
    expect(lines).not.toContain('private large stream');
    expect(lines).toContain('counts: unknown');
    expect(lines).toContain('        the suite printed this last');
    // The universe's check the record did not run is named, not guessed at.
    expect(lines).toContain('- not run by this record, as the provider selected: `web-build`');
  });

  test('a failed gate briefing attributes queued time to the machine lock with the recorded provider line', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-cwd-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const base = await attempt([{ kind: 'type-check', command: prints('', 0, directory) }]);
    const gate: GateAttempt = {
      ...base, commands: [], verdict: 'failed', cause: 'check-failed', next: 'repair',
      audit: configuredAudit({ verdict: 'fail', detail: 'composed fail' }),
      provider: { result: { status: 'completed' }, checks: { 'agent-tests': { status: 'failed', output: 'failed assertion\n' } } },
    };
    const line = 'Waiting for another test run (fixture)';
    const briefed = await gateDiagnostics(gate, 'engineer', new Map(), new Map([[1, line]]));
    expect(briefed.summary.slice(1, 3)).toEqual([
      `- a configured check waited for the machine test lock: ${line}`,
      '- `agent-tests`: failed; the provider\'s record of it follows:',
    ]);
    expect(briefed.summary).toContain('        failed assertion');
  });

  test('a reused record names the commit it audited and the changed paths its policy ignores', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-cwd-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const base = await attempt([{ kind: 'type-check', command: prints('', 0, directory) }]);
    const gate: GateAttempt = {
      ...base, commands: [], verdict: 'passed', cause: null,
      audit: configuredAudit({ verdict: 'pass', detail: 'composed pass', auditedSourceCommit: 'audited',
        reuse: { auditedCommit: 'audited', ignoredChangedPaths: ['docs/notes.md'], requestedMode: 'ramify-partial', resolution: 'defaulted' } }),
      provider: { result: { status: 'completed' }, checks: { 'agent-tests': { status: 'passed', counts: { passed: 3 } } } },
    };
    const summary = (await gateDiagnostics(gate, 'engineer')).summary;
    expect(summary).toEqual([
      '- audit `run-diagnostics:ga-0001`, the project\'s default audit of `candidate` under `ramify-audit.json`: requested ramify-partial, executed ramify-partial; composed verdict `pass`',
      '  - it reused the record of `audited`, which applies to this commit: its policy ignores `docs/notes.md`',
      '- `agent-tests`: passed; counts: {"passed":3}',
    ]);
  });

  test('a nested final audit names each project\'s verdict, execution, counts and failures, and every skipped tree', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-cwd-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const base = await attempt([{ kind: 'type-check', command: prints('', 0, directory) }]);
    const bucket = (total: number, failed: number) => ({ total, passed: total - failed, failed, skipped: 0 });
    const project = { requestedMode: 'full' as const, executedMode: 'full' as const, fallbackReason: null, reuse: null, evidence: null,
      status: 'completed' as const, detail: 'completed', auditedSourceCommit: 'candidate' };
    const gate: GateAttempt = {
      ...base, commands: [], verdict: 'failed', cause: 'check-failed',
      audit: configuredAudit({ mode: 'full', nested: true, requestedMode: 'full', executedMode: 'full', verdict: 'fail', detail: 'invocation fail over 2 projects; failed: packages/engine',
        projects: [
          { ...project, projectRoot: '.', verdict: 'pass', execution: 'reused', failures: [], requestId: 'root-request',
            retrievalCommands: ['git show root-report:report.json'], durationSeconds: 12, counts: { checks: bucket(2, 0), tests: bucket(40, 0), scenarios: null } },
          { ...project, projectRoot: 'packages/engine', verdict: 'fail', execution: 'ran', failures: ['engine-tests failed'], requestId: 'engine-request',
            retrievalCommands: ['git show engine-report:report.json'], durationSeconds: 3, counts: { checks: bucket(1, 1), tests: bucket(5, 1), scenarios: null } },
        ],
        discovery: { status: 'complete', unavailable: [],
          skipped: [{ projectRoot: 'vendor/lib', enclosingProject: '.', reason: 'external', directory: 'vendor' }] } }),
    };
    const summary = (await gateDiagnostics(gate, 'engineer')).summary;
    expect(summary).toEqual([
      '- audit `run-diagnostics:ga-0001`, a full audit of `candidate` under `ramify-audit.json`: requested full, executed full; composed verdict `fail`, invocation fail over 2 projects; failed: packages/engine',
      '- the nested request answered 2 projects:',
      '  - `.`: `pass`, reused, executed full; checks 2/2 passed, tests 40/40 passed; 12s',
      '  - `packages/engine`: `fail`, ran, executed full; checks 0/1 passed, 1 failed, tests 4/5 passed, 1 failed; 3s',
      '    - engine-tests failed',
      '    - retrieve: `git show engine-report:report.json`',
      '- not audited: `vendor/lib` inside `.`, skipped as external (`vendor`)',
    ]);
  });

  test('its findings reach the engineer for repair without location-based ownership inference', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-cwd-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));

    const gate = await attempt([
      { kind: 'type-check', command: prints('ok 1 - the limit\n', 0, directory) },
      { kind: 'type-check', command: prints('', 0, directory) },
      { kind: 'ramify-check', command: prints(checkReport([notVisible(source, 13)]), 1, directory) },
    ], [scope]);

    expect(gate.verdict).toBe('failed');
    // Every finding lies inside the write scope, so the failure is in scope.
    expect(gate.cause).toBe('check-failed');
    expect(gate.attribution).toBeUndefined();
    expect(gate.next).toBe('repair');

    const briefed = await gateDiagnostics(gate, 'local-architect');
    expect(briefed.summary.join('\n')).toContain(`${source}:13 imports `);
    expect(briefed.summary.join('\n')).toContain('full output:');
    const engineer = await gateDiagnostics(gate, 'engineer');
    expect(engineer.summary).toEqual(briefed.summary);
  }, 60_000);

  test('a finding outside the write scope is still delivered to the engineer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-cwd-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));

    const gate = await attempt([
      { kind: 'type-check', command: prints('ok\n', 0, directory) },
      { kind: 'ramify-check', command: prints(checkReport([notVisible('subs/other/src/mcp.ts', 4)]), 1, directory) },
    ], [scope]);

    expect(gate.cause).toBe('check-failed');
    expect(gate.attribution).toBeUndefined();
    expect(gate.next).toBe('repair');
  }, 60_000);

  test('a failure that is not a Ramify check keeps the rules it had: in scope, and one repair round', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-cwd-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const lines = Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join('\n');

    const gate = await attempt([
      { kind: 'type-check', command: prints(`${lines}\n`, 1, directory) },
      { kind: 'ramify-check', command: prints(checkReport([]), 0, directory) },
    ], [scope]);

    expect(gate.cause).toBe('check-failed');
    expect(gate.attribution).toBeUndefined();
    expect(gate.next).toBe('repair');

    // The command has no structured findings, so the end of its own output
    // is carried, bounded, and nothing of it is parsed.
    const briefed = await gateDiagnostics(gate, 'engineer');
    expect(briefed.summary[0]).toContain('full output:');
    const quoted = briefed.summary.slice(1, -1);
    expect(quoted).toHaveLength(40);
    expect(quoted[0]).toBe('      line 41');
    expect(quoted.at(-1)).toBe('      line 80');
    expect(briefed.summary.at(-1)).toBe('- `ramify-check`: passed, exit 0');
  }, 60_000);
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

describe('a module violation at the iteration gate, over a run', () => {
  test('the iteration returns to the same engineer with the finding before completion', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    const root = fixture.root;
    await addModule(root, notesDirectory, 'notes', {
      'src/notes.ts': 'export const noteLimit = 400;\n',
      'src/tests/notes.test.ts': [
        'import { test, expect } from \'vitest\';',
        'import { noteLimit } from \'../notes.ts\';',
        '',
        'test(\'the limit is what the plan asks for\', () => { expect(noteLimit).toBe(500); });',
        '',
      ].join('\n'),
    });
    await installMiniRunner(root);

    let head = 'base';
    const final = finalCandidate(root, 'repaired-source');
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
      // The feature files' commit is the boundary the engineer's change is asked against.
      changedPaths: async (_root, accepted) => accepted === 'scenarios' ? [source] : [],
      changedEntries: async (_root, accepted) => accepted === 'scenarios' ? [{ status: 'M', path: source }] : [],
      diffNameStatus: async (_root, from, to) => {
        expect([from, to]).toEqual(['scenarios', 'repaired-source']);
        return [{ status: 'M', path: source }];
      },
      worktreeLineChanges: async () => { throw new Error('Line metrics not scripted in diagnostic scenario'); },
    });
    git.commitAccepted
      .mockImplementationOnce(async (_root, message) => { expect(message).toMatch(/^Scenarios of /u); head = 'scenarios'; return head; })
      .mockImplementationOnce(async () => { head = 'repaired-source'; return head; }).mockResolvedValue(null);
    const opened = await openRuns(root, {
      inputs: treeInputs(), git, candidates: final.candidates,
      checkScript: ({ check, context }) => check.kind === 'ramify-check' && context.attemptId === 'ga-0002'
        ? { stdout: checkReport([notVisible(source, 13)]), outcome: { kind: 'completed', exitCode: 1 } }
        : {},
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [
          submit(assign(notes, {}, outline())),
          submit(requestCompletion()),
        ],
        engineer: [
          submit(completionProposed('Raised the limit to 500.'), edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500')),
          submit(completionProposed('Used what the module receives.')),
        ],
      }),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');

    // The failed attempt is retained, and the same engineer repairs it.
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const ids = [...new Set(events.filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate))];
    const attempts = await Promise.all(ids.map(async id =>
      JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate(id)), 'utf8')) as GateAttempt));
    const failed = attempts.find(gate => gate.subject.iteration === 'wi-001.i01')!;
    expect([failed.cause, failed.next]).toEqual(['check-failed', 'repair']);
    expect(failed.attribution).toBeUndefined();

    const result = JSON.parse(await readFile(
      runPath(root, 'review-notes', runId, iterationLayout.result('wi-001', 1)), 'utf8')) as IterationResult;
    expect(result.invocations).toHaveLength(2);
    const engineers = opened.agent!.sessions.filter(session => session.spec.submission.name === engineerToolName);
    // The configured Ramify check's own report reaches the same engineer, as
    // the provider recorded what it printed.
    expect(engineers[1]!.spec.prompt).toContain('- `ramify-check`: failed; the provider\'s record of it follows:');
    expect(engineers[1]!.spec.prompt).toContain(`"file":"${source}"`);
    expect(engineers[1]!.spec.prompt).toContain('"code":"not-visible"');
    expect(previewIndex).toBe(final.previews.length);
    expect(git.unexpected).toEqual([]);
  }, 300_000);
});
