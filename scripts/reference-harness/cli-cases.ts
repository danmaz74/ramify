import { cp, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBatch } from '../../src/batch.js';
import type { BatchOperation } from '../../src/interfaces/batch.js';
import { runCli } from '../../subs/cli/src/index.js';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { cliProcess, compiledEntry } from '../../src/tests/process.js';
import type { TraceEvent } from '../../src/tests/process.js';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { replaceExactlyOnce } from './mutation.js';
import { repositoryRoot } from './plan.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';
import { clean, sessionReport } from './session-expectations.js';
import { compilerValid } from './static-expectations.js';
import { analysisEvidence, recordObservation } from './observations.js';

const referenceRoot = join(repositoryRoot, 'examples/collection-review');
const handlers = new Map<string, InstanceHandler>();
type Handler = Extract<InstanceHandler, { kind: 'project' }>;
const unchanged = async (): Promise<void> => {};
function add(id: string, fixture: 'R' | 'F', mutate: Handler['mutate'], run: Handler['run']): void {
  handlers.set(id, { kind: 'project', fixture: fixture === 'R' ? { kind: 'copy', sourceRoot: referenceRoot }
    : { kind: 'create', create: createProjectFixture },
  prepare: fixture === 'R' ? ({ root }) => symlink(join(referenceRoot, 'node_modules'), join(root, 'node_modules')) : undefined,
  baseline: async ({ root, assertions }) => {
    await compilerValid(root, assertions);
    const report = await sessionReport(root);
    clean(report, assertions);
    assertions.equal('baseline owner count', report.summary.owners, fixture === 'R' ? 15 : 3);
  }, mutate, run });
}
async function direct(root: string, format: 'human' | 'json', batch: BatchOperation = runBatch) {
  const stdout: string[] = [], stderr: string[] = [];
  const code = await runCli(['check', '--batch', '--root', root, ...(format === 'json' ? ['--format', 'json'] : [])], {
    cwd: root, version: 'test', connect: async () => { throw new Error('Unexpected daemon connection'); }, stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); }, batch,
  });
  return { code, stdout: stdout.join(''), stderr: stderr.join(''), writes: stdout.length };
}
function semantic(report: AnalysisReport): unknown {
  const { runId: _runId, ...data } = report;
  return data;
}
function processResult(context: ProjectContext, result: Awaited<ReturnType<typeof cliProcess>>, exit: number): void {
  recordObservation('compiled-cli', { code: result.code, signal: result.signal, stderr: result.stderr, durationMs: result.durationMs });
  if (result.stdout.startsWith('{')) {
    const report = JSON.parse(result.stdout);
    recordObservation('compiled-report', report.schemaVersion === 'ramify.analysis/1' ? analysisEvidence(report) : report);
  }
  context.assertions.equal('actual subprocess exit and streams', [result.code, result.signal, result.stderr], [exit, null, '']);
  context.assertions.ok('finite subprocess completion', result.durationMs < 30_000);
}
function released(assertions: Assertions, events: readonly TraceEvent[], pid: number | undefined, survivingChildren: readonly number[]): void {
  const final = events.find(event => event.pid === pid && event.event === 'exit');
  assertions.ok('CLI exit is actually observed', final);
  assertions.equal('all captured file handles and signal listeners released', [final?.handles, final?.opened, final?.signalListeners], [0, final?.closed, 0]);
  assertions.equal('all observed child processes terminated', survivingChildren, []);
}
function humanEvidence(context: ProjectContext, text: string, report: AnalysisReport): void {
  const a = context.assertions;
  a.ok('human effective root and selection', text.includes(`Root: ${context.root} (given)`));
  a.ok('human compiler configuration', text.includes(`Configuration: ${context.root}/tsconfig.json`));
  a.ok('human outcomes from the same report', text.includes(`Execution: ${report.outcome.execution}; check: ${report.outcome.check}; coverage: ${report.outcome.coverage}`));
  for (const [index, issue] of report.diagnostics.entries()) a.ok(`human diagnostic ${index + 1} code, message and location`, text.includes(`[${issue.code}]`)
    && text.includes(issue.message) && (!issue.location || text.includes(`${issue.location.file}:${issue.location.line}:${issue.location.column}`)));
  for (const [index, warning] of report.warnings.entries()) a.ok(`human warning ${index + 1} and count`, text.includes(`Warning [${warning.code}] ${warning.entry}: ${warning.count} compiler-selected`));
  for (const [index, limit] of report.coverage.entries()) a.ok(`human analysis limit ${index + 1}`, text.includes(`[${limit.code}]`) && text.includes(limit.message));
  a.ok('human completed scope matches API counts', text.includes(`${report.summary.complete ? 'Completed' : 'Incomplete'} scope: ${report.summary.owners} owners, ${report.summary.sourceFiles} source files, ${report.summary.resources} resources, ${report.summary.accesses} accesses`));
}

