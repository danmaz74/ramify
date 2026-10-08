import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { privateRamify, RamifyCli, type RamifyCheckResult } from '../ramify-cli.js';
import { loadArchitectIndex, readApiView, readArchitectMeta } from '../views.js';
import { temporaryDirectory } from './helpers/temporary.js';

const projectRoot = resolve(process.cwd());
const docs = ['md', 'ts', 'mts', 'mjs'].map(extension => `docs/plan21-ownership.${extension}`);

describe('installed Ramify project boundary', () => {
  test('marked root, four inert owned docs extensions and analyzed scripts use current ownership identity', async () => {
    const cli = new RamifyCli();
    const answer = await cli.queryOwnership(projectRoot, [
      '.', ...docs, 'scripts/browser-acceptance/run.ts',
      'subs/harness/fixtures/collection-review/src/example.ts',
    ]);
    expect(answer.schemaVersion).toBe('ramify.affected-cli/4');
    expect(answer.selection.inputId).toBe(answer.revision.inputId);
    expect(answer.selection.scope.root).toBe(projectRoot);
    expect(await readFile(resolve(projectRoot, 'module.ramify'), 'utf8')).toMatch(/^ramify 1\nroot module "ramify-agent"/u);
    expect(answer.selection.scope.ownership.exclusions.filter(item => item.kind === 'owned-nested-project').map(item => item.directory)).toEqual([
      'subs/harness/fixtures/capability-coordination',
      'subs/harness/fixtures/capability-coordination-nested',
      'subs/harness/fixtures/collection-review',
    ]);
    for (const path of docs) {
      expect(answer.selection.paths.find(item => item.path === path)).toMatchObject({
        status: 'owned', module: 'ramify-agent', kind: 'ignored', selects: [],
        exclusion: { kind: 'owned-unwired', directory: 'docs', owner: 'ramify-agent' },
      });
    }
    expect(answer.selection.paths.find(item => item.path === 'scripts/browser-acceptance/run.ts')).toMatchObject({
      status: 'owned', module: 'ramify-agent', kind: 'auxiliary-source', selects: ['ramify-agent'], exclusion: null,
    });
    expect(answer.selection.paths.find(item => item.path === 'subs/harness/fixtures/collection-review/src/example.ts')).toMatchObject({
      status: 'owned', module: 'ramify-agent/harness', kind: 'ignored', selects: [],
      exclusion: { kind: 'owned-nested-project', directory: 'subs/harness/fixtures/collection-review' },
    });
  }, 120_000);

  test('an invocation from a nested module selects the marked project and both API source areas', async () => {
    const endpoint = await temporaryDirectory();
    const cli = new RamifyCli({ endpointDirectory: endpoint.path });
    try {
      const cwd = resolve(projectRoot, 'subs/harness/subs/evidence');
      let result = await cli.run(['materialize', '--view', 'architect', '--view', 'api', '--from', '.'], cwd);
      for (let retry = 0; retry < 2 && result.code === 2 && result.stdout.includes('superseded'); retry += 1) {
        result = await cli.run(['materialize', '--view', 'architect', '--view', 'api', '--from', '.'], cwd);
      }
      expect(result.code, result.stderr || result.stdout).toBe(0);
      expect(result.stdout).toContain(`Root: ${projectRoot}`);
      const meta = await readArchitectMeta(projectRoot);
      const index = await loadArchitectIndex(projectRoot);
      expect(meta.schema).toBe('ramify.architect-view/3');
      expect(index.input).toBe(meta.input);
      const entry = index.modules.get('ramify-agent/harness/evidence');
      expect(entry).toBeDefined();
      for (const area of ['src', 'src/tests'] as const) {
        const view = await readApiView(projectRoot, entry!, area);
        expect(view?.module).toBe(entry!.module);
        expect(view?.revision).toBe(meta.revision);
        expect(view?.area).toBe(area);
      }
    } finally {
      await cli.stopDaemon();
      await endpoint.remove();
    }
  }, 120_000);

  test('an unmarked explicit target is refused before analysis', async () => {
    const fixture = await temporaryDirectory();
    try {
      await mkdir(resolve(fixture.path, 'src'));
      await writeFile(resolve(fixture.path, 'module.ramify'), 'ramify 1\nmodule unmarked\n');
      await writeFile(resolve(fixture.path, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true }, include: ['src/**/*.ts'] }));
      await writeFile(resolve(fixture.path, 'src/index.ts'), 'export const value = 1;\n');
      const result = await new RamifyCli().run(['check', '--batch', '--root', fixture.path, '--format', 'json'], fixture.path);
      expect(result.code).toBe(1);
      const report = JSON.parse(result.stdout) as { outcome: { execution: string }; diagnostics: Array<{ code: string }>; scope: unknown };
      expect(report.outcome.execution).toBe('invalid');
      expect(report.scope).toBeNull();
      expect(report.diagnostics.map(item => item.code)).toContain('unmarked-root-description');
    } finally {
      await fixture.remove();
    }
  }, 120_000);

  test('auxiliary source is analyzed and a hidden child import is denied', async () => {
    const fixture = await temporaryDirectory();
    try {
      await mkdir(resolve(fixture.path, 'src'));
      await mkdir(resolve(fixture.path, 'scripts'));
      await mkdir(resolve(fixture.path, 'subs/web/src'), { recursive: true });
      await writeFile(resolve(fixture.path, 'module.ramify'), 'ramify 1\nroot module app\n');
      await writeFile(resolve(fixture.path, 'subs/web/module.ramify'), 'ramify 1\nmodule web\n');
      await writeFile(resolve(fixture.path, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true }, include: ['src/**/*.ts', 'scripts/**/*.ts', 'subs/**/src/**/*.ts'] }));
      await writeFile(resolve(fixture.path, 'src/index.ts'), 'export const app = 1;\n');
      await writeFile(resolve(fixture.path, 'subs/web/src/internal.ts'), 'export const privateValue = 1;\n');
      await writeFile(resolve(fixture.path, 'scripts/probe.ts'), "import { privateValue } from '../subs/web/src/internal.js';\nexport const probe = privateValue;\n");
      const result = await new RamifyCli().run(['check', '--batch', '--root', fixture.path, '--format', 'json'], fixture.path);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('not-visible');
    } finally {
      await fixture.remove();
    }
  }, 120_000);
});

