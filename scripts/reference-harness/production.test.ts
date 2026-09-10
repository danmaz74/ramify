import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildProduction } from '../build-production.js';
import { artifactAllowlist, inspectArtifactDependencies, promoteProductionArtifacts } from '../production-artifacts.js';
import { acquireProductionSelection, selectProductionFiles } from '../production-selection.js';

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-production-'));
  try {
    const files: Record<string, string> = {
      'module.ramify': 'ramify 1\nmodule fixture tagged [dispatch]\n',
      'package.json': JSON.stringify({ name: 'production-fixture', type: 'module', exports: {
        './api': { import: './dist/src/interfaces/api.js', types: './dist/src/interfaces/api.d.ts' },
      } }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', declaration: true,
        rootDir: '.', outDir: 'dist', types: [], strict: true }, include: ['src', 'outside.ts'], exclude: ['dist', '**/.reference-work'] }),
      'tsconfig.build.json': '{"extends":"./tsconfig.json","include":[],"files":[]}',
      'src/interfaces/api.ts': "export type { Manual } from '../manual.js'; export const answer = 42;\n",
      'src/manual.d.ts': 'export interface Manual { readonly value: string }',
      'src/unused.d.ts': 'export interface Unused { readonly value: number }',
      'src/ordinary.test.ts': 'export const ordinary = 1;',
      'src/helpers/tests/ordinary.ts': 'export const ordinary = 1;',
      'src/tests/private.ts': 'export const test = 1;',
      'src/style.css': '.root {}',
      'outside.ts': 'export const outside = 1;',
      'subs/specs/module.ramify': 'ramify 1\nmodule specs tagged [testing, dispatch]\n',
      'subs/specs/src/check.ts': 'export const spec = 1;',
      'subs/specs/src/style.css': '.testing {}',
      'subs/empty/module.ramify': 'ramify 1\nmodule empty\n',
    };
    for (const [file, text] of Object.entries(files)) {
      await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), text);
    }
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function command(root: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const script = fileURLToPath(new URL('../production-files.ts', import.meta.url));
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), script, '--root', root]);
    let stdout = '', stderr = '';
    child.stdout.on('data', (bytes: Buffer) => { stdout += bytes.toString(); });
    child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString(); });
    child.once('error', reject);
    child.once('close', code => accept({ code, stdout, stderr }));
  });
}

describe('inventory-driven production build', () => {
  it('emits the exact portable command document and selects profiles regardless of filename or compiler selection', async () => fixture(async root => {
    const expected = { schemaVersion: 'ramify.production-files/1', root: '.', configuration: 'tsconfig.json', files: [
      'src/helpers/tests/ordinary.ts', 'src/interfaces/api.ts', 'src/manual.d.ts', 'src/ordinary.test.ts', 'src/style.css', 'src/unused.d.ts',
    ] };
    const result = await command(root);
    expect(result).toEqual({ code: 0, stderr: '', stdout: `${JSON.stringify(expected, null, 2)}\n` });
    const { document, snapshot } = await acquireProductionSelection(root);
    expect(document).toEqual(expected);
    expect(() => selectProductionFiles({ ...snapshot, areas: [] })).toThrow('No resolved source profile');
    await expect(stat(join(root, 'subs/empty/src'))).rejects.toMatchObject({ code: 'ENOENT' });
  }), 15_000);

  it('fails invalid selection without printing a success-shaped document', async () => fixture(async root => {
    await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture tagged [unknown]\n');
    const result = await command(root);
    expect(result.code).toBe(1); expect(result.stdout).toBe(''); expect(result.stderr).toContain('unknown-tag');
  }));

  it('bootstraps without dist, keeps resources and public declaration inputs, and replaces obsolete output', async () => fixture(async root => {
    await buildProduction(root);
    expect(await readFile(join(root, 'dist/src/interfaces/api.js'), 'utf8')).toContain('answer = 42');
    expect(await readFile(join(root, 'dist/src/style.css'), 'utf8')).toBe('.root {}');
    expect(await readFile(join(root, 'dist/src/manual.d.ts'), 'utf8')).toContain('interface Manual');
    for (const file of ['src/unused.d.ts', 'src/tests/private.js', 'subs/specs/src/check.js', 'subs/specs/src/style.css', 'outside.js']) {
      await expect(stat(join(root, 'dist', file))).rejects.toMatchObject({ code: 'ENOENT' });
    }
    expect(await readdir(join(root, '.reference-work'))).toEqual([]);
    await writeFile(join(root, 'dist/stale.js'), 'obsolete');
    await buildProduction(root);
    await expect(stat(join(root, 'dist/stale.js'))).rejects.toMatchObject({ code: 'ENOENT' });
  }), 15_000);

  it('refuses a runtime import of compiler-followed testing output and preserves the prior dist', async () => fixture(async root => {
    await mkdir(join(root, 'dist')); await writeFile(join(root, 'dist/previous.txt'), 'previous');
    await writeFile(join(root, 'src/interfaces/api.ts'), "export { test } from '../tests/private.js';\n");
    await expect(buildProduction(root)).rejects.toThrow('Production dependency is absent or excluded');
    expect(await readFile(join(root, 'dist/previous.txt'), 'utf8')).toBe('previous');
    expect(await readdir(join(root, '.reference-work'))).toEqual([]);
  }), 15_000);

  it('promotes only mapped artifacts and requires real package targets', async () => fixture(async root => {
    const stage = join(root, 'stage'), output = join(root, 'output');
    await mkdir(join(stage, 'src/tests'), { recursive: true }); await mkdir(output);
    await writeFile(join(stage, 'src/main.js'), "export const main = 'retained';");
    await writeFile(join(stage, 'src/tests/leaked.js'), 'excluded');
    const files = await promoteProductionArtifacts(root, stage, output, ['src/main.ts'], { exports: { './main': './dist/src/main.js' } });
    expect(files).toEqual(['src/main.js']);
    await expect(promoteProductionArtifacts(root, stage, output, ['src/main.ts'], { exports: { './missing': './dist/src/missing.js' } }))
      .rejects.toThrow('Missing production package entry');
    expect(() => artifactAllowlist(['src/main.ts', 'src/main.js'])).toThrow('Production output collision');
  }));

  it('parses static and literal dynamic dependencies through comments, regexes and nested templates', async () => fixture(async root => {
    const path = join(root, 'emitted.js');
    await writeFile(path, `
      import './loaded.js'; export { symbol } from './forward.js';
      import(\`./dynamic.js\`); const value = require('../common.cjs');
      const asset = new URL('./image.svg', import.meta.url);
      // import './comment.js';
      const example = "import './example.js'";
      const pattern = /[\\\`*{}\\[\\]()#+.!_>-]/g;
      const nested = \`name-\${\`inner-\${value}\`}\`;
    `);
    const dependencies = await inspectArtifactDependencies(root, new Map([['emitted.js', path]]));
    expect(dependencies.get('emitted.js')).toEqual(['./loaded.js', './forward.js', './dynamic.js', '../common.cjs', './image.svg']);
  }));
});
