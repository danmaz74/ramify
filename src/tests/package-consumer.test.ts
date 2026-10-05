import { spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * PB1-34: an isolated NodeNext consumer of the packed candidate. The built
 * checkout is packed with `npm pack` and the tarball installed into a directory
 * outside it, without development dependencies. Expected results are reasoned from the package manifest's `exports`
 * and Node's and TypeScript's NodeNext resolution: every declared entry
 * resolves into the installed package and type-checks with its real
 * declarations, and a subpath the manifest does not list is refused by both,
 * although the file it names is in the package.
 *
 * Requires `npm run build` first; the packed files are the current build.
 */

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const timeout = 300_000;

/** Every declared entry and a callable or component it must provide. */
const entries: Readonly<Record<string, string>> = {
  'ramify.ts': 'createAnalysisSession', 'ramify.ts/analysis': 'analyzeProject',
  'ramify.ts/analysis/inventory': 'acquireInventory', 'ramify.ts/model': 'createDefaultTagRegistry',
  'ramify.ts/presentation': 'ModelDiagram', 'ramify.ts/module-tree': 'ModuleTreeCanvas',
  'ramify.ts/cli': 'runCli', 'ramify.ts/layout': 'placeNodes', 'ramify.ts/client': 'connectDaemon',
};
const stylesheet = 'ramify.ts/module-tree.css';
/** An unlisted subpath naming a file the package contains. */
const internal = 'ramify.ts/dist/subs/analysis/src/analyze-project.js';

const supportedSource = `${Object.entries(entries).map(([entry, name]) => `import { ${name} } from '${entry}';`).join('\n')}
import type { AnalysisReport } from 'ramify.ts/analysis';
import type { ResolvedTagRegistry } from 'ramify.ts/model';

const registry: ResolvedTagRegistry = createDefaultTagRegistry();
export const supported = [${Object.values(entries).join(', ')}, registry] as const;
export const schema: AnalysisReport['schemaVersion'] = 'ramify.analysis/2';
// Real declarations, not \`any\`: a wrong schema literal must fail to type-check.
// @ts-expect-error the report schema is 'ramify.analysis/2'
export const wrong: AnalysisReport['schemaVersion'] = 'ramify.analysis/1';
`;
const internalSource = `import { analyzeProject } from '${internal}';\nexport const internal = analyzeProject;\n`;

const probe = `import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const entries = ${JSON.stringify([...Object.keys(entries), stylesheet])};
const resolved = entries.map(entry => [entry, relative(process.cwd(), fileURLToPath(import.meta.resolve(entry)))]);
let refused = null;
try { import.meta.resolve(${JSON.stringify(internal)}); } catch (error) { refused = error.code; }
const model = await import('ramify.ts/model');
const client = await import('ramify.ts/client');
console.log(JSON.stringify({ resolved, refused, loaded: [typeof model.createDefaultTagRegistry, typeof client.connectDaemon] }));
`;

interface Result { readonly code: number | null; readonly stdout: string; readonly stderr: string }

/** No inherited package or script context reaches the consumer's commands; npm's own
 * configuration, such as its download cache, is kept, and every command names its target. */
function environment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^npm_(?:package|lifecycle)_/i.test(name)));
}

function run(cwd: string, executable: string, args: readonly string[]): Promise<Result> {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env: environment(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (bytes: Buffer) => { stdout += bytes.toString(); });
    child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString(); });
    child.once('error', reject);
    child.once('close', code => accept({ code, stdout, stderr }));
  });
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

