import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { FindingsSeen, findingIdentities, runHookCheck, type HookCheck } from '../hooks/post-write.js';
import { runLayout, type InvocationOutcome } from '../run/records.js';
import type { Observation } from '../run/observations.js';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline, submit, treeInputs } from './helpers/iterations.js';
import { initRepository, onlyRun, openRuns, runPath, startRun } from './helpers/runs.js';
import { gitService } from '../../subs/evidence/src/git.js';

/*
 * The post-write hook check.
 *
 * The harness installs Ramify's hook itself, because the adapter disables
 * automatic extension discovery, and runs it after each settled mutation.
 * What these tests hold it to is the one rule that matters: a check that did
 * not check is never a pass, and where a changed check covers nothing the
 * harness runs a complete one instead of claiming hook coverage.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A `ramify` whose answers this test chooses, spawned like any other executable. */
async function stub(body: string, options: { readonly timeoutMs?: number } = {}): Promise<{ ramify: RamifyCli; root: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-hook-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, 'ramify');
  await writeFile(executable, `#!/bin/sh\n${body}\n`);
  await chmod(executable, 0o755);
  return { ramify: new RamifyCli({ executable, timeoutMs: options.timeoutMs ?? 30_000 }), root: directory };
}

function request(ramify: RamifyCli, root: string, paths: readonly string[] | null, seen = new FindingsSeen()) {
  return { ramify, projectRoot: root, paths, hookTimeoutMs: 2_000, seen, ran: 0, logFile: (check: number) => join(root, 'hooks', `${check}.json`) };
}

