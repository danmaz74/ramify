import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import { classifyProjectPath } from '../../../analysis/subs/project/src/ownership.js';
import type { AnalysisReport } from '../../../analysis/src/interfaces/analysis.js';
import type { ProjectOwnership, ProjectScope, ProjectWarning } from '../../../analysis/subs/project/src/interfaces/project.js';
import type { CheckDocument, CliEnvironment, GitAnswer, GitPort } from '../interfaces/cli.js';
import { ignoredButWalked, ignoredDirectories, walkingModule, withGitAdvice } from '../git-advice.js';
import { runCli } from '../run-cli.js';

const nul = (...entries: readonly string[]): Uint8Array => Buffer.from(entries.map(entry => `${entry}\0`).join(''));

/** The written provider topology of the project-boundary fixture contract, as its revision's ownership table. */
const ownership: ProjectOwnership = {
  modules: [{ id: 'app', parent: null, directory: '.' }, { id: 'app/a', parent: 'app', directory: 'subs/a' },
    { id: 'app/a/grand', parent: 'app/a', directory: 'subs/a/subs/grand' }, { id: 'app/a-extra', parent: 'app', directory: 'subs/a-extra' },
    { id: 'app/b', parent: 'app', directory: 'subs/b' }],
  exclusions: [{ kind: 'output', directory: 'dist', owner: null }, { kind: 'external', directory: 'external-project', owner: null },
    { kind: 'owned-nested-project', directory: 'fixture-project', owner: 'app' }, { kind: 'scratch', directory: 'src/tmp', owner: 'app' },
    { kind: 'scratch', directory: 'subs/a-extra/src/tmp', owner: 'app/a-extra' },
    { kind: 'owned-nested-project', directory: 'subs/a/fixtures/sample', owner: 'app/a' }, { kind: 'scratch', directory: 'subs/a/src/tmp', owner: 'app/a' },
    { kind: 'scratch', directory: 'subs/a/subs/grand/src/tmp', owner: 'app/a/grand' }, { kind: 'scratch', directory: 'subs/b/src/tmp', owner: 'app/b' }],
};
const scope: ProjectScope = { root: '/project/app', selection: 'found', invokedFrom: '/project/app', configuration: '/project/app/tsconfig.json',
  walkedAreas: [], ownership };

/** Directories Git could list beneath `app`, with whitespace, newlines and every exclusion kind. */
const walked: Readonly<Record<string, string>> = {
  'coverage': 'app', 'build output': 'app', 'subs/a/scripts/out': 'app/a', 'subs/a/subs/grand/gen': 'app/a/grand',
  'subs/b/line\nbreak': 'app/b', 'subs/b/src/tmpx': 'app/b', 'src/generated': 'app', 'subs/a/src/tests/tmp': 'app/a',
  '.ramify-other': 'app', '.ramify.tmp': 'app', 'tools/tmp': 'app',
};
const excluded: readonly string[] = ['dist', 'dist/cache', 'external-project', 'external-project/node_modules', 'fixture-project',
  'fixture-project/build', 'subs/a/fixtures/sample', 'subs/a/fixtures/sample/dist', 'src/tmp', 'src/tmp/deep', 'subs/b/src/tmp',
  'node_modules', 'subs/b/node_modules', 'subs/a/bower_components', 'jspm_packages', '.git', '.ramify', 'subs/a/src/.ramify',
  '.ramify-architect', '.ramify.tmp-1', '.ramify-architect.old-x', 'subs/a/node_modules/pkg'];

/** A scripted Git port: it answers only the roots it was given, records every call and fails otherwise. */
function scriptedGit(answers: ReadonlyMap<string, GitAnswer>) {
  const calls: string[] = [];
  const port: GitPort = async root => {
    calls.push(root);
    const answer = answers.get(root);
    if (!answer) throw new Error(`Unconfigured Git call for ${root}`);
    return answer;
  };
  return { port, calls };
}