add('I1-26:human-json', 'R', unchanged, async context => {
  const report = await sessionReport(context.root);
  const human = await cliProcess(context.root, ['check', '--batch', '--root', context.root]);
  processResult(context, human, 0);
  humanEvidence(context, human.stdout, report);
  const json = await cliProcess(context.root, ['check', '--batch', '--root', context.root, '--format', 'json']);
  context.assertions.equal('JSON subprocess exit and stderr', [json.code, json.stderr], [0, '']);
  context.assertions.equal('compiled CLI and direct API preserve identical semantic report', semantic(JSON.parse(json.stdout)), semantic(report));
  const injected = await direct(context.root, 'json');
  context.assertions.equal('real injected CLI stream and exit contract', [injected.code, injected.stderr, injected.writes], [0, '', 1]);
  context.assertions.equal('injected CLI preserves identical semantic report', semantic(JSON.parse(injected.stdout)), semantic(report));
});
add('I1-26:missing-stage', 'F', unchanged, async context => {
  const result = await direct(context.root, 'json', async (invocation, control) => {
    const baseline = await runBatch(invocation, control);
    if (baseline.status !== 'reported') throw new Error('Expected reported baseline');
    context.assertions.equal('unmodified batch report passed', baseline.exitCode, 0);
    return { ...baseline, report: { ...baseline.report, stages: baseline.report.stages.map(stage => stage.stage === 'access' ? { ...stage, status: 'not-requested' } : stage) } };
  });
  const report = JSON.parse(result.stdout) as AnalysisReport;
  context.assertions.equal('unrun stage cannot pass even with empty source diagnostics', [result.code, report.outcome.execution, report.outcome.check, report.summary.complete], [2, 'incomplete', 'not-run', false]);
  context.assertions.ok('missing stage explicitly explained', report.diagnostics.some(issue => issue.code === 'missing-stage' && issue.message.includes('access')));
  context.assertions.equal('unrun access retained in stage evidence', report.stages.find(stage => stage.stage === 'access')?.status, 'not-requested');
});
add('I1-26:failed-resolver', 'F', unchanged, async context => {
  const result = await cliProcess(context.root, ['check', '--batch', '--root', context.root, '--format', 'json'], { mode: 'fail-catalog',
    entry: join(repositoryRoot, 'scripts/reference-harness/cli-direct-worker.ts'), nodeArgs: ['--import', import.meta.resolve('tsx')] });
  processResult(context, result, 2);
  const report = JSON.parse(result.stdout) as AnalysisReport;
  context.assertions.equal('real resolver fault reached once', result.events.filter(event => event.event === 'resolver-fault').length, 1);
  context.assertions.equal('failed resolver is incomplete and not checked', [report.outcome.execution, report.outcome.check, report.summary.complete], ['incomplete', 'not-run', false]);
  context.assertions.ok('resolver error preserved', report.diagnostics.some(issue => issue.message.includes('Injected compiler catalog failure')));
  context.assertions.equal('catalog failure blocks dependent work', report.stages.filter(stage => ['catalog', 'link', 'access', 'decide'].includes(stage.stage)).map(stage => [stage.stage, stage.status]),
    [['catalog', 'failed'], ['link', 'blocked'], ['access', 'blocked'], ['decide', 'blocked']]);
  released(context.assertions, result.events, result.pid, result.survivingChildren);
});
add('I1-26:browser-verifier-request/api', 'F', unchanged, async context => {
  const result = await runBatch({ cwd: context.root, root: context.root, capabilities: ['browser-verification'] });
  context.assertions.equal('browser verifier explicitly unavailable', [result.status, result.exitCode], ['reported', 2]);
  if (result.status !== 'reported') throw new Error('Expected unavailable report');
  context.assertions.equal('verifier capability was requested but never executed', result.report.capabilities.find(item => item.capability === 'browser-verification'),
    { capability: 'browser-verification', available: false, requested: true, executed: false });
  context.assertions.ok('unavailable capability diagnostic', result.report.diagnostics.some(issue => issue.code === 'unavailable-capability'));
  const control = await runBatch({ cwd: context.root, root: context.root, capabilities: ['tags-origin'] });
  context.assertions.equal('ordinary tag matching remains available', control.exitCode, 0);
});
add('I1-26:browser-verifier-request/cli', 'F', unchanged, async context => {
  const result = await cliProcess(context.root, ['verify-browser', '--root', context.root, '--format', 'json']);
  processResult(context, result, 2);
  context.assertions.ok('CLI explicitly rejects unsupported verifier command', JSON.parse(result.stdout).diagnostics.some((item: { code: string; message: string }) =>
    item.code === 'invalid-invocation' && item.message.includes('Unavailable command: verify-browser')));
  context.assertions.equal('unsupported invocation does not dispatch analysis', result.events.filter(event => event.event === 'spawn').length, 0);
});
for (const variant of ['help', 'version']) handlers.set(`I1-26:help-version/${variant}`, { kind: 'memory', run: async ({ assertions }) => {
  const result = await cliProcess(repositoryRoot, [`--${variant}`]);
  assertions.equal('actual process exit and stderr', [result.code, result.signal, result.stderr], [0, null, '']);
  const version = (JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as { version: string }).version;
  assertions.ok('actual usage or package version output', variant === 'version' ? result.stdout === `${version}\n` : result.stdout.startsWith('Usage: ramify check'));
  const loaded = result.events.flatMap(event => [event.url ?? '', ...event.commonjs ?? []]);
  assertions.ok('trace observed actual CLI handling code', loaded.some(url => url.endsWith('/dist/subs/cli/src/run-cli.js')));
  assertions.equal('no engine/compiler/UI/server module loaded', loaded.filter(url => /\/(?:typescript|react|react-dom|express|@modelcontextprotocol|d3-[^/]+)\//.test(url)
    || /\/dist\/(?:subs\/analysis\/|src\/batch\.js)/.test(url)), []);
  assertions.equal('no process or listener started', result.events.filter(event => ['spawn', 'other-launch', 'listen', 'bind'].includes(event.event)), []);
  released(assertions, result.events, result.pid, result.survivingChildren);
} });