describe('a hook check after a settled mutation', () => {
  test('findings are reported with their count, and the same finding reported again is not new', async () => {
    const finding = '{"schemaVersion":"ramify.check/1","outcome":"findings","findings":[{"code":"denied-access","severity":"error","file":"a.ts","message":"not exposed"}]}';
    const { ramify, root } = await stub(`echo '${finding}'\nexit 1`);
    const seen = new FindingsSeen();

    const first = await runHookCheck(request(ramify, root, ['a.ts'], seen));
    const again = await runHookCheck({ ...request(ramify, root, ['a.ts'], seen), ran: 1 });

    expect(first.checks).toHaveLength(1);
    expect(first.checks[0]).toMatchObject({ mode: 'changed', outcome: 'findings', paths: ['a.ts'], newFindings: 1 });
    expect(first.checks[0]!.outcome).not.toBe('passed');
    expect(first.text).toContain('RAMIFY MODULE VIOLATION');
    expect(first.text).toContain('a.ts: not exposed [denied-access]');
    expect(await readFile(first.checks[0]!.log!, 'utf8')).toContain('denied-access');

    // The second check reports the same finding; it is not newly introduced.
    expect(again.checks[0]!.newFindings).toBe(0);
    expect(again.text).toContain('RAMIFY MODULE VIOLATION still standing (1)');
    expect(seen.size).toBe(1);
  });

  test('a deadline that expires is not checked with the CLI\'s reason, and is never a pass', async () => {
    const { ramify, root } = await stub('sleep 1\necho \'{"schemaVersion":"ramify.check/1","outcome":"not-checked","reason":"cold"}\'\nexit 2');

    const result = await runHookCheck(request(ramify, root, ['a.ts']));

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.outcome).toBe('not-checked');
    expect(result.checks[0]!.reason).toBe('cold');
    expect(result.checks[0]!.newFindings).toBe(0);
    expect(result.text).toContain('Nothing was verified by this check');
    expect(result.text).toContain('not a pass');
    // Exit 2 permits continued editing: no complete check follows it, and
    // the invocation is not ended.
    expect(result.gaps).toEqual([]);
  });

  test('an executable that never answers within the harness\'s own bound is not checked either', async () => {
    const { ramify, root } = await stub('sleep 30', { timeoutMs: 400 });

    const result = await runHookCheck(request(ramify, root, ['a.ts']));

    expect(result.checks[0]!.outcome).toBe('not-checked');
    expect(result.checks[0]!.reason).toContain('exited with');
    expect(result.text).toContain('Nothing was verified by this check');
  });

  test('a named configuration file is answered at once as not checked, and a complete check runs instead', async () => {
    const { ramify, root } = await stub([
      'if [ "$2" = "--batch" ]; then',
      '  echo \'{"schemaVersion":"ramify.analysis/1","diagnostics":[]}\'',
      '  exit 0',
      'fi',
      'echo "the changed form should not have been run" >&2',
      'exit 9',
    ].join('\n'));

    const result = await runHookCheck(request(ramify, root, ['vitest.config.ts', 'src/a.ts']));

    expect(result.checks.map(check => ({ mode: check.mode, outcome: check.outcome }))).toEqual([
      { mode: 'changed', outcome: 'not-checked' },
      { mode: 'complete', outcome: 'passed' },
    ]);
    expect(result.checks[0]!.reason).toContain('vitest.config.ts');
    expect(result.checks[0]!.log).toBeNull();
    // The changed form never ran, so nothing claims hook coverage of it.
    expect(result.checks[1]!.log).not.toBeNull();
    // The complete check covered everything the changed form would have and
    // it passed, so there is no gap left to tell the engineer about.
    expect(result.text).toBeNull();
  });

  test('a mutation whose changed set is unknown records the gap and runs a complete check', async () => {
    const { ramify, root } = await stub([
      'if [ "$2" = "--batch" ]; then',
      '  echo \'{"schemaVersion":"ramify.analysis/1","diagnostics":[{"code":"c","severity":"error","file":"b.ts","message":"m"}]}\'',
      '  exit 1',
      'fi',
      'exit 9',
    ].join('\n'));

    const result = await runHookCheck(request(ramify, root, null));

    expect(result.gaps).toEqual([{
      kind: 'changed-paths-unknown',
      detail: 'the mutation named no path the harness could establish, so a changed check covers nothing and a complete check was run',
    }]);
    expect(result.checks.map(check => check.mode)).toEqual(['changed', 'complete']);
    expect(result.checks[0]!.outcome).toBe('not-checked');
    expect(result.checks[1]!.outcome).toBe('findings');
    expect(result.checks[1]!.newFindings).toBe(1);
    // What the engineer is told is the complete check's own answer, and not
    // that the changed form it replaced verified nothing.
    expect(result.text).toContain('RAMIFY MODULE VIOLATION');
    expect(result.text).not.toContain('Nothing was verified');
  });

  test('a shell call whose complete check passes is not told at all: the gap is recorded, not reported', async () => {
    const { ramify, root } = await stub([
      'if [ "$2" = "--batch" ]; then',
      '  echo \'{"schemaVersion":"ramify.analysis/1","diagnostics":[]}\'',
      '  exit 0',
      'fi',
      'exit 9',
    ].join('\n'));

    const result = await runHookCheck(request(ramify, root, null));

    expect(result.checks.map(check => [check.mode, check.outcome])).toEqual([['changed', 'not-checked'], ['complete', 'passed']]);
    expect(result.gaps.map(gap => gap.kind)).toEqual(['changed-paths-unknown']);
    expect(result.text).toBeNull();
  });

  test('a shell call whose complete check could not run is told that it could not, and is never a pass', async () => {
    const { ramify, root } = await stub('echo \'{"schemaVersion":"ramify.check/1","outcome":"not-checked","reason":"cold"}\'\nexit 2');

    const result = await runHookCheck(request(ramify, root, null));

    expect(result.checks.map(check => [check.mode, check.outcome])).toEqual([['changed', 'not-checked'], ['complete', 'not-checked']]);
    expect(result.text).toBe([
      'Ramify hook check:',
      '- complete check over the whole project: not-checked (cold)',
      '  Nothing was verified by this check. It is not a pass, and you may keep editing.',
    ].join('\n'));
  });

  test('a check that passed with nothing new tells the engineer nothing', async () => {
    const { ramify, root } = await stub('echo \'{"schemaVersion":"ramify.check/1","outcome":"checked","findings":[]}\'\nexit 0');

    const result = await runHookCheck(request(ramify, root, ['src/a.ts']));

    expect(result.checks[0]).toMatchObject({ outcome: 'passed', newFindings: 0 } satisfies Partial<HookCheck>);
    expect(result.text).toBeNull();
  });

  test('both report shapes are read: `findings` of a changed check and `diagnostics` of a complete one, each identified by Ramify\'s id', () => {
    expect(findingIdentities({ findings: [{ id: 'source-diagnostic/1:a', code: 'a', new: true }] })).toEqual(['source-diagnostic/1:a']);
    expect(findingIdentities({ diagnostics: [{ id: 'source-diagnostic/1:a', code: 'a' }] })).toEqual(['source-diagnostic/1:a']);
    // An entry outside either contract is identified by itself, whether the
    // changed check marked it new or not, rather than dropped.
    expect(findingIdentities({ findings: [{ code: 'a', file: 'x.ts', new: true }] })).toEqual(findingIdentities({ diagnostics: [{ code: 'a', file: 'x.ts' }] }));
    expect(findingIdentities({ findings: ['a bare string'] })).toEqual(['"a bare string"']);
    expect(findingIdentities(null)).toEqual([]);
  });
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

describe('a mutation is observed even when the tool failed', () => {
  test('an edit that matched nothing changed no file, and is still a mutation with its hook check', async () => {
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
    await initRepository(root);

    const { service } = await openRuns(root, {
      git: gitService,
      inputs: treeInputs(),
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
        engineer: [submit(
          completionProposed('Raised the limit, after one edit that matched nothing.'),
          // The tool runs, fails and changes nothing. It is a mutation all
          // the same: the harness never learns what it did from its result.
          edit('notes.ts', 'noteLimit = 999', 'noteLimit = 500'),
          edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
        )],
      }),
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    expect(onlyRun(service, 'review-notes').state).toBe('completed');

    const result = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, iterationLayout.result('wi-001', 1)), 'utf8')) as IterationResult;
    const invocation = result.invocations[0]!;
    const observations = (await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.observations(invocation)), 'utf8'))
      .split('\n').filter(Boolean).map(line => JSON.parse(line) as Observation);

    const byTool = observations.filter(line => line.type === 'mutation' && line.data.observedBy === 'tool');
    expect(byTool).toHaveLength(2);
    expect(byTool.map(line => (line.type === 'mutation' ? line.data.toolFailed : null))).toEqual([true, false]);
    expect(byTool.every(line => line.type === 'mutation' && line.data.attributable)).toBe(true);
    expect(byTool.every(line => line.type === 'mutation' && line.data.paths.length === 1)).toBe(true);

    // One hook check per settled mutation, and the run's stubbed `ramify`
    // checks nothing, which is recorded as such and never as a pass.
    const hooks = observations.filter(line => line.type === 'hook-check');
    // Two checks after the two settled mutations, and the fresh check the
    // claimed completion was judged against, which names itself.
    expect(hooks.map(line => (line.type === 'hook-check' ? line.data.atCompletion ?? false : null))).toEqual([false, false, true]);
    expect(hooks.every(line => line.type === 'hook-check' && line.data.outcome === 'not-checked')).toBe(true);
    expect(hooks.every(line => line.type === 'hook-check' && line.data.mode === 'changed')).toBe(true);

    // Nothing of it reached `outsideScope`: both calls named the same file
    // inside the scope, and the failed one changed nothing at all.
    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.outcome(invocation)), 'utf8')) as InvocationOutcome;
    expect(outcome.outsideScope).toEqual([]);
  }, 300_000);
});

