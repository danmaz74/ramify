import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewedPackage, validatePackageEntries } from '../validate-final-contracts.js';
import { executionIdentity } from './artifact.js';
import { assertClientClosure, completionEntries, toolkit } from './completion-cases.js';
import { verifyPlan1Regression } from './completion-regression.js';
import { object, readTrace, withSequenceProcess } from './equivalence-process.js';
import { runIsolatedProject } from './mutation.js';
import { recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import { plan2Instances } from './plan2-instances.js';
import { command } from './processes.js';
import { prepareRelocatedPackage, relocationEnvironment } from './relocation.js';
import type { Assertions, InstanceHandler, ProjectContext, VerificationReport } from './runner.js';

type Identity = Awaited<ReturnType<typeof executionIdentity>>;
const identityFields = ['sourceSha256', 'buildSha256', 'packageVersion', 'nodeVersion', 'typescriptVersion'] as const;
const sameInputs = (a: Identity, b: Identity) => identityFields.every(field => a[field] === b[field]);

// Independent literals from owners.md: the six added exposure lines and the
// removed increment line. The validator compares whole texts; these name the
// Plan 5 changes so a reverted declaration cannot hide inside that comparison.
export const addedDeclarationLines = [
  ['subs/analysis/subs/typescript/module.ramify', 'expose-src createAccessInterpreter from "access-interpreter.ts" to parent'],
  ['subs/analysis/subs/typescript/module.ramify', 'expose-src describeFiles, assembleCatalog from "descriptions.ts" to parent'],
  ['subs/analysis/subs/typescript/module.ramify', 'expose-src createRetainedSourceAnalysis from "retained-source-analysis.ts" to parent'],
  ['subs/analysis/subs/project/module.ramify', 'expose-src observeProject from "observer.ts" to parent'],
  ['subs/analysis/module.ramify', 'expose-src * from "interfaces/session.ts" to parent'],
  ['subs/analysis/module.ramify', 'expose-src openRetainedSession from "retained-session.ts" to parent'],
] as const;

// The reviewed eight package entries, and the recorded additions beside them:
// the module-tree canvas entry and its stylesheet. The stylesheet is a string
// export target, resolved and read but never imported, as `relocation.ts`
// separates entry imports from stylesheet files.
const reviewedEntryMap: readonly string[] = ['.', './analysis', './analysis/inventory', './model', './presentation', './cli', './layout', './client'];
const recordedEntryAdditions: readonly string[] = ['./module-tree'];
const recordedStylesheetAdditions: readonly string[] = ['./module-tree.css'];

// A module the CLI or client closure must never load: the retained session,
// its worker and supervisor, the compiler adapters and the compiler package.
export const sessionModulePattern = /(?:subs\/analysis\/src\/(?:retained-session|session-[\w-]+)|subs\/analysis\/subs\/typescript\/src\/(?:retained-source-analysis|compiler-helper|source-analysis)|node_modules\/typescript\/)/;

export interface DocumentCheck { readonly document: string; readonly name: string; readonly pattern: RegExp }
/** Statements scope.md's document revisions require of each architecture document. */
export const documentChecks: readonly DocumentCheck[] = [
  ...['docs/architecture/daemon.md', 'docs/architecture/memory-lifecycle.md', 'docs/architecture/processes-and-clients.md'].map(document => ({
    document, name: 'status states that MCP and overlays are not implemented',
    pattern: /The MCP adapter and unsaved-content overlays are not implemented/ })),
  { document: 'docs/architecture/daemon.md', name: 'the session runs in a worker thread', pattern: /retained analysis session[^.]*worker thread/ },
  { document: 'docs/architecture/daemon.md', name: 'facts are retained per file', pattern: /per-file export descriptions[^.]*per-file access facts/ },
  { document: 'docs/architecture/daemon.md', name: 'the covering rule', pattern: /\*\*Covering rule\.\*\*/ },
  { document: 'docs/architecture/daemon.md', name: 'the periodic and required sweep', pattern: /\*\*Sweep\.\*\*[^]*periodic sweep[^]*required sweep/ },
  { document: 'docs/architecture/daemon.md', name: 'the revision paths', pattern: /`unchanged-surface`, `source`, `description`, `metadata`, `membership` and `broad`/ },
  // Phase 1 project boundaries, iteration 8: the hook reply's document advanced to `ramify.check/2`.
  { document: 'docs/architecture/daemon.md', name: 'the hook request and reply', pattern: /\*\*Hook request and reply\.\*\*[^]*`ramify\.check\/2`/ },
  { document: 'docs/architecture/memory-lifecycle.md', name: 'the compiler server is a bounded cost', pattern: /compiler server[^.]*bounded cost/ },
  { document: 'docs/architecture/memory-lifecycle.md', name: 'the hot, warm and cold levels', pattern: /\| Hot \|[^]*\| Warm \|[^]*\| Cold \|/ },
  { document: 'docs/architecture/memory-lifecycle.md', name: 'the hot context budget', pattern: /`maxHotContexts`/ },
  { document: 'docs/architecture/processes-and-clients.md', name: 'check --changed is implemented', pattern: /`ramify check --changed <path>\.\.\./ },
  { document: 'docs/architecture/processes-and-clients.md', name: 'the hook exits', pattern: /\| 0 \|[^\n]*\n\| 1 \|[^\n]*\n\| 2 \|[^\n]*\n\| 130 \|/ },
  { document: 'docs/architecture/processes-and-clients.md', name: 'the example host adapter', pattern: /examples\/hooks\/claude-code-post-write\.mjs/ },
];
/** The two proposal analyses. Where present, each is marked superseded near its top. */
export const supersededAnalyses = ['docs/analysis/fast-incremental-checks.md', 'docs/analysis/fast-incremental-checks-retained-session.md'] as const;

export async function documentRevisionIssues(root: string): Promise<{ issues: string[]; checked: string[]; absentAnalyses: string[] }> {
  const issues: string[] = [], checked: string[] = [], absentAnalyses: string[] = [];
  for (const check of documentChecks) {
    const text = await readFile(join(root, check.document), 'utf8');
    if (check.pattern.test(text)) checked.push(`${check.document}: ${check.name}`);
    else issues.push(`${check.document}: missing ${check.name}`);
  }
  for (const analysis of supersededAnalyses) {
    let text: string;
    try { text = await readFile(join(root, analysis), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { absentAnalyses.push(analysis); continue; } throw error; }
    if (/superseded/i.test(text.split('\n').slice(0, 20).join('\n'))) checked.push(`${analysis}: marked superseded`);
    else issues.push(`${analysis}: not marked superseded`);
  }
  return { issues, checked, absentAnalyses };
}

export type Plan2GateArtifact = VerificationReport & { readonly evidence: { readonly identity: Identity } };

/** Accept the complete amended Plan 2 gate for the same inputs, not its counters alone. */
export function assertPlan2Regression(report: Plan2GateArtifact, identity: Identity): void {
  assert.ok(sameInputs(report.evidence.identity, identity), 'Plan 2 evidence is for different source, build or runtime inputs');
  assert.deepEqual([report.schemaVersion, report.plan, report.mode, report.iteration], [1, 2, 'plan-verification', null], 'An unfiltered Plan 2 gate is required');
  assert.deepEqual(report.inventoryIssues, []);
  const superseded = report.instances.filter(item => item.status === 'superseded');
  assert.deepEqual(superseded.map(item => item.id).sort(), plan2Instances.filter(item => item.superseded).map(item => item.id).sort(),
    'Exactly the ten recorded Plan 2 records are superseded');
  assert.ok(superseded.every(item => /^I5-\d{2}:/.test(item.supersededBy ?? '')), 'Every superseded record names its I5 counterpart');
  const retained = plan2Instances.filter(item => !item.superseded).map(item => item.id);
  assert.equal(retained.length, 166);
  const failed = report.instances.filter(item => item.required && item.status !== 'passed').map(item => `${item.id} ${item.status}${item.reason ? ` (${item.reason})` : ''}`);
  assert.deepEqual(failed, [], 'Every required Plan 2 instance passed');
  for (const id of retained) {
    const item = report.instances.find(candidate => candidate.id === id);
    assert.ok(item?.required && item.status === 'passed' && item.assertions.length > 0, `${id}: no passing execution`);
  }
  assert.deepEqual([report.passed, report.summary.failed, report.summary.notExecuted], [true, 0, 0], 'The amended Plan 2 gate passed');
}

/** Inspect the newest unfiltered Plan 2 report for these inputs. A newer failure blocks an older pass. */
export async function readPlan2Regression(directory: string, identity: Identity) {
  let names: string[];
  try { names = (await readdir(directory)).filter(name => /^plan2-full-[\w-]+\.json$/.test(name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') names = []; else throw error; }
  const files = await Promise.all(names.map(async name => ({ name, ...(await stat(join(directory, name))) })));
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  for (const file of files) {
    assert.ok(file.size <= 32 * 1024 ** 2, `Plan 2 evidence exceeds the archive bound: ${file.name}`);
    const raw = await readFile(join(directory, file.name));
    const report = JSON.parse(raw.toString('utf8')) as Plan2GateArtifact;
    if (!report.evidence?.identity || !sameInputs(report.evidence.identity, identity)) continue;
    assertPlan2Regression(report, identity);
    return { file: file.name, sha256: createHash('sha256').update(raw).digest('hex'), summary: report.summary,
      superseded: report.instances.filter(item => item.status === 'superseded').length };
  }
  throw new Error('No unfiltered Plan 2 gate for the current source/build/runtime. Run npm run reference:verify -- --plan 2 first.');
}

async function tracedImport(consumer: string, specifier: string, environment: NodeJS.ProcessEnv, traceFile: string) {
  const before = (await readTrace(traceFile)).length;
  const result = await command(consumer, process.execPath, ['--input-type=module', '--eval',
    `const values = await import(${JSON.stringify(specifier)}); console.log(JSON.stringify(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value]))));`],
  30_000, environment);
  return { result, events: (await readTrace(traceFile)).slice(before) };
}

async function packedEntries(context: ProjectContext): Promise<void> {
  const { assertions } = context;
  await prepareRelocatedPackage(context, completionEntries);
  const consumer = await realpath(join(context.runDirectory, 'consumer'));
  const installed = await realpath(join(consumer, 'node_modules/ramify.ts'));
  const expected = reviewedPackage(
    await readFile(join(context.root, 'docs/plans/done/iteration-1-project-verifier/contracts.md'), 'utf8'),
    await readFile(join(context.root, 'docs/plans/done/iteration-2-resident-verification/contracts.md'), 'utf8'));
  assertions.equal('all eight reviewed packed entries resolve with their import and type conditions', await validatePackageEntries(installed, expected), 8);
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')) as { bin: unknown; exports: Record<string, unknown> };
  const packedKeys = Object.keys(manifest.exports);
  assertions.equal('the reviewed entry map is still Plan 2\'s eight entries',
    packedKeys.filter(key => reviewedEntryMap.includes(key)), reviewedEntryMap);
  assertions.equal('the only other packed entries are the recorded additions',
    packedKeys.filter(key => !reviewedEntryMap.includes(key)), [...recordedEntryAdditions, ...recordedStylesheetAdditions]);
  // A stylesheet entry is a string target: the packed manifest names one file,
  // which is resolved and read, never imported.
  assertions.equal('every recorded stylesheet addition is a string file target',
    recordedStylesheetAdditions.map(key => typeof manifest.exports[key]), recordedStylesheetAdditions.map(() => 'string'));
  assertions.equal('bin.ramify is the reviewed launcher', manifest.bin, { ramify: 'dist/src/ramify' });
  const preload = await realpath(join(context.root, 'src/tests/process-probe.mjs'));
  await withSequenceProcess(async processes => {
    const analysis = await tracedImport(consumer, 'ramify.ts/analysis', processes.environment, processes.traceFile);
    assertions.equal('analysis entry imported cleanly', [analysis.result.code, analysis.result.signal, analysis.result.error, analysis.result.stderr], [0, null, null, '']);
    const exported = object(JSON.parse(analysis.result.stdout));
    assertions.equal('./analysis exposes openRetainedSession', exported.openRetainedSession, 'function');
    assertions.equal('./analysis no longer exposes analyzeIncrement', 'analyzeIncrement' in exported, false);
    const client = await tracedImport(consumer, 'ramify.ts/client', processes.environment, processes.traceFile);
    assertions.equal('client entry imported cleanly', [client.result.code, client.result.signal, client.result.error, client.result.stderr], [0, null, null, '']);
    const clientClosure = assertClientClosure(client.events, installed, preload, consumer, assertions);
    const cli = await tracedImport(consumer, 'ramify.ts/cli', processes.environment, processes.traceFile);
    assertions.equal('cli entry imported cleanly', [cli.result.code, cli.result.signal, cli.result.error, cli.result.stderr], [0, null, null, '']);
    const cliFiles = cli.events.filter(event => event.event === 'load' && event.url?.startsWith('file:')).map(event => fileURLToPath(event.url!));
    assertions.ok('the cli import loaded the installed CLI entry', cliFiles.some(path => relative(installed, path) === 'dist/subs/cli/src/index.js'));
    for (const [label, files] of [['cli', cliFiles], ['client', clientClosure.map(path => join(installed, 'dist', path))]] as const) {
      assertions.equal(`${label} closure loads no session, worker or compiler module`,
        files.map(path => relative(installed, path)).filter(path => sessionModulePattern.test(path)), []);
    }
    assertions.equal('entry imports start or contact no process or socket',
      cli.events.filter(event => ['spawn', 'other-launch', 'connect', 'listen', 'bind'].includes(event.event)), []);
    recordObservation('plan5-packed-entries', { analysis: exported, clientClosure,
      cliClosure: cliFiles.map(path => relative(installed, path)) });
  }, { executable: join(installed, 'dist/src/cli-entry.js'), bin: join(consumer, 'node_modules/.bin/ramify'), cwd: consumer, preload,
    environment: relocationEnvironment(context.runDirectory) });
}

export const plan5CompletionHandlers: ReadonlyMap<string, InstanceHandler> = new Map<string, InstanceHandler>([
  ['I5-14:self-check-fifteen', { kind: 'memory', run: async ({ assertions }) => {
    // The resident check of a toolkit copy, under a harness-owned endpoint the
    // sequence process stops and removes; every owned file must be catalogued.
    const result = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: 'I5-14:self-check-fifteen',
      fixture: { kind: 'copy', sourceRoot: repositoryRoot } }, async ({ root }) => {
      await symlink(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'));
      await toolkit(root, assertions, false);
    });
    if (!result.ok) throw result.error;
  } }],
  ['I5-14:declarations-final', { kind: 'memory', run: async ({ assertions }) => {
    const result = await command(repositoryRoot, process.execPath, ['--import', 'tsx', 'scripts/validate-final-contracts.ts']);
    recordObservation('plan5-final-contracts-process', result);
    assertions.equal('strict final-contract process accepts owners.md and the package', [result.code, result.signal, result.error], [0, null, null]);
    const value = object(JSON.parse(result.stdout));
    // The eleven archived declarations and the four owners Plan 6 added as a
    // named layer, beside the eight reviewed package entries.
    assertions.equal('fifteen layered declarations and eight reviewed package entries validated', [value.owners, value.packageEntries], [15, 8]);
    assertions.ok('real exposures were linked', Number(value.expandedStatements) > 0);
    const validator = await readFile(join(repositoryRoot, 'scripts/validate-final-contracts.ts'), 'utf8');
    assertions.ok('the validator reads Plan 5 owners.md as its third reviewed layer',
      validator.includes("'docs/plans/iteration-5-fast-incremental-checks/owners.md'"));
    for (const [file, line] of addedDeclarationLines) {
      const text = await readFile(join(repositoryRoot, file), 'utf8');
      assertions.ok(`${file}: ${line}`, text.split('\n').some(candidate => candidate.trim() === line));
    }
    const analysis = await readFile(join(repositoryRoot, 'subs/analysis/module.ramify'), 'utf8');
    assertions.equal('the increment exposure line is removed', /analyzeIncrement|increment\.ts/.test(analysis), false);
  } }],
  ['I5-14:package-entries-unchanged', {
    kind: 'project', fixture: { kind: 'copy', sourceRoot: repositoryRoot }, workRoot: join(tmpdir(), 'ramify-plan5-completion-work'),
    baseline: ({ root, assertions }: ProjectContext) => {
      assertions.ok('external toolkit copy is distinct from the checkout', !root.startsWith(repositoryRoot + '/'));
    },
    mutate: async () => {}, run: packedEntries,
  }],
  ['I5-14:plan1-regression', { kind: 'memory', run: async ({ assertions }) => {
    const receipt = await verifyPlan1Regression();
    assertions.equal('same-input Plan 1 gate passed every required instance', receipt.summary, { required: 308, passed: 308, failed: 0, notExecuted: 0 });
  } }],
  ['I5-14:plan2-regression', { kind: 'memory', run: async ({ assertions }) => {
    const identity = await executionIdentity();
    const receipt = await readPlan2Regression(join(repositoryRoot, '.reference-work/reports'), identity);
    recordObservation('plan2-regression-receipt', receipt);
    assertions.equal('same-input amended Plan 2 gate passed with ten superseded records', receipt.superseded, 10);
  } }],
  ['I5-14:documents-revised', { kind: 'memory', run: async ({ assertions }) => {
    const { issues, checked, absentAnalyses } = await documentRevisionIssues(repositoryRoot);
    recordObservation('plan5-documents-revised', { checked, absentAnalyses });
    assertions.equal('the architecture documents state the implemented session', issues, []);
    assertions.equal('every required statement was checked', checked.length, documentChecks.length + supersededAnalyses.length - absentAnalyses.length);
  } }],
]);
