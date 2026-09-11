import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { portableValue } from './artifact.js';
import { replaceExactlyOnce } from './mutation.js';
import { analysisEvidence, recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import { command } from './processes.js';
import type { CommandResult } from './processes.js';
import type { InstanceHandler, ProjectContext } from './runner.js';

const referencePath = 'examples/collection-review';
const relay = 'expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog to parent';
const withoutRouter = 'expose-sub createCatalogTools, inspectRecord from catalog to parent';
const entryFunctions = {
  'ramify.ts': 'createAnalysisSession', 'ramify.ts/analysis': 'analyzeProject',
  'ramify.ts/analysis/inventory': 'acquireInventory', 'ramify.ts/model': 'createDefaultTagRegistry',
  'ramify.ts/layout': 'placeNodes', 'ramify.ts/presentation': 'ModelDiagram', 'ramify.ts/cli': 'runCli',
} as const;

function within(root: string, path: string): boolean {
  const tail = relative(root, path);
  return tail === '' || tail !== '..' && !tail.startsWith(`..${sep}`) && !isAbsolute(tail);
}

/** No inherited loaders, module search path, package prefix or checkout PATH. */
export function relocationEnvironment(runDirectory: string, inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    PATH: [dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter),
    HOME: join(runDirectory, 'home'), TMPDIR: join(runDirectory, 'temporary'),
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', CI: '1',
    npm_config_userconfig: join(runDirectory, 'empty.npmrc'),
    // A content-addressed npm download cache is not a module-resolution input.
    npm_config_cache: join(homedir(), '.npm'),
  };
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
    'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS']) {
    if (inherited[name]) environment[name] = inherited[name];
  }
  return environment;
}

function observe(context: ProjectContext, kind: string, data: unknown): void {
  recordObservation(kind, portableValue(data, [[context.runDirectory, '<relocation>'],
    [realpathSync(context.runDirectory), '<relocation>'], [repositoryRoot, '<toolkit>'],
    [realpathSync(repositoryRoot), '<toolkit>'], [process.execPath, 'node'], [homedir(), '<home>']]));
}

async function run(context: ProjectContext, label: string, cwd: string, executable: string,
  args: readonly string[], expectedCode = 0, timeoutMs = 300_000): Promise<CommandResult> {
  const result = await command(cwd, executable, args, timeoutMs, relocationEnvironment(context.runDirectory));
  observe(context, 'relocation-command', { label, ...result });
  context.assertions.equal(`${label}: actual subprocess exit`, [result.code, result.signal, result.error], [expectedCode, null, null]);
  return result;
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

async function assertLocalLinks(context: ProjectContext, root: string, label: string): Promise<void> {
  const canonical = await realpath(root);
  const outside: string[] = [];
  let links = 0;
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        links++;
        if (!within(canonical, await realpath(path))) outside.push(relative(root, path));
      } else if (entry.isDirectory()) await walk(path);
    }
  }
  await walk(root);
  context.assertions.equal(`${label}: every dependency symlink stays in its own installation`, outside, []);
  observe(context, 'relocation-dependency-links', { label, links, outside });
}

function semantic(report: AnalysisReport) {
  return { stages: report.stages, capabilities: report.capabilities, outcome: report.outcome,
    summary: report.summary, diagnostics: report.diagnostics, warnings: report.warnings, coverage: report.coverage };
}

function assertClean(context: ProjectContext, report: AnalysisReport, label: string): void {
  context.assertions.equal(`${label}: real reference completed cleanly`, [report.schemaVersion, report.outcome.execution,
    report.outcome.check, report.outcome.coverage, report.summary.complete, report.summary.owners,
    report.summary.denied, report.summary.errors, report.coverage], ['ramify.analysis/1', 'completed', 'passed', 'complete', true, 15, 0, 0, []]);
  context.assertions.equal(`${label}: original configuration warnings retained`, report.warnings,
    ['vite.config.ts', 'vitest.config.ts'].map(file => ({ code: 'outside-module-source', entry: file, count: 1, files: [file] })));
  observe(context, 'relocation-analysis', { label, report: analysisEvidence(report) });
}

const installedRoot = (context: ProjectContext) => join(context.runDirectory, 'consumer');
const installedBin = (context: ProjectContext) => join(installedRoot(context), 'node_modules/.bin/ramify');

