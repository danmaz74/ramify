import { readFile, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import type { TraceEvent } from '../../src/tests/process.js';
import { reviewedPackage, validatePackageEntries } from '../validate-final-contracts.js';
import { assertEquivalentReports } from './equivalence-comparison.js';
import { verifyPlan1Regression } from './completion-regression.js';
import { object, readTrace, withSequenceProcess } from './equivalence-process.js';
import { put } from './fixtures/plan1/project.js';
import { runIsolatedProject } from './mutation.js';
import { analysisEvidence, recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import { command } from './processes.js';
import { prepareRelocatedPackage, relocationEnvironment } from './relocation.js';
import { assertToolkit } from './self-cases.js';
import { completed } from './session-expectations.js';
import { Assertions } from './runner.js';
import type { InstanceHandler, ProjectContext } from './runner.js';

// Independent Plan 2 literal, also required by the revised Plan 1 relocation.
export const completionEntries = {
  'ramify.ts': 'createAnalysisSession', 'ramify.ts/analysis': 'analyzeProject',
  'ramify.ts/analysis/inventory': 'acquireInventory', 'ramify.ts/model': 'createDefaultTagRegistry',
  'ramify.ts/layout': 'placeNodes', 'ramify.ts/presentation': 'ModelDiagram',
  'ramify.ts/cli': 'runCli', 'ramify.ts/client': 'connectDaemon',
} as const;
const probe = 'subs/daemon/subs/contexts/src/__i2_probe.ts';

export function assertClientClosure(events: readonly TraceEvent[], installed: string, preload: string,
  consumer: string, assertions: Assertions): string[] {
  const loads = events.filter(event => event.event === 'load');
  assertions.equal('client has no unaccounted module schemes', loads.filter(event =>
    !event.url?.startsWith('file:') && !event.url?.startsWith('node:')), []);
  const files = loads.filter(event => event.url?.startsWith('file:')).map(event => fileURLToPath(event.url!))
    .filter(path => path !== preload && path !== join(consumer, '[eval1]'));
  const closure = files.map(path => relative(join(installed, 'dist'), path));
  const allowed = ['client-entry', 'connect-daemon', 'connection', 'launcher', 'discovery', 'codec', 'records', 'start-coordination']
    .map(name => `subs/daemon/src/${name}.js`);
  assertions.equal('client loads only its reviewed closure', closure.filter(path => !allowed.includes(path)), []);
  assertions.ok('the real client entry and connector are loaded', ['client-entry', 'connect-daemon']
    .every(name => closure.includes(`subs/daemon/src/${name}.js`)));
  assertions.equal('import alone starts or contacts no process or socket',
    events.filter(event => ['spawn', 'other-launch', 'connect', 'listen', 'bind'].includes(event.event)), []);
  return closure;
}

export function assertContextsDenial(report: AnalysisReport, assertions: Assertions): void {
  completed(report, assertions, 'complete', 'failed');
  assertions.equal('contexts has exactly the independently expected dispatch denial', report.diagnostics.map(issue => ({
    code: issue.code, file: issue.location?.file, line: issue.location?.line, original: issue.original, importer: issue.importer,
  })), [{ code: 'required-importer-tag', file: probe, line: 1,
    original: { kind: 'code', owner: 'ramify', file: 'interfaces/service.ts', binding: 'RamifyService' },
    importer: { owner: 'ramify/daemon/contexts', kind: 'ordinary', root: 'subs/daemon/subs/contexts/src', profile: [] },
  }]);
  const denied = report.snapshot!.results.flatMap(item => item.decisions).filter(item => item.status === 'denied');
  assertions.equal('R6 visibility established before tag rejection', denied.map(item => [item.reason, item.visibility?.visible]),
    [['required-importer-tag', true]]);
  assertions.equal('the negative is an explicit type import', denied[0].question.selection?.request, 'type-only');
  assertions.ok('the missing importer requirement is dispatch', denied[0].requirements.some(item => item.tag === 'dispatch' && !item.satisfied));
  assertions.ok('root descendant exposure is retained in the decision', denied[0].visibility!.paths.some(path => path.some(hop =>
    hop.module === 'ramify' && hop.destination === 'descendants' && hop.evidence.some(location => location.file === 'module.ramify'))));
  recordObservation('contexts-negative', analysisEvidence(report));
}

async function toolkit(root: string, assertions: Assertions, negative: boolean): Promise<void> {
  await withSequenceProcess(async processes => {
    if (!negative) {
      const report = await processes.check(root, false);
      await assertToolkit(report, root, assertions);
      return;
    }
    // Keep the baseline and mutated fixture compiler-valid. A missing service
    // export must fail here, never become a successful importability negative.
    const baseline = await processes.check(root, true);
    const baselineAssertions = new Assertions();
    try { await assertToolkit(baseline, root, baselineAssertions); }
    finally { for (const item of baselineAssertions.finish()) assertions.ok(`baseline: ${item.name}`, item.status === 'passed'); }
    await put(root, probe, "import type { RamifyService } from '../../../../../src/interfaces/service.js'; export type Probe = RamifyService;\n");
    const compiler = await command(root, process.execPath,
      [join(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--noEmit', '--project', join(root, 'tsconfig.json')]);
    recordObservation('contexts-probe-compiler', compiler);
    assertions.equal('the real RamifyService import remains valid TypeScript',
      [compiler.code, compiler.signal, compiler.error, compiler.stderr], [0, null, null, '']);
    const batch = await processes.check(root, true);
    const local = new Assertions();
    try { assertContextsDenial(batch, local); }
    finally { for (const item of local.finish()) assertions.ok(`batch: ${item.name}`, item.status === 'passed'); }
    const resident = await processes.check(root, false);
    assertContextsDenial(resident, assertions);
    assertEquivalentReports(batch, resident);
    assertions.ok('resident and batch produce the same located negative', true);
  });
}

async function packed(context: ProjectContext, resident: boolean): Promise<void> {
  await prepareRelocatedPackage(context, completionEntries);
  const consumer = await realpath(join(context.runDirectory, 'consumer'));
  const installed = await realpath(join(consumer, 'node_modules/ramify.ts'));
  const expected = reviewedPackage(
    await readFile(join(context.root, 'docs/plans/done/iteration-1-project-verifier/contracts.md'), 'utf8'),
    await readFile(join(context.root, 'docs/plans/iteration-2-resident-verification/contracts.md'), 'utf8'));
  context.assertions.equal('all packed import and type conditions expose their required bindings', await validatePackageEntries(installed, expected), 8);
  const preload = await realpath(join(context.root, 'src/tests/process-probe.mjs'));
  await withSequenceProcess(async processes => {
    const imports = await command(consumer, process.execPath, ['--input-type=module', '--eval',
      "const client = await import('ramify.ts/client'); console.log(JSON.stringify(Object.keys(client)));"], 30_000, processes.environment);
    context.assertions.equal('client imported in its own empty process', [imports.code, imports.signal, imports.error, imports.stderr], [0, null, null, '']);
    const events = await readTrace(processes.traceFile);
    const closure = assertClientClosure(events, installed, preload, consumer, context.assertions);
    recordObservation('packed-client-closure', { closure, exports: JSON.parse(imports.stdout) });
    if (resident) {
      const root = join(context.root, 'examples/collection-review');
      const before = await processes.status();
      context.assertions.equal('relocated endpoint initially has no daemon', [before.running, before.record], [false, null]);
      const batch = await processes.check(root, true), checked = await processes.check(root, false);
      assertEquivalentReports(batch, checked);
      context.assertions.equal('relocated resident reference completes cleanly',
        [checked.outcome.execution, checked.outcome.check, checked.summary.owners, checked.summary.denied, checked.coverage],
        ['completed', 'passed', 15, 0, []]);
      const status = await processes.status(), daemon = object(status.status);
      context.assertions.equal('relocated check started its own daemon', status.running, true);
      const trace = await readTrace(processes.traceFile);
      context.assertions.ok('daemon uses the unpacked installation entry', trace.some(event => event.pid === daemon.pid
        && event.event === 'load' && event.url?.startsWith('file:')
        && fileURLToPath(event.url) === join(installed, 'dist/src/daemon-entry.js')));
      context.assertions.ok('relocated daemon listens on its isolated socket', trace.some(event => event.pid === daemon.pid
        && event.event === 'listen' && event.path?.startsWith(processes.endpoint + '/')));
    }
  }, { executable: join(consumer, 'node_modules/.bin/ramify'), cwd: consumer, preload,
    environment: relocationEnvironment(context.runDirectory) });
}

export const completionHandlers: ReadonlyMap<string, InstanceHandler> = new Map<string, InstanceHandler>([
  ['I2-30:plan1-regression', { kind: 'memory', run: async ({ assertions }) => {
    const receipt = await verifyPlan1Regression();
    assertions.equal('same-input Plan 1 process gate passed every required instance', receipt.summary,
      { required: 308, passed: 308, failed: 0, notExecuted: 0 });
    assertions.equal('all unaffected Plan 1 definitions preserved', receipt.unchangedRecords, 305);
  } }],
  ...(['self-check-eleven', 'self-negative-contexts'] as const).map(name => [`I2-30:${name}`, {
    kind: 'memory' as const, run: async ({ assertions }: { assertions: Assertions }) => {
      const result = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: `I2-30:${name}`,
        fixture: { kind: 'copy', sourceRoot: repositoryRoot } }, async ({ root }) => {
        await symlink(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'));
        await toolkit(root, assertions, name === 'self-negative-contexts');
      });
      if (!result.ok) throw result.error;
    },
  }] as const),
  ['I2-30:declarations-final', { kind: 'memory', run: async ({ assertions }) => {
    const result = await command(repositoryRoot, process.execPath, ['--import', 'tsx', 'scripts/validate-final-contracts.ts']);
    recordObservation('final-contracts-process', result);
    assertions.equal('strict final-contract process accepts the real package', [result.code, result.signal, result.error], [0, null, null]);
    const value = object(JSON.parse(result.stdout));
    assertions.equal('eleven declarations and eight package entries validated', [value.owners, value.packageEntries], [11, 8]);
    assertions.ok('real exposures were linked', Number(value.expandedStatements) > 0);
  } }],
  ...(['package-entries', 'relocated-resident'] as const).map(name => [`I2-30:${name}`, {
    kind: 'project' as const, fixture: { kind: 'copy' as const, sourceRoot: repositoryRoot },
    workRoot: join(tmpdir(), 'ramify-completion-work'),
    baseline: ({ root, assertions }: ProjectContext) => {
      assertions.ok('external toolkit copy is distinct from the checkout', !root.startsWith(repositoryRoot + '/'));
    },
    mutate: async () => {}, run: (context: ProjectContext) => packed(context, name === 'relocated-resident'),
  }] as const),
]);