describe('Git advisory warning', () => {
  it('reads Git\'s NUL-terminated list without splitting or trimming names, keeping directories only', () => {
    const output = Buffer.concat([nul('with space/', 'tab\there/', 'line\nbreak/', ' lead/', 'trail /', 'ünï/', 'file.txt', 'a/b c/d/',
      'with space/', './', '../outside/', '/absolute/', 'a//b/', 'a/./b/', 'a/../b/', 'back\\slash/', ''), Buffer.from([0xff, 0x2f, 0x00]),
    Buffer.from('last/')]);
    // The final entry lacks its terminator and still counts; an invalid UTF-8 name and every non-normalized entry are skipped.
    expect(ignoredDirectories(output)).toEqual(['with space', 'tab\there', 'line\nbreak', ' lead', 'trail ', 'ünï', 'a/b c/d', 'last']);
    expect(ignoredDirectories(new Uint8Array())).toEqual([]);
  });

  it('walks a directory exactly when Project\'s classifier owns it outside every exclusion, naming the same module', () => {
    for (const [directory, module] of Object.entries(walked)) {
      expect(walkingModule(ownership, directory), directory).toBe(module);
      expect(classifyProjectPath(scope, directory), directory).toMatchObject({ status: 'owned', module, exclusion: null });
    }
    for (const directory of excluded) {
      expect(walkingModule(ownership, directory), directory).toBeNull();
      const classified = classifyProjectPath(scope, directory);
      expect(classified.status === 'excluded' || classified.status === 'owned' && classified.exclusion !== null, directory).toBe(true);
    }
  });

  it('warns only about ignored directories Ramify would enter, located there, in Git\'s order', () => {
    const advice = ignoredButWalked(ownership, nul(...excluded.map(directory => `${directory}/`), ...Object.keys(walked).map(directory => `${directory}/`), 'notes.log'));
    expect(advice.map(warning => [warning.code, warning.path])).toEqual(Object.keys(walked).map(directory => ['ignored-but-walked', directory]));
    expect(advice[0]).toEqual({ code: 'ignored-but-walked', path: 'coverage',
      message: 'Git ignores this directory, but Ramify walks it as part of module app; declare it owned-unwired, owned-nested-project or external in that module\'s description if Ramify should leave it out' });
    expect(advice.every(warning => warning.files === undefined && warning.count === undefined)).toBe(true);
  });

  it('adds the advice to a report without changing its outcome, findings or limits, and gives none for every other answer', async () => {
    const existing: ProjectWarning = { code: 'compiler-selected-scratch', path: 'src/tmp', message: 'scratch', files: ['src/tmp/a.ts'], count: 1 };
    const report = { scope, warnings: [existing], diagnostics: [], coverage: [], outcome: { execution: 'completed', check: 'passed', coverage: 'complete' },
      summary: { warnings: 1, errors: 0 } } as unknown as AnalysisReport;
    const listed = scriptedGit(new Map([[scope.root, { status: 'listed', output: nul('zeta/', 'dist/', 'coverage/', 'src/tmp/') }]]));
    const advised = await withGitAdvice(report, listed.port, {});
    expect(listed.calls).toEqual([scope.root]);
    expect(advised.warnings.map(warning => [warning.code, warning.path])).toEqual([['ignored-but-walked', 'coverage'],
      ['compiler-selected-scratch', 'src/tmp'], ['ignored-but-walked', 'zeta']]);
    expect([advised.summary.warnings, advised.outcome, advised.diagnostics, advised.coverage]).toEqual([3, report.outcome, [], []]);
    for (const answer of [{ status: 'not-repository' }, { status: 'unavailable' }, { status: 'failed', message: 'exit 128' }] as const) {
      const git = scriptedGit(new Map([[scope.root, answer]]));
      expect(await withGitAdvice(report, git.port, {})).toBe(report);
      expect(git.calls).toEqual([scope.root]);
    }
    const unconfigured = scriptedGit(new Map());
    expect(await withGitAdvice({ ...report, scope: { ...scope, root: '/elsewhere' } }, unconfigured.port, {})).toMatchObject({ warnings: [existing] });
    expect(unconfigured.calls).toEqual(['/elsewhere']);
    const unused = scriptedGit(new Map());
    expect(await withGitAdvice({ ...report, scope: null }, unused.port, {})).toMatchObject({ scope: null });
    expect(await withGitAdvice(report, undefined, {})).toBe(report);
    expect(unused.calls).toEqual([]);
    await expect(withGitAdvice(report, async () => { throw new Error('cancelled'); }, { signal: AbortSignal.abort() })).rejects.toThrow();
  });
});