/*
 * The hook check's per-path dispositions, captured from the installed CLI
 * with a daemon of this test's own. Each case is decoded by the real adapter
 * and its payload kept, without timings and with the temporary root replaced
 * by `<root>`; `PLAN21_HOOK_PAYLOADS=<file>` writes them, which is how the
 * harness's hook reducer tests receive real payloads to replay.
 */
describe('installed Ramify hook dispositions', () => {
  test('excluded-only exits 0 and 1, mixed, cold and deadline exit 2, source deletion, an auxiliary boundary violation, a scratch warning and configuration', async () => {
    const fixture = await temporaryDirectory();
    const { ramify, dispose } = await privateRamify({ timeoutMs: 120_000 });
    const captured: Record<string, { readonly paths: readonly string[]; readonly exitCode: number; readonly document: unknown }> = {};
    const root = fixture.path;
    const write = async (path: string, text: string) => {
      await mkdir(resolve(root, path, '..'), { recursive: true });
      await writeFile(resolve(root, path), text);
    };
    const check = async (name: string, paths: readonly string[], deadlineMs: number): Promise<RamifyCheckResult> => {
      const result = await ramify.checkChanged(paths, root, deadlineMs);
      expect(result.unsupported, `${name}: ${result.stdout}${result.stderr}`).toBeNull();
      const { timings: _timings, ...document } = result.report as Record<string, unknown>;
      captured[name] = { paths: [...paths], exitCode: result.exitCode, document: JSON.parse(JSON.stringify(document).replaceAll(root, '<root>')) };
      return result;
    };
    const disposition = (result: RamifyCheckResult, path: string) => result.paths.find(item => item.path === path);
    try {
      await write('module.ramify', 'ramify 1\nroot module app\nowned-unwired "docs"\nowned-nested-project "fixture"\nexternal "vendor"\n');
      await write('subs/web/module.ramify', 'ramify 1\nmodule web\n');
      await write('fixture/module.ramify', 'ramify 1\nroot module fixture\n');
      await write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true }, include: ['src/**/*.ts', 'scripts/**/*.ts', 'subs/**/src/**/*.ts'] }));
      await write('src/index.ts', 'export const app = 1;\n');
      await write('subs/web/src/internal.ts', 'export const privateValue = 1;\n');
      await write('scripts/probe.ts', 'export const probe = 1;\n');
      await write('docs/readme.md', '# Notes\n');
      await write('fixture/src/f.ts', 'export const f = 1;\n');
      await write('vendor/lib.ts', 'export const lib = 1;\n');
      await write('notes.txt', 'inert\n');

      // A daemon that has not analyzed the project yet answers at once.
      const cold = await check('cold', ['src/index.ts', 'docs/readme.md'], 1);
      expect([cold.exitCode, cold.outcome]).toEqual([2, 'not-checked']);
      expect(['cold', 'deadline-exceeded']).toContain(cold.reason);
      expect(cold.paths.every(path => path.disposition === 'not-checked')).toBe(true);

      let warm = await ramify.checkChanged(['src/index.ts'], root, 60_000);
      for (let attempt = 0; attempt < 3 && warm.exitCode !== 0; attempt += 1) warm = await ramify.checkChanged(['src/index.ts'], root, 60_000);
      expect(warm.exitCode, warm.stdout).toBe(0);

      const excluded = ['docs/readme.md', 'fixture/src/f.ts', 'vendor/lib.ts', 'notes.txt'];
      const quiet = await check('excluded-only-pass', excluded, 30_000);
      expect([quiet.exitCode, quiet.outcome]).toEqual([0, 'checked']);
      expect(quiet.paths.map(path => [path.path, path.disposition, path.reason])).toEqual([
        ['docs/readme.md', 'not-analyzed', 'owned-unwired'],
        ['fixture/src/f.ts', 'not-analyzed', 'owned-nested-project'],
        ['vendor/lib.ts', 'not-analyzed', 'external'],
        ['notes.txt', 'not-analyzed', 'owned-non-source'],
      ]);

      // Auxiliary source that imports into the declared nested project, beside an unchanged clean file.
      await write('scripts/probe.ts', "import { f } from '../fixture/src/f.js';\nexport const probe = f;\n");
      const boundary = await check('auxiliary-boundary-violation', ['scripts/probe.ts'], 30_000);
      expect([boundary.exitCode, boundary.outcome]).toEqual([1, 'findings']);
      expect(disposition(boundary, 'scripts/probe.ts')).toMatchObject({ disposition: 'checked', reason: 'content', module: 'app' });
      expect((boundary.report as { findings: Array<{ code: string; location: { file: string } }> }).findings.map(item => [item.code, item.location.file]))
        .toEqual([['project-boundary-import', 'scripts/probe.ts']]);

      await write('docs/readme.md', '# Notes, revised\n');
      const findings = await check('excluded-only-findings', ['docs/readme.md'], 30_000);
      expect([findings.exitCode, findings.outcome]).toEqual([1, 'findings']);
      expect(disposition(findings, 'docs/readme.md')).toMatchObject({ disposition: 'not-analyzed', reason: 'owned-unwired' });
      expect((findings.report as { findings: unknown[] }).findings).toHaveLength(1);
      // Exit 1 is the project's verdict, not the excluded path's: the complete
      // check reports the same finding and analyzes nothing under docs/.
      const complete = await ramify.checkComplete(root);
      expect([complete.exitCode, complete.outcome, complete.unsupported]).toEqual([1, 'findings', null]);
      const errors = (report: unknown, key: string) => ((report as Record<string, Array<{ id: string; code: string; severity?: string; location: { file: string } }>>)[key] ?? [])
        .filter(item => item.code === 'project-boundary-import').map(item => [item.id, item.code, item.location.file]);
      expect(errors(complete.report, 'diagnostics')).toEqual(errors(findings.report, 'findings'));
      expect(JSON.stringify(complete.report)).not.toContain('docs/readme.md');
      {
        const { timings: _timings, ...document } = complete.report as Record<string, unknown>;
        captured['complete-excluded-only-findings'] = { paths: [], exitCode: complete.exitCode, document: JSON.parse(JSON.stringify(document).replaceAll(root, '<root>')) };
      }

      await write('src/index.ts', 'export const app = 2;\n');
      const mixed = await check('mixed-pass-findings', ['src/index.ts', 'docs/readme.md', 'fixture/src/f.ts'], 30_000);
      expect(mixed.exitCode).toBe(1);
      expect(mixed.paths.map(path => path.disposition)).toEqual(['checked', 'not-analyzed', 'not-analyzed']);

      // An edit the deadline cannot cover, beside a not-analyzed path and a path with a standing finding.
      let deadline: RamifyCheckResult | undefined;
      for (let attempt = 3; attempt < 9 && deadline?.exitCode !== 2; attempt += 1) {
        await write('src/index.ts', `export const app = ${attempt};\n`);
        deadline = await check('mixed-deadline', ['src/index.ts', 'docs/readme.md', 'scripts/probe.ts'], 1);
      }
      expect([deadline!.exitCode, deadline!.outcome, deadline!.reason]).toEqual([2, 'not-checked', 'deadline-exceeded']);
      expect(deadline!.paths.map(path => [path.disposition, path.reason])).toEqual([
        ['not-checked', 'deadline-exceeded'], ['not-analyzed', 'owned-unwired'], ['not-checked', 'deadline-exceeded'],
      ]);

      await rm(resolve(root, 'scripts/probe.ts'));
      const deletion = await check('source-deletion', ['scripts/probe.ts'], 30_000);
      expect([deletion.exitCode, deletion.outcome]).toEqual([0, 'checked']);
      expect(disposition(deletion, 'scripts/probe.ts')).toMatchObject({ disposition: 'checked', reason: 'deleted', sha256: null });
      expect(deletion.removed).toEqual([(boundary.report as { findings: Array<{ id: string }> }).findings[0]!.id]);

      // The compiler selects source in the scratch directory; the warning comes with a later revision.
      await write('src/tmp/scratch.ts', 'export const scratch = 1;\n');
      let scratch: RamifyCheckResult | undefined;
      for (let attempt = 20; attempt < 26 && !JSON.stringify(scratch?.report ?? null).includes('compiler-selected-scratch'); attempt += 1) {
        await write('src/index.ts', `export const app = ${attempt};\n`);
        scratch = await check('compiler-selected-scratch', ['src/tmp/scratch.ts', 'src/index.ts'], 30_000);
      }
      expect(disposition(scratch!, 'src/tmp/scratch.ts')).toMatchObject({ disposition: 'not-analyzed', reason: 'scratch', exclusion: { kind: 'scratch', directory: 'src/tmp', owner: 'app' } });
      expect((scratch!.report as { warnings: unknown[] }).warnings).toEqual([expect.objectContaining({ code: 'compiler-selected-scratch', path: 'src/tmp', files: ['src/tmp/scratch.ts'] })]);

      // The provider classifies a configuration path itself: never not-analyzed, never a pass it did not establish.
      const configuration = await check('configuration', ['tsconfig.json'], 30_000);
      const tsconfig = disposition(configuration, 'tsconfig.json')!;
      expect(tsconfig.disposition).not.toBe('not-analyzed');
      if (tsconfig.disposition === 'not-checked') expect([configuration.exitCode, tsconfig.reason]).toEqual([2, 'configuration-changed']);

      if (process.env.PLAN21_HOOK_PAYLOADS !== undefined) {
        const version = await ramify.run(['--version'], root);
        await writeFile(process.env.PLAN21_HOOK_PAYLOADS, `${JSON.stringify({ provider: version.stdout.trim(), cases: captured }, null, 2)}\n`);
      }
    } finally {
      await dispose();
      await fixture.remove();
    }
  }, 300_000);
});