/** A finding exactly as `ramify check --changed --format json` reports one. */
function notVisible(file: string, line: number): Record<string, unknown> {
  return {
    id: `source-diagnostic/1:${file}:${line}`,
    category: 'import',
    code: 'not-visible',
    message: 'collection-review:interfaces/protocol.ts#ToolResult: not-visible',
    location: { file, start: 587, end: 597, line, column: 3 },
    related: [{ file: 'src/interfaces/protocol.ts', start: 2478, end: 2578, line: 64, column: 1 }],
    importer: { owner: 'collection-review/workspace/reviews', kind: 'ordinary', root: 'subs/workspace/subs/reviews/src', profile: ['dispatch'] },
    original: { kind: 'code', owner: 'collection-review', file: 'interfaces/protocol.ts', binding: 'ToolResult' },
    accessId: `access/1:${file}`,
    new: true,
  };
}

function checkReport(findings: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ schemaVersion: 'ramify.check/1', outcome: findings.length === 0 ? 'checked' : 'findings', findings });
}

describe('what the engineer is told about a Ramify module violation', () => {
  const mcp = 'subs/workspace/subs/reviews/src/mcp.ts';

  test('the finding itself reaches the engineer, labelled, located and with what to do, never as a file to open', async () => {
    const { ramify, root } = await stub(`echo '${checkReport([notVisible(mcp, 13)])}'\nexit 1`);

    const result = await runHookCheck(request(ramify, root, [mcp]));

    expect(result.text).toBe([
      'RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.',
      `- ${mcp}:13 imports \`ToolResult\` from src/interfaces/protocol.ts (module \`collection-review\`), which does not expose it to your module. \`import type\` counts too.`,
      'Fix: drop the import and use what your API view, named in your assignment, lists instead. If nothing there serves, submit `unsuitable` with reason `scope`, naming `ToolResult` and its owner: the architect decides whether it is exposed. Say so if a symbol you already receive mentions it in its signature; that is an incomplete exposure. Never copy or derive it, and `collection-review`\'s module.ramify is outside your write scope. `completion-proposed` is refused while this stands.',
    ].join('\n'));
    // The report is kept for the record, but the engineer is not sent to it.
    expect(result.text).not.toContain(root);
  });

  test('a finding stands until a check covering its file no longer reports it, and a check that did not check clears nothing', async () => {
    const report = join(tmpdir(), `ramify-agent-hook-report-${process.pid}-${Date.now()}.json`);
    cleanups.push(() => rm(report, { force: true }));
    await writeFile(report, checkReport([notVisible(mcp, 13)]));
    // The stub answers what the test last wrote, and exit 2 when told to.
    const { ramify, root } = await stub(`if grep -q not-checked '${report}'; then cat '${report}'; exit 2; fi\ncat '${report}'\ngrep -q '"findings":\\[\\]' '${report}' && exit 0\nexit 1`);
    const seen = new FindingsSeen();

    await runHookCheck(request(ramify, root, [mcp], seen));
    expect(seen.open().map(finding => finding.code)).toEqual(['not-visible']);

    // An edit elsewhere answers only for its own file.
    await writeFile(report, checkReport([]));
    await runHookCheck({ ...request(ramify, root, ['subs/workspace/subs/reviews/src/other.ts'], seen), ran: 1 });
    expect(seen.open()).toHaveLength(1);

    // A check that did not check answers for nothing.
    await writeFile(report, JSON.stringify({ schemaVersion: 'ramify.check/1', outcome: 'not-checked', reason: 'cold' }));
    await runHookCheck({ ...request(ramify, root, [mcp], seen), ran: 2 });
    expect(seen.open()).toHaveLength(1);

    // The line moved: the same violation, still standing, spelled out again.
    await writeFile(report, checkReport([notVisible(mcp, 15)]));
    const moved = await runHookCheck({ ...request(ramify, root, [mcp], seen), ran: 3 });
    expect(seen.open().map(finding => finding.line)).toEqual([15]);
    expect(moved.text).toContain(`${mcp}:15 imports \`ToolResult\``);

    // The file checked clean clears it, and that is said in one line: an
    // edit that removes a reported violation is answered, not passed over.
    await writeFile(report, checkReport([]));
    const clean = await runHookCheck({ ...request(ramify, root, [mcp], seen), ran: 4 });
    expect(seen.open()).toEqual([]);
    expect(clean.text).toBe(`Cleared: the Ramify module violation reported earlier (${mcp}:15) no longer stands.`);
  });
});

