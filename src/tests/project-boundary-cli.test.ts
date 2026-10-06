import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisReport } from '../../subs/analysis/src/interfaces/analysis.js';
import type { AffectedDocument, CheckDocument } from '../../subs/cli/src/interfaces/cli.js';
import { put } from './fixture.js';
import { repositoryRoot } from './process.js';

// Real built CLI processes: the Node entry, a resident daemon in a private endpoint and batch
// sessions. Expected values follow the project-boundary contracts and the CLI invocation
// specification over the written provider topology of the fixture contract.
const entry = join(repositoryRoot, 'dist/src/cli-entry.js');

interface Outcome { readonly code: number | null; readonly stdout: string; readonly stderr: string }
function run(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs = 60_000): Promise<Outcome> {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { cwd, env: { ...env, NODE_OPTIONS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`ramify ${args.join(' ')} exceeded its deadline`)); }, timeoutMs);
    child.stdout.on('data', bytes => { stdout += String(bytes); });
    child.stderr.on('data', bytes => { stderr += String(bytes); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); accept({ code, stdout, stderr }); });
  });
}

/** The written topology: `app` marked, `a`, `grand`, `a-extra` and `b` unmarked; two marked ignored projects. */
const topology: Readonly<Record<string, string>> = {
  'module.ramify': 'ramify 1\nroot module app tagged [dispatch]\nowned-ignored "fixture-project"\nexternal "external-project"\nexpose-sub api from a to descendants\n',
  'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', types: [], skipLibCheck: true, outDir: 'dist' },
    include: ['src', 'subs', 'scripts', 'tools'], exclude: ['subs/a/fixtures', 'src/tmp', 'subs/*/src/tmp', 'subs/a/subs/*/src/tmp'] }),
  'package.json': '{"type":"module"}',
  'README.md': '# App\n\nThe written provider topology.\n',
  'notes/design.md': '# Design\n',
  'scripts/check.ts': "import { api } from '../subs/a/src/api.js';\nexport const checked: number = api();\n",
  'src/main.ts': 'export const main: number = 1;\n',
  'src/tmp/throwaway.test.ts': 'export const throwaway = 1;\n',
  'tools/tmp/helper.ts': 'export const helper: number = 1;\n',
  'fixture-project/module.ramify': 'ramify 1\nroot module fixture-project\n',
  'fixture-project/tsconfig.json': JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', types: [] } }),
  'fixture-project/src/index.ts': 'export const index: number = 1;\n',
  'external-project/file.ts': 'export const external = 1;\n',
  'subs/a/module.ramify': 'ramify 1\nmodule a\nowned-ignored "fixtures/sample"\nexpose-src api from "api.ts" to parent\n',
  'subs/a/src/api.ts': 'export function api(): number { return 1; }\n',
  'subs/a/src/internal.ts': 'export const secret: number = 2;\n',
  'subs/a/src/tmp/throwaway.ts': 'export const scratch = 1;\n',
  'subs/a/scripts/report.ts': "import { api } from '../src/api.js';\nexport const reported: number = api();\n",
  'subs/a/fixtures/sample/module.ramify': 'ramify 1\nroot module sample\n',
  'subs/a/fixtures/sample/tsconfig.json': JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', types: [] } }),
  'subs/a/fixtures/sample/src/world.ts': 'export const world: number = 1;\n',
  'subs/a/subs/grand/module.ramify': 'ramify 1\nmodule grand\n',
  'subs/a/subs/grand/src/grand.ts': 'export const grand: number = 1;\n',
  'subs/a-extra/module.ramify': 'ramify 1\nmodule a-extra\n',
  'subs/a-extra/src/other.ts': 'export const other: number = 1;\n',
  'subs/b/module.ramify': 'ramify 1\nmodule b\n',
  'subs/b/src/consumer.ts': "import { api } from '../../a/src/api.js';\nexport const consumed: number = api();\n",
};
const violation = "import { secret } from '../../a/src/internal.js';\nexport const consumed: number = secret;\n";

let scratch: string, endpoint: string, env: NodeJS.ProcessEnv;
beforeAll(async () => {
  scratch = await realpath(await mkdtemp(join(tmpdir(), 'ramify-pb-cli-')));
  // Socket paths are bounded to 100 bytes; keep the endpoint short.
  endpoint = await realpath(await mkdtemp('/tmp/rpb-'));
  env = { ...process.env, RAMIFY_ENDPOINT_DIR: endpoint };
});
afterAll(async () => {
  try { await run(repositoryRoot, ['daemon', 'stop'], env); }
  finally { await rm(scratch, { recursive: true, force: true }); await rm(endpoint, { recursive: true, force: true }); }
});

