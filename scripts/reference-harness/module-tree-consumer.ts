import { cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { repositoryRoot } from './plan.js';
import { command } from './processes.js';
import type { CommandResult } from './processes.js';
import { relocationEnvironment } from './relocation.js';
import { Assertions } from './runner.js';

/**
 * A separate package consumer of `ramify.ts/module-tree`, installed from the
 * packed tarball of the built checkout into a directory outside it: its own
 * manifest and React, a type check, a Vite build whose CSS holds the canvas
 * and React Flow base rules from one import, a jsdom render of hook-using
 * bodies in variable-height nodes, exactly one `react` in its dependency tree,
 * and a plain-Node probe of which modules each UI entry loads.
 *
 *     npm run build
 *     npx tsx scripts/reference-harness/module-tree-consumer.ts
 */
const fixture = join(repositoryRoot, 'scripts/reference-harness/fixtures/module-tree-consumer');
const entryFiles = ['dist/subs/presentation/src/module-tree-entry.js', 'dist/subs/presentation/src/module-tree-entry.d.ts',
  'dist/subs/presentation/src/module-tree-entry.css', 'dist/subs/presentation/subs/project-view/src/ModuleTreeCanvas.js',
  'dist/subs/presentation/subs/project-view/src/ModuleTreeCanvas.d.ts',
  'dist/subs/presentation/subs/project-view/src/module-tree-canvas.css'];
const allowedSpecifiers = new Set(['ramify.ts/module-tree', 'ramify.ts/module-tree.css']);

const assertions = new Assertions();
const commands: Array<Omit<CommandResult, 'stdout' | 'stderr'> & { label: string; stderrTail?: string }> = [];
const observed: Record<string, unknown> = {};
const work = await mkdtemp(join(tmpdir(), 'ramify-module-tree-consumer-'));
const consumer = join(work, 'consumer');
const environment = relocationEnvironment(work);
let failure: unknown = null;

async function run(label: string, cwd: string, executable: string, args: readonly string[], timeoutMs = 300_000): Promise<CommandResult> {
  const result = await command(cwd, executable, args, timeoutMs, environment);
  const { stdout: _stdout, stderr, ...summary } = result;
  commands.push({ label, ...summary, ...result.code === 0 ? {} : { stderrTail: stderr.slice(-4000) } });
  assertions.equal(`${label}: exit`, [result.code, result.signal, result.error], [0, null, null]);
  return result;
}

async function files(directory: string, prefix = ''): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) found.push(...await files(directory, path));
    else found.push(path);
  }
  return found;
}