/**
 * A `ramify` that prints the document the test last gave it and exits with
 * the code given beside it, for either form of check.
 */
async function answering(): Promise<{ ramify: RamifyCli; root: string; answer: (document: unknown, exitCode: number) => Promise<void> }> {
  const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-hook-answer-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const report = join(directory, 'report.json');
  const code = join(directory, 'exit');
  const { ramify, root } = await stub(`cat '${report}'\nexit "$(cat '${code}')"`);
  return {
    ramify,
    root,
    answer: async (document, exitCode) => {
      await writeFile(report, JSON.stringify(document));
      await writeFile(code, String(exitCode));
    },
  };
}

function changedDocument(fields: { readonly findings?: readonly Record<string, unknown>[]; readonly execution?: string; readonly removed?: readonly string[]; readonly warnings?: readonly unknown[]; readonly coverage?: readonly unknown[] }): Record<string, unknown> {
  return {
    schemaVersion: 'ramify.check/1', outcome: 'checked', reason: null, execution: fields.execution ?? 'completed',
    findings: fields.findings ?? [], removed: fields.removed ?? [], warnings: fields.warnings ?? [], coverage: fields.coverage ?? [],
  };
}

describe('a finding is identified by Ramify\'s id', () => {
  const runtime = 'subs/workspace/subs/reviews/subs/core/src/runtime.ts';
  const session = 'subs/workspace/subs/reviews/src/session.ts';

  test('two files importing the same forbidden symbol are two findings, and fixing one clears that one alone', async () => {
    const { ramify, root, answer } = await answering();
    const seen = new FindingsSeen();

    await answer(changedDocument({ findings: [notVisible(runtime, 1), notVisible(session, 1)] }), 1);
    const both = await runHookCheck(request(ramify, root, [runtime, session], seen));
    expect(both.checks[0]!.newFindings).toBe(2);
    expect(both.text).toContain('RAMIFY MODULE VIOLATIONS. The iteration gate fails while they stand.');
    expect(both.text).toContain(`- ${runtime}:1 imports`);
    expect(both.text).toContain(`- ${session}:1 imports`);

    await answer(changedDocument({ findings: [notVisible(session, 1)], removed: [notVisible(runtime, 1)['id'] as string] }), 1);
    const one = await runHookCheck({ ...request(ramify, root, [runtime], seen), ran: 1 });
    expect(seen.open().map(finding => finding.file)).toEqual([session]);
    expect(one.text).toContain(`Cleared: the Ramify module violation reported earlier (${runtime}:1) no longer stands.`);
    expect(one.text).toContain('RAMIFY MODULE VIOLATION still standing (1):');
  });

  test('a violation whose offsets moved keeps standing: it is neither cleared nor new', async () => {
    const { ramify, root, answer } = await answering();
    const seen = new FindingsSeen();

    await answer(changedDocument({ findings: [notVisible(runtime, 1)] }), 1);
    await runHookCheck(request(ramify, root, [runtime], seen));
    await answer(changedDocument({ findings: [notVisible(runtime, 3)] }), 1);
    const moved = await runHookCheck({ ...request(ramify, root, [runtime], seen), ran: 1 });

    expect(moved.checks[0]!.newFindings).toBe(0);
    expect(moved.text).toContain(`RAMIFY MODULE VIOLATION still standing (1):\n- ${runtime}:3 imports`);
    expect(moved.text).not.toContain('Cleared');
  });
});

