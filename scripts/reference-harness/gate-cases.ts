import { readFile, symlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import type { ProductionFiles } from '../production-selection.js';
import { plan1Instances } from './cases.js';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { verificationCapabilities } from './instances.js';
import { modelHandlers } from './model-cases.js';
import { recordObservation } from './observations.js';
import { readReviewedPlan, repositoryRoot } from './plan.js';
import { command } from './processes.js';
import { assertBaseline, filesBelow } from './reference-baseline.js';
import { verifyInstances } from './runner.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';
import { clean, sessionReport } from './session-expectations.js';
import { compilerValid } from './static-expectations.js';
import { regressionVariants, runTier } from './tiers.js';

const referenceRoot = join(repositoryRoot, 'examples/collection-review');
const handlers = new Map<string, InstanceHandler>();
const unchanged = async (): Promise<void> => {};
type ProjectHandler = Extract<InstanceHandler, { kind: 'project' }>;
const referenceFixture: Pick<ProjectHandler, 'kind' | 'fixture' | 'prepare' | 'baseline' | 'mutate'> = {
  kind: 'project', fixture: { kind: 'copy', sourceRoot: referenceRoot },
  prepare: ({ root }) => symlink(join(referenceRoot, 'node_modules'), join(root, 'node_modules')),
  baseline: async ({ root, assertions }) => { clean(await sessionReport(root), assertions); }, mutate: unchanged,
};

handlers.set('I1-01:baseline', { ...referenceFixture, run: async ({ root, assertions }: ProjectContext) => {
  const result = await command(repositoryRoot, process.execPath, [join(repositoryRoot, 'dist/src/cli-entry.js'), 'check', '--batch', '--root', root, '--format', 'json']);
  assertions.equal('compiled CLI exit and clean stderr', [result.code, result.signal, result.error, result.stderr], [0, null, null, '']);
  await assertBaseline(JSON.parse(result.stdout) as AnalysisReport, assertions, root);
} });
for (const variant of regressionVariants) handlers.set(`I1-30:reference-regression/${variant}`, {
  ...referenceFixture, run: ({ root, assertions }: ProjectContext) => runTier(root, variant, assertions),
});

async function listedTests(root: string): Promise<string[]> {
  const result = await command(root, process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'list', '--filesOnly', '--json']);
  recordObservation('test-discovery-command', result);
  if (result.code !== 0 || result.error) throw new Error(`Test discovery failed: ${result.stderr} ${result.error}`);
  return (JSON.parse(result.stdout) as Array<{ file: string }>).map(item => relative(root, item.file)).sort();
}