/** Every installed copy of a package, found on disk rather than from npm's report. */
async function installedCopies(root: string, name: string): Promise<string[]> {
  const copies: string[] = [];
  async function walk(modules: string): Promise<void> {
    let entries;
    try { entries = await readdir(modules, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.bin') continue;
      const packages = entry.name.startsWith('@')
        ? (await readdir(join(modules, entry.name), { withFileTypes: true })).filter(item => item.isDirectory()).map(item => join(entry.name, item.name))
        : [entry.name];
      for (const pkg of packages) {
        const path = join(modules, pkg);
        try {
          const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')) as { name?: string };
          if (manifest.name === name) copies.push(relative(root, path));
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        await walk(join(path, 'node_modules'));
      }
    }
  }
  await walk(join(root, 'node_modules'));
  return copies.sort();
}

try {
  for (const file of entryFiles) {
    assertions.ok(`${file}: built before packing`, (await stat(join(repositoryRoot, file))).isFile());
  }
  // Resolution climbs parent directories; nothing above the consumer may supply a package.
  for (let ancestor = dirname(consumer); ancestor !== dirname(ancestor); ancestor = dirname(ancestor)) {
    assertions.equal(`${ancestor}: no enclosing node_modules`, await lstat(join(ancestor, 'node_modules')).then(() => true, () => false), false);
  }
  assertions.equal('consumer is outside the checkout', relative(await realpath(repositoryRoot), await realpath(work)).startsWith('..'), true);
  await mkdir(join(work, 'home')); await mkdir(join(work, 'temporary'));
  await writeFile(join(work, 'empty.npmrc'), '');
  await cp(fixture, consumer, { recursive: true });

  // Consumer source reaches Ramify only through the two public entries.
  const specifiers: string[] = [];
  for (const file of (await files(join(consumer, 'src')))) {
    const text = await readFile(join(consumer, 'src', file), 'utf8');
    for (const match of text.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)) specifiers.push(match[1]!);
  }
  const ramifySpecifiers = [...new Set(specifiers.filter(item => item.startsWith('ramify.ts') || item.includes('/subs/') || item.includes('dist/')))].sort();
  assertions.equal('consumer imports only the public module-tree entries', ramifySpecifiers, [...allowedSpecifiers].sort());
  assertions.equal('consumer imports the stylesheet exactly once',
    specifiers.filter(item => item.endsWith('.css')), ['ramify.ts/module-tree.css']);

  const packed = await run('pack built package', repositoryRoot, 'npm', ['pack', '--json', '--pack-destination', consumer], 600_000);
  const tarballs = JSON.parse(packed.stdout) as Array<{ filename: string; files: Array<{ path: string }> }>;
  assertions.equal('one real package archive created', tarballs.length, 1);
  for (const file of entryFiles) assertions.ok(`${file}: in the tarball`, tarballs[0]!.files.some(item => item.path === file));
  await rename(join(consumer, tarballs[0]!.filename), join(consumer, 'ramify.ts.tgz'));
  observed.tarball = { filename: tarballs[0]!.filename, files: tarballs[0]!.files.length };

  await run('install the consumer and the packed tarball', consumer, 'npm',
    ['install', '--prefer-offline', '--no-audit', '--no-fund', '--ignore-scripts'], 600_000);
  const installed = join(consumer, 'node_modules/ramify.ts');
  assertions.equal('installed package is an unpacked copy', (await lstat(installed)).isSymbolicLink(), false);
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>; dependencies: Record<string, string>;
    peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  };
  assertions.equal('installed manifest declares both entries', [manifest.exports['./module-tree'], manifest.exports['./module-tree.css']], [
    { types: './dist/subs/presentation/src/module-tree-entry.d.ts', import: './dist/subs/presentation/src/module-tree-entry.js' },
    './dist/subs/presentation/src/module-tree-entry.css']);
  assertions.equal('React is an optional peer and absent from dependencies',
    ['react', 'react-dom'].map(name => [manifest.dependencies[name] ?? null, typeof manifest.peerDependencies?.[name], manifest.peerDependenciesMeta?.[name]?.optional]),
    [[null, 'string', true], [null, 'string', true]]);
  const reactCopies = await installedCopies(consumer, 'react'), reactDomCopies = await installedCopies(consumer, 'react-dom');
  assertions.equal('exactly one react in the dependency tree', reactCopies, ['node_modules/react']);
  assertions.equal('exactly one react-dom in the dependency tree', reactDomCopies, ['node_modules/react-dom']);
  const tree = await run('npm dependency tree for react', consumer, 'npm', ['ls', 'react', '--all', '--json']);
  interface ListedPackage { readonly version?: string; readonly dependencies?: Record<string, ListedPackage> }
  const versions = new Set<string>();
  const collect = (node: ListedPackage): void => {
    for (const [child, value] of Object.entries(node.dependencies ?? {})) {
      if (child === 'react' && value.version) versions.add(value.version);
      collect(value);
    }
  };
  collect(JSON.parse(tree.stdout) as ListedPackage);
  assertions.equal('npm reports one react version', [...versions], [JSON.parse(await readFile(join(consumer, 'node_modules/react/package.json'), 'utf8')).version]);
  observed.react = { copies: reactCopies, reactDom: reactDomCopies, versions: [...versions] };

  await run('consumer type check', consumer, process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json']);
  await run('consumer Vite build', consumer, process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
  const assets = (await readdir(join(consumer, 'dist/assets'))).sort();
  const styles = assets.filter(name => name.endsWith('.css'));
  assertions.equal('the build emits one stylesheet', styles.length, 1);
  const css = await readFile(join(consumer, 'dist/assets', styles[0]!), 'utf8');
  const rules = { reactFlowBase: ['.react-flow__pane', '.react-flow__viewport', '.react-flow__minimap', '.react-flow__controls'],
    canvas: ['.module-tree__canvas', '.module-tree__node--muted', '.module-tree__node--provisional', '.module-tree__node-body', '.module-tree__toggle'] };
  for (const [kind, selectors] of Object.entries(rules)) for (const selector of selectors) {
    assertions.ok(`built CSS holds ${kind} rule ${selector}`, css.includes(selector));
  }
  assertions.equal('built CSS has no unresolved @import', /@import/.test(css), false);
  assertions.equal('built CSS omits the explorer-only rules', ['.module-arch__radial-canvas', '.module-tree__node-content'].filter(item => css.includes(item)), []);
  observed.build = { assets, cssBytes: css.length };

  const render = await run('consumer jsdom render', consumer, process.execPath,
    ['--import', './jsdom-globals.mjs', '--import', 'tsx', 'src/render-check.tsx']);
  const rendered = JSON.parse(render.stdout.trim().split('\n').at(-1)!) as { results: Array<{ name: string; passed: boolean }> };
  assertions.ok('consumer render cases ran and passed', rendered.results.length >= 5 && rendered.results.every(item => item.passed));
  observed.render = rendered;

  // Plain Node, no loaders: which modules does each UI entry resolve?
  await writeFile(join(consumer, 'load-probe.mjs'), `import { registerHooks } from 'node:module';
const urls = [];
registerHooks({ resolve(specifier, context, next) { const result = next(specifier, context); urls.push(result.url); return result; } });
const entry = process.argv[2];
await import(entry);
console.log(JSON.stringify({ entry, resolved: urls.length,
  xyflow: urls.some(url => url.includes('/node_modules/@xyflow/react/')),
  stylesheets: urls.filter(url => /\\.css(?:$|\\?)/.test(url)) }));
`);
  const probes: Record<string, unknown> = {};
  for (const entry of ['ramify.ts/presentation', 'ramify.ts/module-tree']) {
    const result = await run(`plain-Node load probe ${entry}`, consumer, process.execPath, ['load-probe.mjs', entry]);
    probes[entry] = JSON.parse(result.stdout);
  }
  const probe = (entry: string) => probes[entry] as { xyflow: boolean; stylesheets: string[]; resolved: number };
  assertions.equal('ramify.ts/presentation loads neither @xyflow/react nor a stylesheet',
    [probe('ramify.ts/presentation').xyflow, probe('ramify.ts/presentation').stylesheets], [false, []]);
  assertions.equal('negative control: ramify.ts/module-tree loads @xyflow/react and no stylesheet',
    [probe('ramify.ts/module-tree').xyflow, probe('ramify.ts/module-tree').stylesheets], [true, []]);
  observed.loadProbe = probes;
} catch (error) {
  failure = error;
}

const evidence = assertions.finish();
const passed = failure === null && evidence.every(item => item.status === 'passed');
console.log(JSON.stringify({ evidence: 'module-tree-package-consumer', node: process.version, at: new Date().toISOString(),
  passed, assertions: evidence.length, failed: evidence.filter(item => item.status === 'failed'),
  ...failure === null ? {} : { error: String(failure instanceof Error ? failure.stack ?? failure.message : failure) },
  observed, commands, ...passed ? {} : { preserved: work } }, null, 2));
if (passed) await rm(work, { recursive: true, force: true });
else process.exitCode = 1;