describe('a check that did not evaluate imports', () => {
  const runtime = 'subs/workspace/subs/reviews/subs/core/src/runtime.ts';
  const description = 'subs/workspace/subs/reviews/subs/validation/module.ramify';
  const invalidDestination = {
    id: 'validation:dc1d06534c79', category: 'description', code: 'invalid-destination',
    message: 'Expected the bare destination parent or descendants.',
    location: { file: description, start: 309, end: 317, line: 8, column: 56 },
    related: [], importer: null, original: null, accessId: null, new: true,
  };

  test('says so, and the import findings it no longer reports stand until a check that evaluates imports clears them', async () => {
    const { ramify, root, answer } = await answering();
    const seen = new FindingsSeen();

    await answer(changedDocument({ findings: [notVisible(runtime, 1)] }), 1);
    await runHookCheck(request(ramify, root, [runtime], seen));

    // The description error makes the analysis invalid: the import finding
    // is gone from the report and Ramify lists it as removed.
    await answer(changedDocument({ execution: 'invalid', findings: [invalidDestination], removed: [notVisible(runtime, 1)['id'] as string] }), 1);
    const invalid = await runHookCheck({ ...request(ramify, root, [description, runtime], seen), ran: 1 });

    expect(invalid.checks[0]).toMatchObject({ outcome: 'findings', newFindings: 1 });
    expect(invalid.text).toBe([
      'RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.',
      `- ${description}:8: Expected the bare destination parent or descendants. [invalid-destination]`,
      'Fix it inside your write scope, or submit `contract-needed`, or `unsuitable` with reason `scope`. `completion-proposed` is refused while this stands.',
      'Imports were not evaluated: the check\'s execution was `invalid`, so Ramify decided no import and this check is not a pass for any. An invalid module description, layout or tag registry stops the analysis before any import is decided.',
      `The finding reported earlier (${runtime}:1) is not cleared: it stands until a check that evaluates imports no longer reports it.`,
    ].join('\n'));
    expect(invalid.text).not.toContain('Cleared');
    expect(seen.open().map(finding => finding.code).sort()).toEqual(['invalid-destination', 'not-visible']);

    // A complete check that is invalid too clears nothing it did not evaluate.
    await answer({ schemaVersion: 'ramify.analysis/1', outcome: { execution: 'invalid', check: 'failed', coverage: 'not-run' }, diagnostics: [invalidDestination], warnings: [], coverage: [] }, 1);
    const complete = await runHookCheck({ ...request(ramify, root, null, seen), ran: 2 });
    expect(complete.text).toContain('Imports were not evaluated');
    expect(complete.text).not.toContain('Cleared');
    expect(seen.open().map(finding => finding.code).sort()).toEqual(['invalid-destination', 'not-visible']);

    // Once imports are evaluated again, a check that no longer reports them clears them.
    await answer(changedDocument({ removed: [invalidDestination.id] }), 0);
    const repaired = await runHookCheck({ ...request(ramify, root, [description, runtime], seen), ran: 3 });
    expect(seen.open()).toEqual([]);
    expect(repaired.text).toBe(`Cleared: the 2 Ramify module violations reported earlier (${description}:8, ${runtime}:1) no longer stand.`);
  });
});