for (const kind of ['clean', 'denied', 'invalid'] as const) for (const format of ['human', 'json'] as const) {
  add(`I1-28:compiled-cli-${kind}/${format}`, 'R', kind === 'clean' ? unchanged : ({ root }) => kind === 'denied'
    ? replaceExactlyOnce(join(root, 'subs/workspace/module.ramify'), 'expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog to parent',
      'expose-sub createCatalogTools, inspectRecord from catalog to parent')
    : replaceExactlyOnce(join(root, 'subs/workspace/subs/contracts/module.ramify'), 'from "interfaces/vocabulary.ts"', 'from "interfaces/missing.ts"'), async context => {
    if (kind === 'denied') await compilerValid(context.root, context.assertions);
    const expected = await sessionReport(context.root);
    const result = await cliProcess(context.root, ['check', '--batch', '--root', context.root, ...(format === 'json' ? ['--format', 'json'] : [])], { executable: compiledEntry });
    processResult(context, result, kind === 'clean' ? 0 : 1);
    if (format === 'json') context.assertions.equal('versioned JSON matches real API semantics', semantic(JSON.parse(result.stdout)), semantic(expected));
    else humanEvidence(context, result.stdout, expected);
    if (kind === 'clean') {
      context.assertions.equal('completed unchanged reference', [expected.outcome.check, expected.summary.owners, expected.diagnostics.length, expected.coverage.length], ['passed', 15, 0, 0]);
      context.assertions.equal('both reference configuration warnings remain visible', expected.warnings.map(warning => [warning.entry, warning.count]), [['vite.config.ts', 1], ['vitest.config.ts', 1]]);
    } else if (kind === 'denied') {
      context.assertions.equal('one independently expected located original denial', expected.diagnostics.map(issue => [issue.code, issue.location?.file, issue.original, issue.importer?.owner, issue.importer?.kind]),
        [['not-visible', 'src/assembly.ts', { kind: 'code', owner: 'collection-review/workspace/catalog', file: 'router.ts', binding: 'createCatalogRouter' }, 'collection-review', 'ordinary']]);
      context.assertions.ok('denial keeps a useful line and declaration evidence', expected.diagnostics[0].location!.line > 0 && expected.diagnostics[0].related.length > 0);
    } else {
      context.assertions.equal('missing C1 path invalidates the declaration', expected.outcome.execution, 'invalid');
      context.assertions.ok('missing path has located contract failure', expected.diagnostics.some(issue => issue.code === 'missing-file' && issue.location?.file === 'subs/workspace/subs/contracts/module.ramify'));
      context.assertions.equal('invalid declaration prevents source decisions', expected.stages.find(stage => stage.stage === 'decide')?.status, 'blocked');
    }
  });
}
for (const variant of ['no-config', 'references', 'command', 'format']) add(`I1-28:compiled-cli-unavailable/${variant}`, 'F', async ({ root }) => {
  if (variant === 'no-config') await rm(join(root, 'tsconfig.json'));
  if (variant === 'references') {
    await put(root, 'tsconfig.json', '{"files":[],"references":[{"path":"./tsconfig.child.json"}]}');
    await put(root, 'tsconfig.child.json', '{"compilerOptions":{"composite":true},"include":["src"]}');
  }
}, async context => {
  let isolated: string | undefined;
  try {
    let root = context.root;
    if (variant === 'no-config') {
      isolated = await mkdtemp(join(tmpdir(), 'ramify-cli-no-config-'));
      root = join(isolated, 'project'); await cp(context.root, root, { recursive: true });
    }
    const result = await cliProcess(root, [variant === 'command' ? 'inspect' : 'check', '--batch', '--root', root,
      '--format', variant === 'format' ? 'xml' : 'json']);
    context.assertions.equal('actual unavailable exit', [result.code, result.signal], [2, null]);
    if (variant === 'format') context.assertions.ok('invalid format clearly reported', result.stderr.includes('Unsupported format: xml'));
    else {
      const report = JSON.parse(result.stdout);
      const code = variant === 'no-config' ? 'configuration-not-found' : variant === 'references' ? 'references-only-configuration' : 'invalid-invocation';
      context.assertions.ok('unavailable cause retained', report.diagnostics.some((item: { code: string }) => item.code === code));
      if (variant === 'references') context.assertions.ok('referenced configuration identified', report.diagnostics.some((item: { message: string }) => item.message.includes('tsconfig.child.json')));
    }
    released(context.assertions, result.events, result.pid, result.survivingChildren);
  } finally { if (isolated) await rm(isolated, { recursive: true, force: true }); }
});

