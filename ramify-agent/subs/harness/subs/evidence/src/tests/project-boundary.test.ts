import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { RamifyCli } from '../ramify-cli.js';
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
