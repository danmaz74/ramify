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
import { capturedCheck, capturedFinding, changedDocument } from './helpers/check-payloads.js';
import { addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline, submit, treeInputs } from './helpers/iterations.js';
import { initRepository, onlyRun, openRuns, runPath, startRun } from './helpers/runs.js';
import { gitService } from '../../subs/evidence/src/git.js';

/*
 * The post-write hook check.
 *
 * The harness installs Ramify's hook itself, because the adapter disables
 * automatic extension discovery, and runs it after each settled mutation.
 * What these tests hold it to: a check that did not check is never a pass,
 * a path the provider did not analyze is never shown as passing, a finding
 * clears only on the provider's coverage, and where the changed set is
 * unknown the harness runs a complete check instead of claiming hook
 * coverage. The installed CLI's own payloads, captured by the evidence
 * owner's provider fixture, are replayed through a real executable.
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

/** A `ramify.analysis/3` complete report, as `ramify check --batch --format json --no-snapshot` prints one. */
function completeDocument(root: string, diagnostics: readonly Record<string, unknown>[], execution = 'completed'): Record<string, unknown> {
  return {
    schemaVersion: 'ramify.analysis/3', runId: 'run', inputId: 'input/1:scripted',
    request: { project: { cwd: root, root, configuration: 'discover', scope: 'whole-project' } },
    scope: null, registry: null, capabilities: [], stages: [],
    outcome: { execution, check: diagnostics.length === 0 && execution === 'completed' ? 'passed' : 'failed', coverage: execution === 'completed' ? 'complete' : 'not-run' },
    snapshot: null, diagnostics: diagnostics.map(diagnostic => ({ related: [], accessId: null, ...diagnostic })), warnings: [], coverage: [], summary: {},
  };
}

/** A finding in the shape both documents locate it. */
function denied(file: string, line = 1): Record<string, unknown> {
  return {
    id: `source-diagnostic/1:${file}:${line}`, category: 'import', code: 'denied-access', message: 'not exposed',
    location: { file, start: 0, end: 1, line, column: 1 }, importer: null, original: null,
  };
}