async function put(root: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

describe('Git advice in CLI checks', { timeout: 60_000 }, () => {
  it('prints the advice with complete batch and resident checks, never with a changed check, and keeps every exit code', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-git-advice-')));
    const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
    try {
      for (const [path, text] of Object.entries({
        'module.ramify': 'ramify 1\nroot module app\nowned-nested-project "fixture-project"\n',
        'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', types: [], outDir: 'dist' }, include: ['src'] }),
        'src/main.ts': 'export const value = 1;\n', 'fixture-project/README.md': '# Data\n',
        'subs/b/module.ramify': 'ramify 1\nmodule b\n', 'subs/b/src/use.ts': 'export const used = 1;\n',
      })) await put(root, path, text);
      const output = nul('coverage/', 'dist/', 'fixture-project/', 'node_modules/', 'subs/b/out dir/', 'notes.log');
      const git = scriptedGit(new Map([[root, { status: 'listed', output }]]));
      const run = async (argv: readonly string[]) => {
        const stdout: string[] = [];
        const environment: CliEnvironment = { cwd: root, version: '0', connect: quick.connect, batch: quick.batch, git: git.port,
          stdout: value => { stdout.push(value); }, stderr: value => { throw new Error(`Unexpected stderr: ${value}`); } };
        return { code: await runCli(argv, environment), stdout: stdout.join('') };
      };
      const expected = ['Warning [ignored-but-walked] coverage: Git ignores this directory, but Ramify walks it as part of module app;',
        'Warning [ignored-but-walked] subs/b/out dir: Git ignores this directory, but Ramify walks it as part of module app/b;'];
      for (const argv of [['check', '--batch'], ['check']]) {
        const human = await run(argv);
        expect(human.code, argv.join(' ')).toBe(0);
        const warnings = human.stdout.split('\n').filter(line => line.startsWith('Warning ['));
        expect(warnings.map(line => line.slice(0, line.indexOf(';') + 1))).toEqual(expected);
        expect(human.stdout).toContain('Findings: 0 errors, 2 warnings, 0 analysis limits;');
        const json = JSON.parse((await run([...argv, '--format', 'json'])).stdout) as AnalysisReport;
        expect(json.warnings.map(warning => [warning.code, warning.path])).toEqual([['ignored-but-walked', 'coverage'], ['ignored-but-walked', 'subs/b/out dir']]);
        expect([json.summary.warnings, json.outcome]).toEqual([2, { execution: 'completed', check: 'passed', coverage: 'complete' }]);
      }
      // A definite violation keeps exit 1 with the advice present.
      await put(root, 'subs/b/src/use.ts', "import { value } from '../../../src/main.js';\nexport const used = value;\n");
      for (const argv of [['check', '--batch'], ['check']]) {
        const denied = await run(argv);
        expect([denied.code, denied.stdout.split('\n').filter(line => line.startsWith('Warning [ignored-but-walked]')).length], argv.join(' ')).toEqual([1, 2]);
      }
      const calls = git.calls.length;
      const changed = await run(['check', '--changed', 'src/main.ts', '--format', 'json']);
      expect([changed.code, (JSON.parse(changed.stdout) as CheckDocument).warnings]).toEqual([1, []]);
      // The hook check asks Git nothing; complete checks asked once each.
      expect([calls, git.calls.length, new Set(git.calls)]).toEqual([6, 6, new Set([root])]);
    } finally { try { await quick.dispose(); } finally { await rm(root, { recursive: true, force: true }); } }
  });
});