for (const stray of [false, true]) for (const format of ['human', 'json'] as const) add(`I1-28:compiled-cli-${stray ? 'stray-description' : 'warnings'}/${format}`, 'F', async ({ root }) => {
  const config = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
  config.include.push('tests'); await put(root, 'tsconfig.json', JSON.stringify(config));
  await put(root, 'tests/helper.ts', 'export const helper = 1;\n');
  if (stray) await put(root, 'tests/module.ramify', 'ramify 1\nmodule stray\n');
}, async context => {
  const expected = await sessionReport(context.root);
  const result = await cliProcess(context.root, ['check', '--batch', '--root', context.root, ...(format === 'json' ? ['--format', 'json'] : [])]);
  processResult(context, result, stray ? 1 : 0);
  if (format === 'json') context.assertions.equal('structured output matches API warning/layout evidence', semantic(JSON.parse(result.stdout)), semantic(expected));
  else humanEvidence(context, result.stdout, expected);
  context.assertions.equal('selected loose file warning aggregated independently', expected.warnings, [{ code: 'outside-module-source', entry: 'tests', count: 1, files: ['tests/helper.ts'] }]);
  context.assertions.ok('loose file is never classified as owned testing source', !expected.snapshot?.inventory.files.some(file => file.path === 'tests/helper.ts')
    && !expected.snapshot?.areas.some(area => area.root === 'tests'));
  if (stray) context.assertions.ok('valid stray marker is still a located layout error', expected.diagnostics.some(issue => issue.category === 'layout' && issue.code === 'stray-description' && issue.location?.file === 'tests/module.ramify'));
  else context.assertions.equal('warning does not create a layout failure', expected.diagnostics, []);
});
add('I1-28:no-servers', 'R', unchanged, async context => {
  const result = await cliProcess(context.root, ['check', '--batch', '--root', context.root, '--format', 'json']);
  processResult(context, result, 0);
  context.assertions.equal('no socket listen/bind or alternate process launcher', result.events.filter(event => ['listen', 'bind', 'other-launch'].includes(event.event)), []);
  const children = result.events.filter(event => event.event === 'spawn');
  context.assertions.ok('trace observes actual finite compiler integration', children.length >= 2);
  for (const [index, child] of children.entries()) {
    context.assertions.ok(`child ${index + 1} belongs to the reviewed compiler integration`, /configuration-helper\.js|compiler-helper\.js|\/@typescript\/typescript-(?:linux|darwin)-[^/]+\/lib\/tsc --api /.test([child.command, ...child.args ?? []].join(' ')));
  }
  context.assertions.equal('all observed compiler helper and native child PIDs are gone', result.survivingChildren, []);
  released(context.assertions, result.events, result.pid, result.survivingChildren);
});
export const cliHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
