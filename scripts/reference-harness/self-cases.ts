import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { put } from './fixtures/plan1/project.js';
import { analysisEvidence, recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import { command } from './processes.js';
import { filesBelow } from './reference-baseline.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';
import { completed, sessionReport } from './session-expectations.js';
import { compilerValid } from './static-expectations.js';

const owners = ['ramify', 'ramify/analysis', 'ramify/analysis/descriptions', 'ramify/analysis/model',
  'ramify/analysis/project', 'ramify/analysis/typescript', 'ramify/cli', 'ramify/daemon', 'ramify/daemon/contexts', 'ramify/explorer',
  'ramify/integration-tests', 'ramify/presentation', 'ramify/presentation/layout', 'ramify/presentation/project-view', 'ramify/service-api'];
/** The separately declared testing module keeps its tests in its ordinary source, under its full header profile. */
const testingModules = ['ramify/integration-tests'];
const probe = 'subs/presentation/subs/layout/src/__i1_probe.ts';
/**
 * The root description's nested trees (owned-ignored and external): never
 * entered, catalogued or walked. Owned compiler source anywhere else outside a
 * module's src/ is that module's auxiliary source (project-boundary iteration
 * 8C), and the root configuration admits JavaScript.
 */
const declaredTrees = ['docs', 'examples/collection-review', 'scripts/probes/fixtures/compiler-api', 'scripts/probes/fixtures/plan2a-symbol-details',
  'scripts/reference-harness', 'site', '.cucumber-viz', '.history', '.playwright-mcp', '.reference-work', 'ramify-agent'];
const inDeclaredTree = (path: string): boolean => declaredTrees.some(tree => path === tree || path.startsWith(`${tree}/`));
/** Nearest module directories of the toolkit's auxiliary source; everything else outside every src/ is the root's. */
const auxiliaryOwners: readonly (readonly [string, string])[] = [['subs/analysis/', 'ramify/analysis'], ['subs/presentation/', 'ramify/presentation']];
/**
 * The nonblocking coverage kinds auxiliary scripts may produce: CommonJS,
 * non-literal and resource loads, and the imports of built dist/ output and
 * relative imports into node_modules. In the checkout those two are
 * always-excluded targets (`excluded-target` since project-boundary iteration
 * 11). In a copy, dist/ is absent (unresolved) and node_modules is a link to
 * the checkout's installation, whose physical location lies outside the
 * copy's root (`outside-module-target`).
 */
const auxiliaryNoteCodes = new Set(['excluded-target', 'outside-module-target', 'unresolved-target', 'unsupported-commonjs', 'nonliteral-target', 'resource-target']);
const original = { kind: 'code', owner: 'ramify', file: 'interfaces/batch.ts', binding: 'BatchInvocation' };

async function cliReport(root: string, assertions: Assertions, exit: number): Promise<AnalysisReport> {
  const result = await command(root, process.execPath, [join(repositoryRoot, 'dist/src/cli-entry.js'), 'check', '--batch', '--root', root, '--format', 'json']);
  assertions.equal('compiled self-check exit and streams', [result.code, result.signal, result.error, result.stderr], [exit, null, null, '']);
  const report = JSON.parse(result.stdout) as AnalysisReport;
  recordObservation('compiled-toolkit', { command: result.command, durationMs: result.durationMs, ...analysisEvidence(report) });
  return report;
}
function semantic(report: AnalysisReport): unknown {
  const { runId: _runId, ...data } = report;
  return data;
}

export async function assertToolkit(report: AnalysisReport, root: string, assertions: Assertions): Promise<void> {
  // Re-reasoned in project-boundary iteration 8C: the toolkit's scripts are now
  // analyzed as auxiliary source, so the check passes with partial coverage
  // whose every note lies in auxiliary source; the reviewed I1-27:self-check
  // row still says independent scripts are absent from the program.
  completed(report, assertions, 'partial');
  assertions.equal('no source diagnostic or denial', [report.diagnostics, report.summary.denied], [[], 0]);
  assertions.ok('real allowed application decisions', report.summary.allowed > 0);
  const snapshot = report.snapshot!;
  const auxiliaryFiles = new Set(snapshot.inventory.files.filter(file => file.placement === 'auxiliary').map(file => file.path));
  assertions.equal('every coverage note lies in auxiliary source and has a nonblocking script kind',
    report.coverage.filter(note => !auxiliaryFiles.has(note.location.file) || !auxiliaryNoteCodes.has(note.code)).map(note => [note.code, note.location.file]), []);
  assertions.equal('exact fifteen implemented owners', snapshot.inventory.modules.map(module => module.id), owners);
  assertions.equal('the testing module is declared testing', snapshot.inventory.modules.filter(module => testingModules.includes(module.id))
    .map(module => [module.id, module.headerTags.includes('testing')]), testingModules.map(id => [id, true]));
  assertions.equal('no outside-source warnings or retired outside list', [report.warnings, 'outsideModuleFiles' in snapshot.inventory], [[], false]);
  const disk = (await Promise.all(['src', 'subs'].map(directory => filesBelow(root, directory))))
    .flat().filter(file => /(?:^|\/)src\//.test(file)).sort();
  assertions.equal('all toolkit runtime, owned tests and resources inventoried', snapshot.inventory.files.filter(file => file.placement === 'src')
    .map(file => file.path).sort(), disk);
  const auxiliaryDisk = (await filesBelow(root)).filter(path => !inDeclaredTree(path) && !path.split('/').some(segment => segment.startsWith('.ramify'))
    && /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/.test(path) && !/(?:^|\/)src\//.test(path));
  assertions.equal('every owned compiler source file outside src/ is its nearest owner\'s auxiliary source, ordinary in area',
    snapshot.inventory.files.filter(file => file.placement !== 'src').map(file => [file.path, file.owner, file.area, file.kind, file.placement]).sort(),
    auxiliaryDisk.map(path => [path, auxiliaryOwners.find(([prefix]) => path.startsWith(prefix))?.[1] ?? 'ramify', 'ordinary', 'source', 'auxiliary']).sort());
  assertions.ok('root scripts, presentation\'s emitter and analysis\'s probes are present', ['scripts/build-production.ts',
    'subs/presentation/scripts/emit-diagrams.ts', 'subs/analysis/scripts/probes/modularity/baseline.ts'].every(path => auxiliaryFiles.has(path)));
  const source = snapshot.inventory.files.filter(file => file.kind === 'source');
  const complete = new Set(snapshot.catalog!.files.filter(file => file.state === 'complete').map(file => file.file));
  assertions.equal('every owned source loaded and catalogued completely', source.filter(file => !complete.has(file.path)), []);
  assertions.ok('owned ESM process probe is compiler input', complete.has('src/tests/process-probe.mjs'));
  assertions.ok('owned ESM process probe imports are checked', snapshot.accesses.some(access => access.location.file === 'src/tests/process-probe.mjs'));
  for (const owner of owners) {
    const area = testingModules.includes(owner) ? 'ordinary' : 'tests';
    assertions.ok(`${owner}: tests remain owned and analyzed`, source.some(file => file.owner === owner && file.area === area));
  }
  assertions.equal('declared nested trees never enter catalog', snapshot.catalog!.files.filter(file => inDeclaredTree(file.file)), []);
  assertions.equal('declared nested trees never produce source accesses', snapshot.accesses.filter(access => inDeclaredTree(access.importer.file)), []);
  assertions.equal('only module source areas are walked', report.scope!.walkedAreas.filter(area => !/(?:^|\/)src(?:\/tests)?$/.test(area)), []);
  assertions.equal('each access evaluated exactly once', snapshot.results.map(result => result.accessId).sort(), snapshot.accesses.map(access => access.id).sort());
  const importers = new Map(snapshot.accesses.map(access => [access.id, access.importer.file]));
  assertions.equal('no access of src/ source hidden behind coverage or outside scope', snapshot.results
    .filter(result => !['checked', 'external'].includes(result.outcome) && !auxiliaryFiles.has(importers.get(result.accessId)!)), []);
  assertions.ok('auxiliary source imports are checked', snapshot.results.some(result => result.outcome === 'checked'
    && auxiliaryFiles.has(importers.get(result.accessId)!) && result.decisions.some(decision => decision.status === 'allowed')));
  recordObservation('toolkit-scope', { owners, files: snapshot.inventory.files.map(file => ({ path: file.path, kind: file.kind, owner: file.owner, area: file.area })),
    checkedAccesses: snapshot.results.length, summary: report.summary });
}

type ProjectHandler = Extract<InstanceHandler, { kind: 'project' }>;
const fixture: Pick<ProjectHandler, 'kind' | 'fixture' | 'prepare' | 'baseline'> = {
  kind: 'project', fixture: { kind: 'copy', sourceRoot: repositoryRoot },
  prepare: ({ root }) => symlink(join(repositoryRoot, 'node_modules'), join(root, 'node_modules')),
  baseline: async ({ root, assertions }) => {
    await compilerValid(root, assertions);
    await assertToolkit(await sessionReport(root), root, assertions);
  },
};

export const selfHandlers: ReadonlyMap<string, InstanceHandler> = new Map<string, InstanceHandler>([
  ['I1-27:self-check', { ...fixture, mutate: async () => {}, run: async ({ root, assertions }: ProjectContext) => {
    const api = await sessionReport(root);
    await assertToolkit(api, root, assertions);
    const cli = await cliReport(root, assertions, 0);
    assertions.equal('public API and compiled CLI have identical semantic reports', semantic(cli), semantic(api));
  } }],
  ['I1-27:self-negative', { ...fixture,
    mutate: ({ root }) => put(root, probe, "import type { BatchInvocation } from '../../../../../src/interfaces/batch.js'; export type Probe = BatchInvocation;\n"),
    run: async ({ root, assertions }: ProjectContext) => {
      await compilerValid(root, assertions);
      const report = await sessionReport(root);
      // Iteration 8C: auxiliary scripts keep the toolkit's coverage partial.
      completed(report, assertions, 'partial', 'failed');
      assertions.equal('independently expected toolkit original, importer and denial', report.diagnostics.map(issue => ({ code: issue.code,
        file: issue.location?.file, line: issue.location?.line, original: issue.original, importer: issue.importer })), [{
        code: 'required-importer-tag', file: probe, line: 1, original,
        importer: { owner: 'ramify/presentation/layout', kind: 'ordinary', root: 'subs/presentation/subs/layout/src', profile: ['browser'] },
      }]);
      const denied = report.snapshot!.results.flatMap(result => result.decisions).filter(decision => decision.status === 'denied');
      assertions.equal('one denial, with visibility independently established', denied.map(decision => [decision.reason, decision.visibility?.visible]), [['required-importer-tag', true]]);
      assertions.ok('root descendant declaration retained as visibility evidence', denied[0].visibility!.paths.some(path => path.some(hop =>
        hop.module === 'ramify' && hop.destination === 'descendants' && hop.evidence.some(location => location.file === 'module.ramify'))));
      assertions.equal('explicit type request still requires dispatch coupling', denied[0].question.selection?.request, 'type-only');
      assertions.ok('diagnostic retains original and declaration locations', report.diagnostics[0].related.some(location => location.file === 'src/interfaces/batch.ts')
        && report.diagnostics[0].related.some(location => location.file === 'module.ramify'));
      const cli = await cliReport(root, assertions, 1);
      assertions.equal('compiled negative and public session agree', semantic(cli), semantic(report));
    },
  }],
]);