async function project(name: string, files: Readonly<Record<string, string>> = topology): Promise<string> {
  const root = join(scratch, name);
  for (const [path, text] of Object.entries(files)) await put(root, path, text);
  return root;
}
const json = <T>(outcome: Outcome): T => JSON.parse(outcome.stdout) as T;
const findings = (items: readonly { code: string; location: unknown; message: string }[]) => items.map(({ code, location, message }) => ({ code, location, message }));

describe('project-boundary CLI processes', () => {
  it('PB1-30: built batch and resident checks select the nearest marked description, and report how', async () => {
    const app = await project('selection');
    const sample = join(app, 'subs/a/fixtures/sample'), fixtureProject = join(app, 'fixture-project');
    const cases: readonly [string, readonly string[], string, 'found' | 'given', number][] = [
      [join(app, 'subs/a/subs/grand'), [], app, 'found', 0],
      [join(app, 'scripts'), [], app, 'found', 0],
      [join(sample, 'src'), [], sample, 'found', 0],
      [fixtureProject, [], fixtureProject, 'found', 0],
      [app, ['--root', '.'], app, 'given', 0],
    ];
    for (const mode of [['--batch'], []]) for (const [cwd, extra, root, selection, code] of cases) {
      const label = `${mode.join(' ') || 'resident'} from ${cwd} ${extra.join(' ')}`;
      const human = await run(cwd, ['check', ...mode, ...extra], env);
      expect([human.code, human.stderr], label).toEqual([code, '']);
      expect(human.stdout.split('\n')[0], label).toBe(`Root: ${root} (${selection === 'given' ? 'given' : `found from ${cwd}`})`);
      expect(human.stdout, label).toContain(mode.length ? '\nMode: batch\n' : '\nMode: resident (daemon ');
      const report = json<AnalysisReport>(await run(cwd, ['check', ...mode, ...extra, '--format', 'json'], env));
      expect([report.scope?.root, report.scope?.selection, report.scope?.invokedFrom, report.outcome.execution], label)
        .toEqual([root, selection, cwd, 'completed']);
    }
    // The enclosing project owns exactly its unmarked modules; the marked ignored projects are data.
    const enclosing = json<AnalysisReport>(await run(app, ['check', '--batch', '--format', 'json'], env));
    expect(enclosing.scope?.ownership.modules.map(module => module.id)).toEqual(['app', 'app/a', 'app/a-extra', 'app/a/grand', 'app/b']);
    expect([enclosing.summary.errors, enclosing.summary.denied]).toEqual([0, 0]);

    // --root on an unmarked description is invalid, exit 1, saying to add the marker.
    const unmarked = `${join(app, 'subs/a')}/module.ramify does not carry the root marker: add root before module on its module line to declare the project root`;
    for (const mode of [['--batch'], []]) {
      const human = await run(app, ['check', ...mode, '--root', 'subs/a'], env);
      expect([human.code, human.stderr], mode.join(' ')).toEqual([1, '']);
      expect(human.stdout).toContain(`Error [unmarked-root-description]`);
      expect(human.stdout).toContain(unmarked);
      const report = json<AnalysisReport>(await run(app, ['check', ...mode, '--root', 'subs/a', '--format', 'json'], env));
      expect(report.diagnostics.map(issue => [issue.code, issue.category, issue.message])).toEqual([['unmarked-root-description', 'layout', unmarked]]);
      expect(report.outcome.execution).toBe('invalid');
    }

    // No marked description at or above the working directory: exit 2 naming it, with the hint only
    // when an unmarked description lies above.
    const bare = join(scratch, 'bare/deep');
    await mkdir(bare, { recursive: true });
    const orphan = await project('orphan', { 'lib/module.ramify': 'ramify 1\nmodule lib\n', 'lib/src/x.ts': 'export const x = 1;\n' });
    for (const mode of [['--batch'], []]) {
      const none = await run(bare, ['check', ...mode], env);
      expect([none.code, none.stderr], mode.join(' ')).toEqual([2, '']);
      expect(none.stdout).toContain(`Error [root-not-found] .:1:1: No marked project root at or above ${bare}\n`);
      const hinted = await run(join(orphan, 'lib/src'), ['check', ...mode], env);
      expect([hinted.code, hinted.stderr], mode.join(' ')).toEqual([2, '']);
      expect(hinted.stdout).toContain(`Error [root-not-found] .:1:1: No marked project root at or above ${join(orphan, 'lib/src')}; `
        + `the nearest description is ${join(orphan, 'lib/module.ramify')}: add root before module on its module line if it is the project root\n`);
      const report = json<AnalysisReport>(await run(bare, ['check', ...mode, '--format', 'json'], env));
      expect([report.outcome.execution, report.diagnostics.map(issue => issue.code)]).toEqual(['unavailable', ['root-not-found']]);
    }
  }, 300_000);

  it('PB1-20: a changed check gives the complete check\'s exit code and findings, with each path\'s disposition', async () => {
    const app = await project('changed');
    await put(app, 'notes/with space.md', '# Spaced\n');
    await put(app, 'src/with space.ts', 'export const spaced: number = 1;\n');
    const changed = async (...paths: string[]) => {
      const outcome = await run(app, ['check', '--changed', ...paths, '--format', 'json', '--deadline', '20000'], env);
      expect(outcome.stderr, paths.join(' ')).toBe('');
      return { code: outcome.code, document: json<CheckDocument>(outcome) };
    };
    const complete = async () => {
      const outcome = await run(app, ['check', '--format', 'json'], env);
      return { code: outcome.code, report: json<AnalysisReport>(outcome) };
    };
    expect((await complete()).code).toBe(0);
    const owned = (directory: string, kind: string, module: string) => ({ kind, directory, owner: module });
    const expected = {
      'src/main.ts': { disposition: 'checked', module: 'app', exclusion: null, reason: 'content' },
      'src/with space.ts': { disposition: 'checked', module: 'app', exclusion: null, reason: 'content' },
      'notes/design.md': { disposition: 'not-analyzed', module: 'app', exclusion: null, reason: 'owned-non-source' },
      'notes/with space.md': { disposition: 'not-analyzed', module: 'app', exclusion: null, reason: 'owned-non-source' },
      'fixture-project/src/index.ts': { disposition: 'not-analyzed', module: 'app', exclusion: owned('fixture-project', 'owned-ignored', 'app'), reason: 'owned-ignored' },
      'subs/a/fixtures/sample/src/world.ts': { disposition: 'not-analyzed', module: 'app/a', exclusion: owned('subs/a/fixtures/sample', 'owned-ignored', 'app/a'), reason: 'owned-ignored' },
      'external-project/file.ts': { disposition: 'not-analyzed', module: null, exclusion: { kind: 'external', directory: 'external-project', owner: null }, reason: 'external' },
      'src/tmp/throwaway.test.ts': { disposition: 'not-analyzed', module: 'app', exclusion: owned('src/tmp', 'scratch', 'app'), reason: 'scratch' },
      'subs/a/src/tmp/throwaway.ts': { disposition: 'not-analyzed', module: 'app/a', exclusion: owned('subs/a/src/tmp', 'scratch', 'app/a'), reason: 'scratch' },
      'node_modules/x/index.js': { disposition: 'not-analyzed', module: null, exclusion: { kind: 'packages', directory: 'node_modules', owner: null }, reason: 'reserved' },
      'dist/out.js': { disposition: 'not-analyzed', module: null, exclusion: { kind: 'output', directory: 'dist', owner: null }, reason: 'reserved' },
      'subs/b/src/.ramify/catalog.json': { disposition: 'not-analyzed', module: null, exclusion: { kind: 'generated', directory: 'subs/b/src/.ramify', owner: null }, reason: 'reserved' },
    } as const;
    // Each path alone, then all together: a not-analyzed path never changes the healthy project's exit 0.
    for (const [path, disposition] of Object.entries(expected)) {
      const result = await changed(path);
      expect([result.code, result.document.outcome, result.document.exitCode, result.document.findings], path).toEqual([0, 'checked', 0, []]);
      expect(result.document.paths, path).toEqual([{ path, ...disposition,
        ...(disposition.disposition === 'checked' ? { sha256: expect.stringMatching(/^[0-9a-f]{64}$/) } : {}) }]);
    }
    const all = await changed(...Object.keys(expected));
    expect([all.code, all.document.paths.map(item => [item.path, item.disposition])])
      .toEqual([0, Object.entries(expected).map(([path, item]) => [path, item.disposition])]);
    const human = await run(app, ['check', '--changed', 'src/main.ts', 'fixture-project/src/index.ts', 'notes/design.md', 'external-project/file.ts'], env);
    expect([human.code, human.stderr]).toEqual([0, '']);
    expect(human.stdout).toContain('Path src/main.ts: checked (content; module app)\n'
      + 'Path fixture-project/src/index.ts: not analyzed (owned-ignored fixture-project; module app)\n'
      + 'Path notes/design.md: not analyzed (owned-non-source; module app)\n'
      + 'Path external-project/file.ts: not analyzed (external external-project)\n'
      + 'Outcome: checked (1 checked, 3 not analyzed, 0 not checked); ');
    expect(human.stdout).not.toMatch(/^(?:Checked|Path fixture-project\/src\/index\.ts: checked)/m);

    // Exit 2 only where the result could not be established: an edited configuration file, an outside path.
    await put(app, 'tsconfig.json', topology['tsconfig.json']!.replace('"skipLibCheck":true', '"skipLibCheck":true,"target":"ES2022"'));
    // An excluded path keeps the disposition its classification gives; an owned inert file is found to be no
    // analysis input only by a covering revision, which a configuration answer does not wait for.
    const configuration = await changed('tsconfig.json', 'fixture-project/src/index.ts', 'notes/design.md');
    expect([configuration.code, configuration.document.outcome, configuration.document.reason]).toEqual([2, 'not-checked', 'configuration-changed']);
    expect(configuration.document.paths).toEqual([
      { path: 'tsconfig.json', disposition: 'not-checked', module: 'app', exclusion: null, reason: 'configuration-changed' },
      { path: 'fixture-project/src/index.ts', ...expected['fixture-project/src/index.ts'] },
      { path: 'notes/design.md', disposition: 'not-checked', module: 'app', exclusion: null, reason: 'configuration-changed' }]);
    const outside = await changed('../outside.ts');
    expect([outside.code, outside.document.reason, outside.document.paths.map(item => [item.disposition, item.reason])])
      .toEqual([2, 'unobserved-input', [['not-checked', 'unobserved-input']]]);
    expect((await complete()).code).toBe(0);

    // A definite finding: the changed check of only excluded or inert paths exits 1 with the complete check's findings.
    await put(app, 'subs/b/src/consumer.ts', violation);
    const mixed = await changed('subs/b/src/consumer.ts', 'fixture-project/src/index.ts', 'notes/with space.md');
    const reference = await complete();
    expect([reference.code, reference.report.diagnostics.map(issue => issue.code)]).toEqual([1, ['not-visible']]);
    expect([mixed.code, mixed.document.outcome, mixed.document.paths.map(item => item.disposition)]).toEqual([1, 'checked', ['checked', 'not-analyzed', 'not-analyzed']]);
    expect(findings(mixed.document.findings)).toEqual(findings(reference.report.diagnostics));
    for (const paths of [['fixture-project/src/index.ts'], ['notes/design.md', 'external-project/file.ts', 'src/tmp/throwaway.test.ts']]) {
      const ignored = await changed(...paths);
      expect([ignored.code, ignored.document.exitCode, ignored.document.paths.every(item => item.disposition === 'not-analyzed')], paths.join(' ')).toEqual([1, 1, true]);
      expect(findings(ignored.document.findings), paths.join(' ')).toEqual(findings(reference.report.diagnostics));
    }
    await put(app, 'subs/b/src/consumer.ts', topology['subs/b/src/consumer.ts']!);
    const settled = await changed('subs/b/src/consumer.ts');
    expect([settled.code, settled.document.findings]).toEqual([0, []]);
  }, 300_000);

  it('PB1-20: affected states each path seed\'s status, with outside and whitespace seeds, in both modes', async () => {
    const app = await project('affected');
    // Seeds are answered byte-ordered and deduplicated.
    const seeds = ['../outside.ts', 'notes/with space.md', 'external-project/file.ts', 'fixture-project/src/index.ts', 'subs/a/scripts/report.ts'];
    const args = seeds.flatMap(path => ['--path', path]);
    for (const mode of [['--batch'], []]) {
      const outcome = await run(app, ['affected', ...args, ...mode, '--format', 'json'], env);
      expect([outcome.code, outcome.stderr], mode.join(' ')).toEqual([0, '']);
      const document = json<AffectedDocument>(outcome);
      expect(document.selection.paths.map(seed => [seed.path, seed.status, seed.module, seed.exclusion?.kind ?? null])).toEqual([
        ['../outside.ts', 'outside-project', null, null], ['external-project/file.ts', 'excluded', null, 'external'],
        ['fixture-project/src/index.ts', 'owned', 'app', 'owned-ignored'], ['notes/with space.md', 'owned', 'app', null],
        ['subs/a/scripts/report.ts', 'owned', 'app/a', null]]);
      expect([document.selection.selection, document.selection.widening]).toEqual(['all-modules', ['unowned-path']]);
      const human = await run(app, ['affected', ...args, ...mode], env);
      expect(human.code).toBe(0);
      expect(human.stdout).toContain('Path ../outside.ts: outside the project\n'
        + 'Path external-project/file.ts: excluded (external external-project)\n'
        + 'Path fixture-project/src/index.ts: owned by app (containment, owned-ignored fixture-project; ignored; selects none)\n'
        + 'Path notes/with space.md: owned by app (containment; inert; selects none)\n'
        + 'Path subs/a/scripts/report.ts: owned by app/a (inventory; auxiliary-source; selects app/a)\n');
    }
  }, 300_000);

  it('PB1-10, PB1-26: complete checks add advice from Git\'s output only, never changing ownership or the verdict', async () => {
    // A directory holding `.git` marks the repository; no Git runs here. A scripted `git` on PATH answers
    // only the reviewed advisory command and records its working directory and arguments.
    const repository = join(scratch, 'repository');
    const app = await project('repository/nested app');
    await mkdir(join(repository, '.git'));
    const tools = join(scratch, 'tools'), empty = join(scratch, 'empty-path'), log = join(scratch, 'git.log');
    await mkdir(tools); await mkdir(empty);
    const listing = (entries: readonly string[]) => entries.map(entry => `${entry}\0`).join('');
    const ignoredDirectories = ['coverage/', 'build output/', 'line\nbreak/', 'tools/', 'subs/b/gen out/', 'dist/', 'fixture-project/',
      'fixture-project/node_modules/', 'node_modules/', 'subs/a/fixtures/sample/', 'subs/a/fixtures/sample/dist/', 'src/tmp/',
      'subs/a/src/tmp/', 'external-project/', 'subs/a/src/.ramify/', 'notes.log'];
    async function script(name: string, body: string): Promise<void> {
      await writeFile(join(tools, name), `#!/bin/sh\n${body}\n`);
      await chmod(join(tools, name), 0o755);
    }
    async function listed(entries: readonly string[]): Promise<void> {
      await writeFile(join(scratch, 'git.out'), listing(entries));
      await script('git', `printf '%s|%s\\n' "$PWD" "$*" >> '${log}'\n`
        + `[ "$*" = "ls-files --others --ignored --exclude-standard --directory -z" ] || { echo "unexpected git call: $*" >&2; exit 97; }\n`
        + `cat '${join(scratch, 'git.out')}'`);
    }
    const calls = async (): Promise<string[]> => (await readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean);
    const withGit = { ...env, PATH: `${tools}:${process.env.PATH}` };
    const advice = (report: AnalysisReport) => report.warnings.filter(warning => warning.code === 'ignored-but-walked').map(warning => warning.path);
    const verdict = (report: AnalysisReport) => ({ ...report, runId: null, warnings: report.warnings.filter(warning => warning.code !== 'ignored-but-walked'),
      summary: { ...report.summary, warnings: report.summary.warnings - advice(report).length } });

    await listed(ignoredDirectories);
    const walked = ['build output', 'coverage', 'line\nbreak', 'subs/b/gen out', 'tools'];
    for (const mode of [['--batch'], []]) {
      const before = (await calls()).length;
      const human = await run(app, ['check', ...mode], withGit);
      expect([human.code, human.stderr], mode.join(' ')).toEqual([0, '']);
      expect(human.stdout.split('\n').filter(line => line.startsWith('Warning [ignored-but-walked]')).map(line => line.slice(0, line.indexOf(': Git')))).toEqual([
        'Warning [ignored-but-walked] build output', 'Warning [ignored-but-walked] coverage', 'Warning [ignored-but-walked] "line\\nbreak"',
        'Warning [ignored-but-walked] subs/b/gen out', 'Warning [ignored-but-walked] tools']);
      expect(human.stdout).toContain('Warning [ignored-but-walked] subs/b/gen out: Git ignores this directory, but Ramify walks it as part of module app/b;');
      const report = json<AnalysisReport>(await run(app, ['check', ...mode, '--format', 'json'], withGit));
      expect([advice(report), report.summary.warnings, report.outcome.execution, report.outcome.check]).toEqual([walked, 5, 'completed', 'passed']);
      // Unversioned owned compiler source beneath an ignored directory is still analyzed with ordinary ownership.
      expect(report.snapshot?.inventory.files.find(file => file.path === 'tools/tmp/helper.ts')).toMatchObject({ owner: 'app', placement: 'auxiliary' });
      expect((await calls()).slice(before)).toEqual(Array(2).fill(`${app}|ls-files --others --ignored --exclude-standard --directory -z`));
    }
    // Changing the ignores changes the advice only: the same report, input identity and exit code otherwise.
    const full = json<AnalysisReport>(await run(app, ['check', '--batch', '--format', 'json'], withGit));
    await listed(['coverage/']);
    const fewer = json<AnalysisReport>(await run(app, ['check', '--batch', '--format', 'json'], withGit));
    expect(advice(fewer)).toEqual(['coverage']);
    expect(verdict(fewer)).toEqual(verdict(full));
    expect(fewer.inputId).toBe(full.inputId);
    // A violation keeps exit 1 with the advice present; the hook check asks Git nothing.
    await put(app, 'subs/b/src/consumer.ts', violation);
    const before = (await calls()).length;
    for (const mode of [['--batch'], []]) {
      const denied = json<AnalysisReport>(await run(app, ['check', ...mode, '--format', 'json'], withGit));
      expect([advice(denied), denied.diagnostics.map(issue => issue.code)], mode.join(' ')).toEqual([['coverage'], ['not-visible']]);
      expect((await run(app, ['check', ...mode], withGit)).code).toBe(1);
    }
    const hook = await run(app, ['check', '--changed', 'subs/b/src/consumer.ts', '--format', 'json', '--deadline', '20000'], withGit);
    expect([hook.code, json<CheckDocument>(hook).warnings]).toEqual([1, []]);
    expect((await calls()).length - before).toBe(4);
    await put(app, 'subs/b/src/consumer.ts', topology['subs/b/src/consumer.ts']!);

    // Missing Git, a failing Git command and a project outside any repository: no advice, the same verdict, nothing on stderr.
    const quiet = async (label: string, cwd: string, environment: NodeJS.ProcessEnv) => {
      for (const mode of [['--batch'], []]) {
        const outcome = await run(cwd, ['check', ...mode, '--format', 'json'], environment);
        expect([outcome.code, outcome.stderr], `${label} ${mode.join(' ')}`).toEqual([0, '']);
        const report = json<AnalysisReport>(outcome);
        expect([advice(report), report.outcome.check], `${label} ${mode.join(' ')}`).toEqual([[], 'passed']);
      }
    };
    await quiet('no git on PATH', app, { ...env, PATH: empty });
    await script('git', `printf '%s|%s\\n' "$PWD" "$*" >> '${log}'\necho 'fatal: unable to read index' >&2\nexit 128`);
    const failing = (await calls()).length;
    await quiet('failing git', app, withGit);
    expect((await calls()).length - failing).toBe(2);
    await listed(ignoredDirectories);
    const unversioned = await project('unversioned');
    const outsideRepository = (await calls()).length;
    await quiet('outside a repository', unversioned, withGit);
    expect((await calls()).length).toBe(outsideRepository);
  }, 300_000);

  it('documents dispositions, exit codes and the Git advice in help', async () => {
    for (const args of [['--help'], ['check', '--help']]) {
      const help = await run('/', args, env);
      expect([help.code, help.stderr]).toEqual([0, '']);
      expect(help.stdout).toContain('Each path is checked, not analyzed (an excluded,\n');
      expect(help.stdout).toContain('Changed checks: 0 no findings and 1 findings or an invalid revision, exactly as\nthe complete check, whatever paths are not analyzed;');
      expect(help.stdout).toContain('ignores that Ramify still walks (ignored-but-walked); that advice never\nchanges the result.');
      expect(help.stdout).not.toContain('Hashes the named paths');
    }
  });
});