async function compilerFiles(root: string): Promise<string[]> {
  const result = await command(root, process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--project', 'tsconfig.json', '--listFilesOnly']);
  if (result.code !== 0 || result.error) throw new Error(`Compiler input enumeration failed: ${result.stderr} ${result.error}`);
  return result.stdout.trim().split('\n').map(file => relative(root, file.trim())).filter(file => !file.startsWith('..') && !file.startsWith('node_modules/')).sort();
}

const ownerPaths = ['', 'subs/analysis', 'subs/analysis/subs/model', 'subs/analysis/subs/descriptions',
  'subs/analysis/subs/project', 'subs/analysis/subs/typescript', 'subs/presentation',
  'subs/presentation/subs/layout', 'subs/cli'];
async function toolkitTests(root: string, assertions: Assertions): Promise<string[]> {
  const all = (await Promise.all(['src', 'subs'].map(path => filesBelow(root, path)))).flat().sort();
  const expected = all.filter(file => /\.test\.tsx?$/.test(file));
  const listed = await listedTests(root);
  assertions.equal('all current owner tests discovered exactly once', listed, expected);
  assertions.equal('no duplicate test registration', new Set(listed).size, listed.length);
  const compiler = await compilerFiles(root);
  assertions.equal('all discovered tests remain whole-project compiler inputs', listed.filter(file => !compiler.includes(file)), []);
  for (const owner of ownerPaths) assertions.ok(`${owner || '.'}: owned tests remain discovered`, listed.some(file => file.startsWith(`${owner ? owner + '/' : ''}src/tests/`)));
  const map = await readFile(join(root, 'docs/plans/done/iteration-1-project-verifier/move-map.md'), 'utf8');
  const destinations = { M: 'subs/analysis/subs/model/src/', P: 'subs/presentation/src/', L: 'subs/presentation/subs/layout/src/' };
  const migrated = map.split('\n').filter(line => /^\| `src\/.+\.test\.tsx?` \|/.test(line))
    .flatMap(line => [...line.split('|')[2].split('Move purely')[0].matchAll(/\b([MPL]) `(tests\/[^`]+\.test\.tsx?)`/g)]
      .map(match => destinations[match[1] as keyof typeof destinations] + match[2]));
  assertions.equal('move map contains all sixteen reviewed mandatory migration destinations', migrated.length, 16);
  assertions.equal('no reviewed migrated test lost', migrated.filter(file => !listed.includes(file)), []);
  recordObservation('toolkit-test-discovery', { discovered: listed, migrated, compilerFiles: compiler });
  return listed;
}

const toolkitFixture: Pick<ProjectHandler, 'kind' | 'fixture' | 'prepare' | 'baseline' | 'mutate'> = {
  kind: 'project', fixture: { kind: 'copy', sourceRoot: repositoryRoot },
  prepare: async ({ root }) => {
    await symlink(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'));
    await symlink(join(referenceRoot, 'node_modules'), join(root, 'examples/collection-review/node_modules'));
  }, baseline: async ({ root, assertions }) => {
    assertions.equal('toolkit copy keeps its declared root', (await readFile(join(root, 'module.ramify'), 'utf8')).split('\n').find(line => line.startsWith('module ')), 'module "ramify" tagged [dispatch]');
    await compilerValid(root, assertions);
  }, mutate: unchanged,
};
handlers.set('I1-30:test-discovery/toolkit', { ...toolkitFixture, run: async ({ root, assertions }: ProjectContext) => { await toolkitTests(root, assertions); } });

const ordinaryTest = 'subs/verification/src/ordinary.test.ts';
const nestedTest = 'subs/verification/src/tests/nested.test.ts';
const api = 'subs/provider/src/interfaces/api.ts';
const consumer = 'subs/consumer/src/probe.ts';
async function testingFixture(root: string): Promise<void> {
  await createProjectFixture(root);
  await symlink(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'));
  await put(root, 'vitest.config.ts', await readFile(join(repositoryRoot, 'vitest.config.ts'), 'utf8'));
}
async function addTestingOwner({ root }: { root: string }): Promise<void> {
  await put(root, 'subs/verification/module.ramify', 'ramify 1\nmodule verification tagged [testing]\n');
  await put(root, 'subs/verification/README.md', '# Verification\n\nExercises both test source forms.\n');
  for (const file of [ordinaryTest, nestedTest]) await put(root, file, `import { it, expect } from 'vitest';\nit('${file}', () => { expect(2 + 2).toBe(4); });\n`);
  const config = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
  config.compilerOptions.types = ['node', 'vitest/globals'];
  await put(root, 'tsconfig.json', JSON.stringify(config));
}
const testingProject: Pick<ProjectHandler, 'kind' | 'fixture' | 'baseline' | 'mutate'> = {
  kind: 'project', fixture: { kind: 'create', create: testingFixture },
  baseline: async ({ root, assertions }) => { await compilerValid(root, assertions); clean(await sessionReport(root), assertions); },
  mutate: addTestingOwner,
};
async function assertTestingDiscovery(root: string, assertions: Assertions): Promise<void> {
  assertions.equal('ordinary testing-module and nested tests discovered once each', await listedTests(root), [ordinaryTest, nestedTest]);
  const inputs = await compilerFiles(root);
  assertions.ok('whole-project compiler keeps both test source forms', [ordinaryTest, nestedTest].every(file => inputs.includes(file)));
  await compilerValid(root, assertions);
  // This two-assertion fixture verifies runner registration, not the toolkit regression suite.
  const run = await command(root, process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--reporter=json']);
  const report = JSON.parse(run.stdout);
  recordObservation('testing-module-tests', report);
  assertions.equal('both fixture assertions executed and passed', [run.code, run.error, report.numTotalTests, report.numPassedTests, report.numPendingTests], [0, null, 2, 2, 0]);
}
handlers.set('I1-30:test-discovery/testing-module', { ...testingProject, run: async ({ root, assertions }: ProjectContext) => {
  await assertTestingDiscovery(root, assertions);
  const listed = await listedTests(referenceRoot);
  const expected = (await filesBelow(referenceRoot)).filter(file => /\/src\/tests\/.*\.test\.tsx?$/.test('/' + file));
  assertions.equal('every reference owned Vitest file discovered', listed, expected);
  recordObservation('reference-test-discovery', { discovered: listed, standaloneCucumberFeature: 'subs/integration-tests/src/features/collection-review.viz.feature',
    cucumberEvidenceInstance: 'I1-30:reference-regression/cucumber' });
} });

async function productionFiles(root: string, assertions: Assertions, label: string): Promise<ProductionFiles> {
  const run = await command(repositoryRoot, 'npm', ['run', '--silent', 'production:files', '--', '--root', root]);
  assertions.equal(`${label}: actual production command passed`, [run.code, run.error], [0, null]);
  const result = JSON.parse(run.stdout) as ProductionFiles;
  assertions.equal(`${label}: versioned deterministic production file document`, [result.schemaVersion, result.root, result.configuration], ['ramify.production-files/1', '.', 'tsconfig.json']);
  assertions.equal(`${label}: sorted unique source list`, result.files, [...new Set(result.files)].sort());
  assertions.equal(`${label}: nested tests excluded`, result.files.filter(file => /(?:^|\/)src\/tests\//.test(file)), []);
  recordObservation('production-selection', { label, command: run.command, durationMs: run.durationMs, selection: result });
  return result;
}
handlers.set('I1-30:production-selection/toolkit', { ...toolkitFixture, run: async ({ root, assertions }: ProjectContext) => {
  const selection = await productionFiles(root, assertions, 'toolkit');
  for (const file of ['src/cli-entry.ts', 'src/interfaces/batch.ts', 'subs/analysis/src/interfaces/analysis.ts',
    'subs/analysis/subs/model/src/interfaces/model.ts', 'subs/cli/src/interfaces/cli.ts']) {
    assertions.ok(`${file}: ordinary toolkit interface or entry retained`, selection.files.includes(file));
  }
  const before = await toolkitTests(root, assertions);
  const build = await command(root, 'npm', ['run', 'build']);
  recordObservation('toolkit-production-build', build);
  assertions.equal('actual clean toolkit production build succeeds', [build.code, build.error], [0, null]);
  const emitted = await filesBelow(join(root, 'dist'));
  const expected = selection.files.flatMap(file => /\.d\.ts$/.test(file) || !/\.tsx?$/.test(file) ? [file]
    : [file.replace(/\.tsx?$/, '.js'), file.replace(/\.tsx?$/, '.d.ts')]).sort();
  assertions.equal('toolkit build emits precisely the actual selector file set', emitted, expected);
  assertions.equal('production build leaves test discovery complete', await listedTests(root), before);
  const types = await command(root, 'npm', ['run', 'type-check']);
  recordObservation('toolkit-whole-type-check', types);
  assertions.equal('complete type-check still passes after production build', [types.code, types.error], [0, null]);
  const reference = await productionFiles(referenceRoot, assertions, 'reference');
  assertions.equal('reference standalone testing source excluded', reference.files.filter(file => file.startsWith('subs/integration-tests/src/')), []);
  for (const file of ['src/interfaces/protocol.ts', 'subs/workspace/subs/contracts/src/interfaces/vocabulary.ts', 'subs/workspace/subs/reviews/subs/core/src/interfaces/port.ts']) {
    assertions.ok(`${file}: ordinary reference interface retained`, reference.files.includes(file));
  }
  recordObservation('production-emitted-files', emitted);
} });
handlers.set('I1-30:production-selection/testing-module', { ...testingProject, run: async ({ root, assertions }: ProjectContext) => {
  const selection = await productionFiles(root, assertions, 'testing-module fixture');
  assertions.equal('independently named production inclusions only', selection.files, [consumer, api]);
  assertions.equal('all testing owner source excluded', selection.files.filter(file => file.startsWith('subs/verification/src/')), []);
  await put(root, 'tsconfig.build.json', JSON.stringify({ extends: './tsconfig.json', compilerOptions: {
    noEmit: false, declaration: true, rootDir: '.', outDir: 'dist', incremental: false }, files: [], include: [] }));
  const build = await command(root, process.execPath, ['--import', import.meta.resolve('tsx'), join(repositoryRoot, 'scripts/build-production.ts')]);
  recordObservation('testing-module-production-build', build);
  assertions.equal('real production build of testing-module fixture succeeds', [build.code, build.error], [0, null]);
  assertions.equal('fixture build retains ordinary interfaces and excludes both testing forms', await filesBelow(join(root, 'dist')),
    [consumer, api].flatMap(file => [file.replace(/\.ts$/, '.d.ts'), file.replace(/\.ts$/, '.js')]).sort());
  await assertTestingDiscovery(root, assertions);
} });

// These nested runs test gate behavior using real model assertions. Other
// providers deliberately remain unavailable, so they cannot recursively run gates
// or manufacture source conformance. Full-mode failures must name the sabotage.
const targetId = 'I1-14:renamed-kinds';
for (const mode of ['intermediate', 'full'] as const) for (const sabotage of ['remove', 'disable', 'assertion'] as const) {
  handlers.set(`I1-30:harness-required/${mode}-${sabotage}`, { kind: 'memory', run: async ({ assertions }) => {
    const plan = readReviewedPlan();
    const capabilities = new Set(verificationCapabilities);
    const iteration = mode === 'intermediate' ? 3 : undefined;
    const run = (records = plan1Instances, providers = modelHandlers) => verifyInstances({ plan, records,
      runtime: { capabilities, handlers: providers }, iteration, workRoot: join(referenceRoot, '.reference-work') });
    const control = await run();
    assertions.equal('unsabotaged real model control passes all fourteen assertions sets', control.instances.filter(item => item.iteration === 3).every(item => item.status === 'passed'), true);
    assertions.equal('control gate distinguishes full pending from intermediate success', control.passed, mode === 'intermediate');
    const providers = new Map(modelHandlers);
    let records = plan1Instances;
    if (sabotage === 'remove') records = records.filter(record => record.id !== targetId);
    if (sabotage === 'disable') providers.delete(targetId);
    if (sabotage === 'assertion') providers.set(targetId, { kind: 'memory', run: context => { context.assertions.equal('injected failed expectation', 'denied', 'allowed'); } });
    const broken = await run(records, providers);
    const result = broken.instances.find(item => item.id === targetId)!;
    assertions.equal('sabotaged gate fails', [broken.passed, broken.planComplete], [false, false]);
    assertions.equal('sabotage cannot hide behind other pending work', [result.required, result.status, result.reason],
      [true, sabotage === 'assertion' ? 'failed' : 'not-executed', sabotage === 'remove' ? 'missing-record' : sabotage === 'disable' ? 'missing-handler' : 'assertion-failed']);
    assertions.equal('all independently required membership slots retained', broken.instances.length, 308);
    if (sabotage === 'assertion') assertions.equal('actual failed assertion retained', result.assertions.map(item => item.status), ['failed']);
    if (sabotage === 'remove') assertions.ok('deleted record remains an inventory error', broken.inventoryIssues.includes(`Missing reviewed instance: ${targetId}`));
    recordObservation('gate-sabotage', { mode, sabotage, control: control.summary, broken: broken.summary, result, inventoryIssues: broken.inventoryIssues });
  } });
}
export const gateHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