describe('PB1-34: isolated NodeNext package consumer', () => {
  it('resolves and type-checks every supported entry and refuses an unlisted internal subpath', async () => {
    const manifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as {
      version: string; exports: Record<string, unknown> };
    const specifier = (key: string) => key === '.' ? 'ramify.ts' : `ramify.ts${key.slice(1)}`;
    // The test's entry list is the manifest's: a new or removed entry must be reasoned about here.
    expect(Object.keys(manifest.exports).map(specifier).sort()).toEqual([...Object.keys(entries), stylesheet].sort());
    for (const file of ['dist/subs/analysis/src/index.js', 'dist/src/ramify', internal.slice('ramify.ts/'.length)]) {
      expect(await exists(join(repositoryRoot, file)), `${file}: run npm run build first`).toBe(true);
    }

    const work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-package-consumer-')));
    try {
      const consumer = join(work, 'consumer');
      await mkdir(consumer);
      // Resolution climbs parent directories; nothing above the consumer may supply a package.
      for (let ancestor = dirname(consumer); ancestor !== dirname(ancestor); ancestor = dirname(ancestor)) {
        expect(await exists(join(ancestor, 'node_modules')), ancestor).toBe(false);
      }
      expect(relative(await realpath(repositoryRoot), consumer).startsWith('..')).toBe(true);

      const packed = await run(repositoryRoot, 'npm', ['pack', repositoryRoot, '--json', '--ignore-scripts', '--pack-destination', work]);
      expect(packed.code, packed.stderr).toBe(0);
      const tarballs = JSON.parse(packed.stdout) as Array<{ filename: string; version: string; files: Array<{ path: string }> }>;
      expect(tarballs.map(tarball => [tarball.filename, tarball.version])).toEqual([[`ramify.ts-${manifest.version}.tgz`, manifest.version]]);
      expect(tarballs[0]!.files.some(file => file.path === internal.slice('ramify.ts/'.length))).toBe(true);

      await writeFile(join(consumer, 'package.json'), '{ "private": true, "type": "module" }\n');
      const installed = await run(consumer, 'npm', ['install', '--prefix', consumer, join(work, tarballs[0]!.filename), '--omit=dev',
        '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund']);
      expect(installed.code, installed.stderr).toBe(0);
      expect((await lstat(join(consumer, 'node_modules/ramify.ts'))).isSymbolicLink()).toBe(false);
      expect(await exists(join(consumer, 'node_modules/ramify.ts', internal.slice('ramify.ts/'.length)))).toBe(true);
      for (const name of ['vitest', 'tsx', 'jsdom']) expect(await exists(join(consumer, 'node_modules', name)), name).toBe(false);

      await writeFile(join(consumer, 'supported.ts'), supportedSource);
      await writeFile(join(consumer, 'internal.ts'), internalSource);
      const compilerOptions = { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
        noEmit: true, skipLibCheck: true, types: [], lib: ['ES2022', 'DOM'] };
      await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions, files: ['supported.ts'] }));
      await writeFile(join(consumer, 'tsconfig.internal.json'), JSON.stringify({ compilerOptions, files: ['internal.ts'] }));
      // The consumer's own compiler, installed as the package's dependency.
      const tsc = join(consumer, 'node_modules/typescript/bin/tsc');
      const supported = await run(consumer, process.execPath, [tsc, '-p', 'tsconfig.json', '--pretty', 'false']);
      expect([supported.code, supported.stdout, supported.stderr]).toEqual([0, '', '']);
      const refused = await run(consumer, process.execPath, [tsc, '-p', 'tsconfig.internal.json', '--pretty', 'false']);
      expect(refused.code).not.toBe(0);
      expect(refused.stdout.trim().split('\n')).toEqual([
        `internal.ts(1,32): error TS2307: Cannot find module '${internal}' or its corresponding type declarations.`]);

      await writeFile(join(consumer, 'probe.mjs'), probe);
      const node = await run(consumer, process.execPath, ['probe.mjs']);
      expect([node.code, node.stderr]).toEqual([0, '']);
      const observed = JSON.parse(node.stdout) as { resolved: Array<[string, string]>; refused: string | null; loaded: string[] };
      const targets = Object.fromEntries(Object.entries(manifest.exports).map(([key, target]) => [specifier(key),
        `node_modules/ramify.ts/${(typeof target === 'string' ? target : (target as { import: string }).import).replace(/^\.\//, '')}`]));
      expect(Object.fromEntries(observed.resolved)).toEqual(targets);
      expect(observed.refused).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
      expect(observed.loaded).toEqual(['function', 'function']);
    } finally { await rm(work, { recursive: true, force: true }); }
  }, timeout);
});