describe('warnings and analysis limits on the files just written', () => {
  const mcp = 'subs/workspace/subs/reviews/src/mcp.ts';
  const stray = 'subs/workspace/subs/stray/src/helper.ts';
  const report = 'scripts/report/report.ts';
  const warnings = [
    { code: 'outside-module-source', entry: 'subs', count: 1, files: [stray] },
    { code: 'outside-module-source', entry: 'scripts', count: 1, files: [report] },
    { code: 'outside-module-source', entry: 'vite.config.ts', count: 1, files: ['vite.config.ts'] },
  ];
  const coverage = [
    {
      id: 'access-limit/1:01dac477', code: 'nonliteral-target',
      location: { file: mcp, start: 5705, end: 5709, line: 163, column: 17 },
      message: 'Cannot establish the accessed source or resource target', related: [],
    },
    {
      id: 'access-limit/1:elsewhere', code: 'signature-inferred',
      location: { file: 'subs/workspace/src/client.ts', start: 0, end: 10, line: 1, column: 1 },
      message: 'Inferred', related: [],
    },
  ];

  test('are relayed as not blocking without an assignment-purpose warning suppression', async () => {
    const { ramify, root, answer } = await answering();
    const seen = new FindingsSeen();
    await answer(changedDocument({ warnings, coverage }), 0);

    const result = await runHookCheck({ ...request(ramify, root, [mcp, stray, report], seen) });

    expect(result.checks[0]).toMatchObject({ outcome: 'passed', newFindings: 0 });
    expect(result.text).toBe([
      'Not blocking: Ramify reports these for the files you just wrote, and fails no check on them.',
      `- ${stray}: the compiler selects this file, but it lies outside every module's source, so no module owns it and Ramify decides no import of it [warning outside-module-source]`,
      `- ${report}: the compiler selects this file, but it lies outside every module's source, so no module owns it and Ramify decides no import of it [warning outside-module-source]`,
      `- ${mcp}:163: Cannot establish the accessed source or resource target [analysis limit nonliteral-target]`,
      'An analysis limit is an import Ramify could not decide: it is neither allowed nor denied.',
    ].join('\n'));

    // Told once: the same warning and limit on a later write is not news.
    const again = await runHookCheck({ ...request(ramify, root, [mcp, stray], seen), ran: 1 });
    expect(again.text).toBeNull();
  });

  test('a warning that a file lies outside every module is not relayed while a description error leaves its module owning nothing', async () => {
    const { ramify, root, answer } = await answering();
    await answer(changedDocument({ execution: 'invalid', warnings }), 1);

    const result = await runHookCheck(request(ramify, root, [stray]));

    expect(result.text).toContain('Imports were not evaluated');
    expect(result.text).not.toContain('outside-module-source');
  });
});