/** Independently callable smoke setup; it does not register or pass a matrix instance. */
export async function prepareRelocatedPackage(context: ProjectContext): Promise<void> {
  const { root, assertions, runDirectory } = context;
  const canonicalRoot = await realpath(root), canonicalSource = await realpath(repositoryRoot);
  assertions.equal('relocation package is outside the source checkout', within(canonicalSource, canonicalRoot), false);
  // A source checkout may itself be nested in a host repository. Reject every
  // enclosing Git root, without invoking Git or consulting another checkout.
  for (let ancestor = dirname(canonicalSource); ancestor !== dirname(ancestor); ancestor = dirname(ancestor)) {
    if (await exists(join(ancestor, '.git'))) assertions.equal(`relocation is outside enclosing repository ${ancestor}`, within(ancestor, canonicalRoot), false);
  }
  for (const path of ['.git', 'node_modules', 'dist', `${referencePath}/node_modules`, 'site/node_modules']) {
    assertions.equal(`${path}: clean copy contains no dependency build or repository state`, await exists(join(root, path)), false);
  }
  await mkdir(join(runDirectory, 'home'));
  await mkdir(join(runDirectory, 'temporary'));
  await writeFile(join(runDirectory, 'empty.npmrc'), '');
  const versions = await run(context, 'npm runtime version', root, 'npm', ['--version']);
  const manifests: Array<{ scope: string; lockSha256: string }> = [];
  for (const scope of ['.', referencePath]) {
    const packageRoot = join(root, scope), lock = await readFile(join(packageRoot, 'package-lock.json'));
    manifests.push({ scope, lockSha256: createHash('sha256').update(lock).digest('hex') });
    await run(context, `${scope}: frozen dependency installation`, packageRoot, 'npm', ['ci', '--prefer-offline', '--no-audit', '--no-fund']);
    assertions.equal(`${scope}: own lockfile unchanged`, await readFile(join(packageRoot, 'package-lock.json')), lock);
    await assertLocalLinks(context, join(packageRoot, 'node_modules'), scope);
  }
  const compiler = JSON.parse(await readFile(join(root, 'node_modules/typescript/package.json'), 'utf8'));
  observe(context, 'relocation-runtime', { node: process.version, npm: versions.stdout.trim(), typescript: compiler.version, manifests,
    environment: 'Isolated home, temporary directory and PATH; no inherited Node loaders or module paths' });
  await run(context, 'clean source bootstrap build', root, 'npm', ['run', 'build']);
  await run(context, 'relocated whole type-check', root, 'npm', ['run', 'type-check']);
  assertions.equal('build creates the actual executable', await exists(join(root, 'dist/src/cli-entry.js')), true);
  const compiled = await run(context, 'relocated compiled reference', root, process.execPath,
    ['dist/src/cli-entry.js', 'check', '--batch', '--root', referencePath, '--format', 'json']);
  assertions.equal('compiled JSON has clean stderr', compiled.stderr, '');
  const baseline = JSON.parse(compiled.stdout) as AnalysisReport;
  assertClean(context, baseline, 'compiled baseline');

  const consumer = installedRoot(context);
  await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
  const packed = await run(context, 'pack built package', root, 'npm', ['pack', '--json', '--pack-destination', consumer]);
  const tarballs = JSON.parse(packed.stdout) as Array<{ filename: string; integrity: string; files: Array<{ path: string }> }>;
  assertions.equal('one real package archive created', tarballs.length, 1);
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { exports: Record<string, { types: string; import: string }> };
  assertions.equal('every reviewed portable Node and UI package entry remains declared', Object.keys(manifest.exports).map(key => key === '.' ? 'ramify.ts' : `ramify.ts${key.slice(1)}`).sort(), Object.keys(entryFunctions).sort());
  for (const [entry, targets] of Object.entries(manifest.exports)) for (const [kind, path] of Object.entries(targets)) {
    assertions.ok(`${entry} ${kind}: actual tarball contains declared entry`, tarballs[0].files.some(file => file.path === path.replace(/^\.\//, '')));
  }
  observe(context, 'relocation-package', { filename: tarballs[0].filename, integrity: tarballs[0].integrity,
    entries: manifest.exports, files: tarballs[0].files.map(file => file.path) });
  await run(context, 'install actual tarball without dev dependencies', consumer, 'npm',
    ['install', '--omit=dev', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund', `./${tarballs[0].filename}`]);
  const installed = join(consumer, 'node_modules/ramify.ts');
  assertions.equal('installed package is an unpacked copy', (await lstat(installed)).isSymbolicLink(), false);
  assertions.ok('installed shebang resolves to the unpacked executable', within(await realpath(installed), await realpath(installedBin(context))));
  for (const name of ['vitest', 'tsx', 'jsdom']) assertions.equal(`${name}: dev dependency absent from consumer`, await exists(join(consumer, 'node_modules', name)), false);
  await assertLocalLinks(context, join(consumer, 'node_modules'), 'consumer');
  const consumerLock = await readFile(join(consumer, 'package-lock.json'));
  observe(context, 'relocation-consumer-installation', {
    lockSha256: createHash('sha256').update(consumerLock).digest('hex'),
    typescript: JSON.parse(await readFile(join(consumer, 'node_modules/typescript/package.json'), 'utf8')).version,
    react: JSON.parse(await readFile(join(consumer, 'node_modules/react/package.json'), 'utf8')).version,
  });

  const probe = `import { relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = process.cwd();
const entries = ${JSON.stringify(entryFunctions)};
const observed = [];
for (const [entry, name] of Object.entries(entries)) {
  const resolved = relative(root, fileURLToPath(import.meta.resolve(entry)));
  if (isAbsolute(resolved) || !resolved.startsWith('node_modules/ramify.ts/dist/')) throw new Error('Nonlocal package entry: ' + entry);
  const value = await import(entry);
  if (typeof value[name] !== 'function') throw new Error('Missing callable export: ' + entry + '#' + name);
  observed.push({ entry, resolved, callable: name });
}
console.log(JSON.stringify(observed));
`;
  await writeFile(join(consumer, 'entries.mjs'), probe);
  const imports = await run(context, 'import every installed public entry', consumer, process.execPath, ['entries.mjs']);
  assertions.equal('all seven actual package entry imports executed', JSON.parse(imports.stdout).map((entry: { entry: string }) => entry.entry), Object.keys(entryFunctions));
  observe(context, 'relocation-installed-entries', JSON.parse(imports.stdout));
  const installedCheck = await run(context, 'installed reference JSON', consumer, installedBin(context),
    ['check', '--batch', '--root', join(root, referencePath), '--format', 'json']);
  const installedReport = JSON.parse(installedCheck.stdout) as AnalysisReport;
  assertClean(context, installedReport, 'installed baseline');
  assertions.equal('installed and copied compiled engine agree', semantic(installedReport), semantic(baseline));
  const human = await run(context, 'installed reference implicit-root human output', join(root, referencePath), installedBin(context), ['check', '--batch']);
  assertions.ok('installed human command reports completed whole reference', human.stdout.includes('15 owners') && human.stdout.includes('check: passed'));
  assertions.equal('installed commands keep stdout separate from stderr', [installedCheck.stderr, human.stderr], ['', '']);
}

/** Required by the full handler. There is deliberately no successful skip mode. */
export async function testRelocatedPackage(context: ProjectContext): Promise<void> {
  const output = join(context.runDirectory, 'toolkit-tests.json');
  await run(context, 'relocated toolkit regression', context.root, 'npm', ['test', '--', '--reporter=json', '--outputFile', output]);
  const report = JSON.parse(await readFile(output, 'utf8'));
  context.assertions.ok('relocated toolkit tests execute nonempty assertions', report.success && report.numTotalTests > 0 && report.numPassedTests === report.numTotalTests);
  context.assertions.equal('relocated toolkit has no failed pending or todo assertions', [report.numFailedTests, report.numPendingTests, report.numTodoTests], [0, 0, 0]);
  for (const file of report.testResults) context.assertions.ok(`${relative(context.root, file.name)}: relocated assertions ran`,
    file.assertionResults.length > 0 && file.assertionResults.every((item: { status: string }) => item.status === 'passed'));
  observe(context, 'relocation-toolkit-tests', report);
}

export async function denyRelocatedReference({ root }: { root: string }): Promise<void> {
  await replaceExactlyOnce(join(root, referencePath, 'subs/workspace/module.ramify'), relay, withoutRouter);
}

export async function assertRelocatedDenial(context: ProjectContext): Promise<void> {
  const reference = join(context.root, referencePath);
  await run(context, 'relocated negative remains valid TypeScript', reference, 'npm', ['run', 'type-check']);
  const result = await run(context, 'installed reference denial', installedRoot(context), installedBin(context),
    ['check', '--batch', '--root', reference, '--format', 'json'], 1);
  const report = JSON.parse(result.stdout) as AnalysisReport;
  context.assertions.equal('installed negative is a completed failed check', [report.outcome.execution, report.outcome.check, report.summary.denied], ['completed', 'failed', 1]);
  context.assertions.equal('installed independent W2 negative retains located original and importer', report.diagnostics.map(issue =>
    [issue.code, issue.location?.file, issue.original, issue.importer?.owner, issue.importer?.kind]),
  [['not-visible', 'src/assembly.ts', { kind: 'code', owner: 'collection-review/workspace/catalog', file: 'router.ts', binding: 'createCatalogRouter' }, 'collection-review', 'ordinary']]);
  context.assertions.ok('installed denial keeps declaration evidence and useful location', report.diagnostics[0].location!.line > 0 && report.diagnostics[0].related.length > 0);
  observe(context, 'relocation-analysis', { label: 'installed negative', report: analysisEvidence(report) });
  await replaceExactlyOnce(join(reference, 'subs/workspace/module.ramify'), withoutRouter, relay);
  const restored = await run(context, 'installed restored control', reference, installedBin(context), ['check', '--batch', '--format', 'json']);
  assertClean(context, JSON.parse(restored.stdout) as AnalysisReport, 'restored baseline');
}

export const relocationHandlers: ReadonlyMap<string, InstanceHandler> = new Map([['I1-28:relocated-package', {
  kind: 'project', fixture: { kind: 'copy', sourceRoot: repositoryRoot },
  workRoot: join(tmpdir(), 'ramify-relocation-work'),
  baseline: async context => { await prepareRelocatedPackage(context); await testRelocatedPackage(context); },
  mutate: denyRelocatedReference, run: assertRelocatedDenial,
}]]);