describe('a hook check after a settled mutation', () => {
  test('findings are reported with their count, and the same finding reported again is not new', async () => {
    const { ramify, root, answer } = await answering();
    await answer(changedDocument(root, ['a.ts'], [denied('a.ts')]), 1);
    const seen = new FindingsSeen();

    const first = await runHookCheck(request(ramify, root, ['a.ts'], seen));
    const again = await runHookCheck({ ...request(ramify, root, ['a.ts'], seen), ran: 1 });

    expect(first.checks).toHaveLength(1);
    expect(first.checks[0]).toMatchObject({ mode: 'changed', outcome: 'findings', paths: ['a.ts'], newFindings: 1 });
    expect(first.checks[0]!.outcome).not.toBe('passed');
    expect(first.text).toContain('RAMIFY MODULE VIOLATION');
    expect(first.text).toContain('a.ts:1: not exposed [denied-access]');
    expect(await readFile(first.checks[0]!.log!, 'utf8')).toContain('denied-access');

    // The second check reports the same finding; it is not newly introduced.
    expect(again.checks[0]!.newFindings).toBe(0);
    expect(again.text).toContain('RAMIFY MODULE VIOLATION still standing (1)');
    expect(seen.size).toBe(1);
  });

  test('a cold daemon is not checked with the CLI\'s reason, and is never a pass', async () => {
    const { ramify, root, answer } = await answering();
    const cold = capturedCheck('cold', root);
    await answer(cold.document, cold.exitCode);

    const result = await runHookCheck(request(ramify, root, cold.paths));

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({ outcome: 'not-checked', reason: 'cold', newFindings: 0, provider: { schema: 'ramify.check/3', revision: null } });
    expect(result.checks[0]!.dispositions.map(path => [path.path, path.disposition, path.reason])).toEqual([
      ['src/index.ts', 'not-checked', 'cold'], ['docs/readme.md', 'not-checked', 'cold'],
    ]);
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
    expect(result.checks[0]).toMatchObject({ provider: null, dispositions: [] });
    expect(result.text).toContain('Nothing was verified by this check');
  });

  test('a mutation whose changed set is unknown records the gap and runs a complete check', async () => {
    const { ramify, root, answer } = await answering();
    await answer(completeDocument(root, [denied('b.ts')]), 1);

    const result = await runHookCheck(request(ramify, root, null));

    expect(result.gaps).toEqual([{
      kind: 'changed-paths-unknown',
      detail: 'the mutation named no path the harness could establish, so a changed check covers nothing and a complete check was run',
    }]);
    expect(result.checks.map(check => check.mode)).toEqual(['changed', 'complete']);
    expect(result.checks[0]!.outcome).toBe('not-checked');
    expect(result.checks[1]).toMatchObject({ outcome: 'findings', newFindings: 1, provider: { schema: 'ramify.analysis/3', revision: 'input/1:scripted' }, dispositions: [] });
    // What the engineer is told is the complete check's own answer, and not
    // that the changed form it replaced verified nothing.
    expect(result.text).toContain('RAMIFY MODULE VIOLATION');
    expect(result.text).not.toContain('Nothing was verified');
  });

  test('a shell call whose complete check passes is not told at all: the gap is recorded, not reported', async () => {
    const { ramify, root, answer } = await answering();
    await answer(completeDocument(root, []), 0);

    const result = await runHookCheck(request(ramify, root, null));

    expect(result.checks.map(check => [check.mode, check.outcome])).toEqual([['changed', 'not-checked'], ['complete', 'passed']]);
    expect(result.gaps.map(gap => gap.kind)).toEqual(['changed-paths-unknown']);
    expect(result.text).toBeNull();
  });

  test('a shell call whose complete check could not run is told that it could not, and is never a pass', async () => {
    const { ramify, root } = await stub('echo \'{"schemaVersion":"ramify.cli/1","status":"unavailable","reason":"cold","exitCode":2}\'\nexit 2');

    const result = await runHookCheck(request(ramify, root, null));

    expect(result.checks.map(check => [check.mode, check.outcome])).toEqual([['changed', 'not-checked'], ['complete', 'not-checked']]);
    expect(result.text).toBe([
      'Ramify hook check:',
      '- complete check over the whole project: not-checked (cold)',
      '  Nothing was verified by this check. It is not a pass, and you may keep editing.',
    ].join('\n'));
  });

  test('a check that passed with nothing new tells the engineer nothing', async () => {
    const { ramify, root, answer } = await answering();
    await answer(changedDocument(root, ['src/a.ts']), 0);

    const result = await runHookCheck(request(ramify, root, ['src/a.ts']));

    expect(result.checks[0]).toMatchObject({ outcome: 'passed', newFindings: 0 } satisfies Partial<HookCheck>);
    expect(result.checks[0]!.dispositions).toEqual([{ path: 'src/a.ts', disposition: 'checked', reason: 'content', module: 'scripted', exclusion: null, sha256: '0'.repeat(64) }]);
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

/*
 * PB3-H01–H04: per-path dispositions, replayed from the installed provider's
 * own payloads.
 */
describe('per-path dispositions from the installed provider', () => {
  const excludedOnly = [
    'Not analyzed by Ramify: no source check covers these paths, so the check verified nothing about them and is no pass for them.',
    '- docs/readme.md: in the owned-unwired tree `docs` of module `app` [not-analyzed owned-unwired]',
    '- fixture/src/f.ts: in the owned-nested-project tree `fixture` of module `app` [not-analyzed owned-nested-project]',
    '- vendor/lib.ts: in the external tree `vendor` [not-analyzed external]',
    '- notes.txt: an owned file of module `app` that is neither source nor an analysis input [not-analyzed owned-non-source]',
  ];

  test('PB3-H01: exit 0 naming only excluded and inert paths shows each as not analyzed, never as passing source checks', async () => {
    const { ramify, root, answer } = await answering();
    const quiet = capturedCheck('excluded-only-pass', root);
    await answer(quiet.document, quiet.exitCode);

    const result = await runHookCheck(request(ramify, root, quiet.paths));

    // The project verdict and each path's analysis status are recorded apart.
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({ mode: 'changed', outcome: 'passed', provider: { schema: 'ramify.check/3' } });
    expect(result.checks[0]!.provider!.revision).toMatch(/^rev\//u);
    expect(result.checks[0]!.dispositions).toEqual([
      { path: 'docs/readme.md', disposition: 'not-analyzed', reason: 'owned-unwired', module: 'app', exclusion: { kind: 'owned-unwired', directory: 'docs', owner: 'app' }, sha256: null },
      { path: 'fixture/src/f.ts', disposition: 'not-analyzed', reason: 'owned-nested-project', module: 'app', exclusion: { kind: 'owned-nested-project', directory: 'fixture', owner: 'app' }, sha256: null },
      { path: 'vendor/lib.ts', disposition: 'not-analyzed', reason: 'external', module: null, exclusion: { kind: 'external', directory: 'vendor', owner: null }, sha256: null },
      { path: 'notes.txt', disposition: 'not-analyzed', reason: 'owned-non-source', module: 'app', exclusion: null, sha256: null },
    ]);
    expect(result.text).toBe(excludedOnly.join('\n'));
  });

  test('PB3-H01: mixed results keep every path\'s disposition and reason, under a verdict and under exit 2', async () => {
    const { ramify, root, answer } = await answering();
    const mixed = capturedCheck('mixed-pass-findings', root);
    await answer(mixed.document, mixed.exitCode);
    const verdict = await runHookCheck(request(ramify, root, mixed.paths));
    expect(verdict.checks[0]!.outcome).toBe('findings');
    expect(verdict.checks[0]!.dispositions.map(path => [path.path, path.disposition, path.reason])).toEqual([
      ['src/index.ts', 'checked', 'content'], ['docs/readme.md', 'not-analyzed', 'owned-unwired'], ['fixture/src/f.ts', 'not-analyzed', 'owned-nested-project'],
    ]);
    expect(verdict.checks[0]!.dispositions[0]!.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(verdict.text).toContain('- docs/readme.md: in the owned-unwired tree `docs` of module `app` [not-analyzed owned-unwired]');

    const deadline = capturedCheck('mixed-deadline', root);
    await answer(deadline.document, deadline.exitCode);
    const unrun = await runHookCheck({ ...request(ramify, root, deadline.paths), ran: 1 });
    expect(unrun.checks[0]).toMatchObject({ outcome: 'not-checked', reason: 'deadline-exceeded' });
    expect(unrun.checks[0]!.dispositions.map(path => [path.path, path.disposition, path.reason])).toEqual([
      ['src/index.ts', 'not-checked', 'deadline-exceeded'], ['docs/readme.md', 'not-analyzed', 'owned-unwired'], ['scripts/probe.ts', 'not-checked', 'deadline-exceeded'],
    ]);
    // The paths are the request's own, in the order Ramify was given them.
    expect(unrun.text).toBe([
      'Not analyzed by Ramify: no source check covers this path, so the check verified nothing about it and is no pass for it.',
      '- docs/readme.md: in the owned-unwired tree `docs` of module `app` [not-analyzed owned-unwired]',
      'Ramify hook check:',
      '- changed check over docs/readme.md, scripts/probe.ts, src/index.ts: not-checked (deadline-exceeded)',
      '  Nothing was verified by this check. It is not a pass, and you may keep editing.',
    ].join('\n'));
  });

  test('PB3-H02: project findings returned for an excluded-only request at exit 1 reach the engineer as a violation', async () => {
    const { ramify, root, answer } = await answering();
    const findings = capturedCheck('excluded-only-findings', root);
    await answer(findings.document, findings.exitCode);

    const result = await runHookCheck(request(ramify, root, findings.paths));

    expect(result.checks[0]).toMatchObject({ outcome: 'findings', newFindings: 1 });
    expect(result.text).toBe([
      'RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.',
      '- scripts/probe.ts:1: \'../fixture/src/f.js\' resolves to fixture/src/f.ts in the declared owned-nested-project tree fixture; an import into a declared tree must use package resolution [project-boundary-import]',
      'Fix it inside your write scope, or submit `contract-needed`, or `unsuitable` with reason `scope`. `completion-proposed` is refused while this stands.',
      'Not analyzed by Ramify: no source check covers this path, so the check verified nothing about it and is no pass for it.',
      '- docs/readme.md: in the owned-unwired tree `docs` of module `app` [not-analyzed owned-unwired]',
    ].join('\n'));
  });

  test('PB3-H02: findings returned with exit 2 are reported and stand, and that check clears nothing', async () => {
    const { ramify, root, answer } = await answering();
    const seen = new FindingsSeen();
    const earlier = denied('src/index.ts', 4);
    await answer(changedDocument(root, ['src/index.ts'], [earlier]), 1);
    await runHookCheck(request(ramify, root, ['src/index.ts'], seen));

    // The installed provider printed no exit 2 document with findings in the
    // captured cases, so the captured deadline payload carries the captured
    // boundary finding here, as a check that stopped after verifying it would.
    const deadline = capturedCheck('mixed-deadline', root);
    await answer({ ...deadline.document, findings: [{ ...capturedFinding('auxiliary-boundary-violation'), new: true }] }, 2);
    const result = await runHookCheck({ ...request(ramify, root, deadline.paths, seen), ran: 1 });

    expect(result.checks[0]).toMatchObject({ outcome: 'not-checked', reason: 'deadline-exceeded', newFindings: 1 });
    expect(result.text).toContain('RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.\n- scripts/probe.ts:1:');
    expect(result.text).toContain('[project-boundary-import]');
    expect(result.text).toContain('  It did not establish the project\'s result, and it is not a pass. Findings it verified before it stopped are reported above. You may keep editing.');
    // The earlier finding was not reported by this check, and its file was not checked: it stands.
    expect(result.text).not.toContain('Cleared');
    expect(seen.open().map(finding => finding.code).sort()).toEqual(['denied-access', 'project-boundary-import']);
  });

  test('PB3-H03: unanalyzed and unrun paths clear no standing finding; the provider\'s confirmed deletion clears it', async () => {
    const { ramify, root, answer } = await answering();
    const seen = new FindingsSeen();
    const replay = async (name: string, ran: number) => {
      const captured = capturedCheck(name, root);
      await answer(captured.document, captured.exitCode);
      return runHookCheck({ ...request(ramify, root, captured.paths, seen), ran });
    };

    await replay('auxiliary-boundary-violation', 0);
    expect(seen.open().map(finding => [finding.code, finding.file])).toEqual([['project-boundary-import', 'scripts/probe.ts']]);

    // Naming excluded and inert paths is not coverage, even under exit 0 with no finding.
    const named = await replay('excluded-only-pass', 1);
    expect(seen.open()).toHaveLength(1);
    expect(named.text).not.toContain('Cleared');
    // The finding's own file, not checked before the deadline, stays as it stood.
    const unrun = await replay('mixed-deadline', 2);
    expect(seen.open()).toHaveLength(1);
    expect(unrun.text).not.toContain('Cleared');

    // The covering revision analyzed the file's deletion and lists the finding as removed.
    const deleted = await replay('source-deletion', 3);
    expect(deleted.checks[0]!.dispositions).toEqual([{ path: 'scripts/probe.ts', disposition: 'checked', reason: 'deleted', module: 'app', exclusion: null, sha256: null }]);
    expect(seen.open()).toEqual([]);
    expect(deleted.text).toBe('Cleared: the Ramify module violation reported earlier (scripts/probe.ts:1) no longer stands.');
  });

  test('PB3-H04: a boundary violation in auxiliary source is relayed with Ramify\'s own message and severity', async () => {
    const { ramify, root, answer } = await answering();
    const boundary = capturedCheck('auxiliary-boundary-violation', root);
    await answer(boundary.document, boundary.exitCode);

    const result = await runHookCheck(request(ramify, root, boundary.paths));

    expect(result.checks[0]).toMatchObject({ outcome: 'findings', newFindings: 1 });
    expect(result.checks[0]!.dispositions.map(path => [path.disposition, path.reason, path.module])).toEqual([['checked', 'content', 'app']]);
    expect(result.text).toContain('RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.');
    expect(result.text).toContain('an import into a declared tree must use package resolution [project-boundary-import]');
    expect(result.text).not.toContain('Not blocking');
  });

  test('PB3-H04: a compiler-selected scratch warning is relayed as not blocking with its own message, and the scratch file as not analyzed', async () => {
    const { ramify, root, answer } = await answering();
    const scratch = capturedCheck('compiler-selected-scratch', root);
    await answer(scratch.document, scratch.exitCode);
    const seen = new FindingsSeen();

    const result = await runHookCheck(request(ramify, root, scratch.paths, seen));

    expect(result.checks[0]!.outcome).toBe('passed');
    expect(result.text).toBe([
      'Not blocking: Ramify reports this for the file you just wrote, and fails no check on it.',
      '- src/tmp/scratch.ts: 1 compiler-selected file in the scratch directory of module app, which Ramify does not analyze; exclude the directory from the compiler configuration [warning compiler-selected-scratch]',
      'Not analyzed by Ramify: no source check covers this path, so the check verified nothing about it and is no pass for it.',
      '- src/tmp/scratch.ts: in the scratch directory `src/tmp` of module `app` [not-analyzed scratch]',
    ].join('\n'));

    // Told once: the same warning on a later write is not news.
    const again = await runHookCheck({ ...request(ramify, root, scratch.paths, seen), ran: 1 });
    expect(again.text).not.toContain('Not blocking');
  });

  test('PB3-H04: a warning that arrives with a later revision is relayed for the file this invocation wrote earlier', async () => {
    const { ramify, root, answer } = await answering();
    const seen = new FindingsSeen();
    const scratch = capturedCheck('compiler-selected-scratch', root);
    // The scratch write's own revision did not yet carry the warning.
    await answer({ ...scratch.document, warnings: [] }, 0);
    await runHookCheck(request(ramify, root, ['src/tmp/scratch.ts', 'src/index.ts'], seen));

    await answer(changedDocument(root, ['src/other.ts'], [], { warnings: (scratch.document['warnings'] as unknown[]) }), 0);
    const later = await runHookCheck({ ...request(ramify, root, ['src/other.ts'], seen), ran: 1 });

    expect(later.text).toContain('- src/tmp/scratch.ts: 1 compiler-selected file in the scratch directory of module app');
  });

  test('PB3-H04: a configuration path is the provider\'s to classify, with no filename shortcut and no complete check', async () => {
    const { ramify, root, answer } = await answering();
    const configuration = capturedCheck('configuration', root);
    await answer(configuration.document, configuration.exitCode);

    const result = await runHookCheck(request(ramify, root, configuration.paths));

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({ mode: 'changed', outcome: 'passed' });
    expect(result.checks[0]!.dispositions.map(path => [path.path, path.disposition, path.reason])).toEqual([['tsconfig.json', 'checked', 'content']]);
    expect(result.gaps).toEqual([]);

    // A configuration change the revision does not yet cover is not checked for that reason, and nothing replaces it.
    await answer({
      ...configuration.document, revision: null, outcome: 'not-checked', reason: 'configuration-changed', execution: null, findings: [], removed: [], warnings: [], checked: null, exitCode: 2,
      paths: [{ path: 'tsconfig.json', disposition: 'not-checked', module: 'app', exclusion: null, reason: 'configuration-changed' }],
    }, 2);
    const pending = await runHookCheck({ ...request(ramify, root, configuration.paths), ran: 1 });
    expect(pending.checks.map(check => [check.mode, check.outcome, check.reason])).toEqual([['changed', 'not-checked', 'configuration-changed']]);
    expect(pending.text).toContain('- changed check over tsconfig.json: not-checked (configuration-changed)');
  });

  test('a result the harness does not read is an explicit gap, never a pass', async () => {
    const { ramify, root, answer } = await answering();
    await answer({ schemaVersion: 'ramify.check/1', outcome: 'checked', findings: [] }, 0);

    const result = await runHookCheck(request(ramify, root, ['src/a.ts']));

    expect(result.checks[0]).toMatchObject({ outcome: 'not-checked', provider: null, dispositions: [] });
    expect(result.checks[0]!.reason).toBe('unsupported result: `ramify.check/1` where `ramify.check/3` was expected');
    expect(result.gaps).toEqual([{
      kind: 'unsupported-check-result',
      detail: 'the changed check printed a result the harness does not read (`ramify.check/1` where `ramify.check/3` was expected); it is not a pass',
    }]);
    expect(result.text).toContain('Nothing was verified by this check');
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
    // An invocation failure printed no check document: no provider, and no path disposition the harness could invent.
    expect(hooks.every(line => line.type === 'hook-check' && line.data.provider === null && line.data.dispositions.length === 0)).toBe(true);

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

describe('what the engineer is told about a Ramify module violation', () => {
  const mcp = 'subs/workspace/subs/reviews/src/mcp.ts';

  test('the finding itself reaches the engineer, labelled, located and with what to do, never as a file to open', async () => {
    const { ramify, root, answer } = await answering();
    await answer(changedDocument(root, [mcp], [notVisible(mcp, 13)]), 1);

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
    const { ramify, root, answer } = await answering();
    const seen = new FindingsSeen();
    const other = 'subs/workspace/subs/reviews/src/other.ts';

    await answer(changedDocument(root, [mcp], [notVisible(mcp, 13)]), 1);
    await runHookCheck(request(ramify, root, [mcp], seen));
    expect(seen.open().map(finding => finding.code)).toEqual(['not-visible']);

    // An edit elsewhere answers only for its own file.
    await answer(changedDocument(root, [other]), 0);
    await runHookCheck({ ...request(ramify, root, [other], seen), ran: 1 });
    expect(seen.open()).toHaveLength(1);

    // A check that did not check answers for nothing.
    const cold = capturedCheck('cold', root);
    await answer({ ...cold.document, paths: [{ path: mcp, disposition: 'not-checked', module: null, exclusion: null, reason: 'cold' }] }, 2);
    await runHookCheck({ ...request(ramify, root, [mcp], seen), ran: 2 });
    expect(seen.open()).toHaveLength(1);

    // The line moved: the same violation, still standing, spelled out again.
    await answer(changedDocument(root, [mcp], [notVisible(mcp, 15)]), 1);
    const moved = await runHookCheck({ ...request(ramify, root, [mcp], seen), ran: 3 });
    expect(seen.open().map(finding => finding.line)).toEqual([15]);
    expect(moved.text).toContain(`${mcp}:15 imports \`ToolResult\``);

    // The file checked clean clears it, and that is said in one line: an
    // edit that removes a reported violation is answered, not passed over.
    await answer(changedDocument(root, [mcp]), 0);
    const clean = await runHookCheck({ ...request(ramify, root, [mcp], seen), ran: 4 });
    expect(seen.open()).toEqual([]);
    expect(clean.text).toBe(`Cleared: the Ramify module violation reported earlier (${mcp}:15) no longer stands.`);
  });
});

describe('a finding is identified by Ramify\'s id', () => {
  const runtime = 'subs/workspace/subs/reviews/subs/core/src/runtime.ts';
  const session = 'subs/workspace/subs/reviews/src/session.ts';

  test('two files importing the same forbidden symbol are two findings, and fixing one clears that one alone', async () => {
    const { ramify, root, answer } = await answering();
    const seen = new FindingsSeen();

    await answer(changedDocument(root, [runtime, session], [notVisible(runtime, 1), notVisible(session, 1)]), 1);
    const both = await runHookCheck(request(ramify, root, [runtime, session], seen));
    expect(both.checks[0]!.newFindings).toBe(2);
    expect(both.text).toContain('RAMIFY MODULE VIOLATIONS. The iteration gate fails while they stand.');
    expect(both.text).toContain(`- ${runtime}:1 imports`);
    expect(both.text).toContain(`- ${session}:1 imports`);

    await answer(changedDocument(root, [runtime], [notVisible(session, 1)], { removed: [notVisible(runtime, 1)['id'] as string] }), 1);
    const one = await runHookCheck({ ...request(ramify, root, [runtime], seen), ran: 1 });
    expect(seen.open().map(finding => finding.file)).toEqual([session]);
    expect(one.text).toContain(`Cleared: the Ramify module violation reported earlier (${runtime}:1) no longer stands.`);
    expect(one.text).toContain('RAMIFY MODULE VIOLATION still standing (1):');
  });

  test('a violation whose offsets moved keeps standing: it is neither cleared nor new', async () => {
    const { ramify, root, answer } = await answering();
    const seen = new FindingsSeen();

    await answer(changedDocument(root, [runtime], [notVisible(runtime, 1)]), 1);
    await runHookCheck(request(ramify, root, [runtime], seen));
    await answer(changedDocument(root, [runtime], [notVisible(runtime, 3)]), 1);
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

    await answer(changedDocument(root, [runtime], [notVisible(runtime, 1)]), 1);
    await runHookCheck(request(ramify, root, [runtime], seen));

    // The description error makes the analysis invalid: the import finding
    // is gone from the report and Ramify lists it as removed.
    await answer(changedDocument(root, [description, runtime], [invalidDestination], { execution: 'invalid', removed: [notVisible(runtime, 1)['id'] as string] }), 1);
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
    await answer(completeDocument(root, [invalidDestination], 'invalid'), 1);
    const complete = await runHookCheck({ ...request(ramify, root, null, seen), ran: 2 });
    expect(complete.text).toContain('Imports were not evaluated');
    expect(complete.text).not.toContain('Cleared');
    expect(seen.open().map(finding => finding.code).sort()).toEqual(['invalid-destination', 'not-visible']);

    // Once imports are evaluated again, a check that no longer reports them clears them.
    await answer(changedDocument(root, [description, runtime], [], { removed: [invalidDestination.id] }), 0);
    const repaired = await runHookCheck({ ...request(ramify, root, [description, runtime], seen), ran: 3 });
    expect(seen.open()).toEqual([]);
    expect(repaired.text).toBe(`Cleared: the 2 Ramify module violations reported earlier (${description}:8, ${runtime}:1) no longer stand.`);
  });
});

describe('warnings and analysis limits on the files just written', () => {
  const mcp = 'subs/workspace/subs/reviews/src/mcp.ts';
  const ignored = 'subs/workspace/docs/sketch.ts';
  const warnings = [
    { code: 'compiler-selected-owned-unwired', path: 'subs/workspace/docs', message: '1 compiler-selected file in the owned-unwired tree subs/workspace/docs, which Ramify does not analyze', files: [ignored], count: 1 },
    { code: 'compiler-selected-scratch', path: 'src/tmp', message: '1 compiler-selected file in the scratch directory of module app', files: ['src/tmp/x.ts'], count: 1 },
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

  test('are relayed as not blocking with Ramify\'s own code and message, and only for files this invocation wrote', async () => {
    const { ramify, root, answer } = await answering();
    const seen = new FindingsSeen();
    await answer(changedDocument(root, [mcp, ignored], [], { warnings, coverage }), 0);

    const result = await runHookCheck({ ...request(ramify, root, [mcp, ignored], seen) });

    expect(result.checks[0]).toMatchObject({ outcome: 'passed', newFindings: 0 });
    expect(result.text).toBe([
      'Not blocking: Ramify reports these for the files you just wrote, and fails no check on them.',
      `- ${ignored}: 1 compiler-selected file in the owned-unwired tree subs/workspace/docs, which Ramify does not analyze [warning compiler-selected-owned-unwired]`,
      `- ${mcp}:163: Cannot establish the accessed source or resource target [analysis limit nonliteral-target]`,
      'An analysis limit is an import Ramify could not decide: it is neither allowed nor denied.',
    ].join('\n'));

    // Told once: the same warning and limit on a later write is not news.
    await answer(changedDocument(root, [mcp], [], { warnings, coverage }), 0);
    const again = await runHookCheck({ ...request(ramify, root, [mcp], seen), ran: 1 });
    expect(again.text).toBeNull();
  });

  test('a warning is relayed beside a description error: no warning is suppressed for an invalid analysis', async () => {
    const { ramify, root, answer } = await answering();
    await answer(changedDocument(root, [ignored], [], { execution: 'invalid', warnings }), 1);

    const result = await runHookCheck(request(ramify, root, [ignored]));

    expect(result.text).toContain('Imports were not evaluated');
    expect(result.text).toContain(`- ${ignored}: 1 compiler-selected file in the owned-unwired tree subs/workspace/docs, which Ramify does not analyze [warning compiler-selected-owned-unwired]`);
  });
});
