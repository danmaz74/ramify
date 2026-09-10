import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { put } from './fixtures/plan1/project.js';
import { analysisEvidence, recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import { command } from './processes.js';
import { filesBelow } from './reference-baseline.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';
import { clean, completed, sessionReport } from './session-expectations.js';
import { compilerValid } from './static-expectations.js';

const owners = ['ramify', 'ramify/analysis', 'ramify/analysis/descriptions', 'ramify/analysis/model',
  'ramify/analysis/project', 'ramify/analysis/typescript', 'ramify/cli', 'ramify/presentation', 'ramify/presentation/layout'];
const probe = 'subs/presentation/subs/layout/src/__i1_probe.ts';
const original = { kind: 'code', owner: 'ramify', file: 'interfaces/batch.ts', binding: 'BatchInvocation' };

async function cliReport(root: string, assertions: Assertions, exit: number): Promise<AnalysisReport> {
  const result = await command(root, process.execPath, [join(repositoryRoot, 'dist/src/cli-entry.js'), 'check', '--root', root, '--format', 'json']);
  assertions.equal('compiled self-check exit and streams', [result.code, result.signal, result.error, result.stderr], [exit, null, null, '']);
  const report = JSON.parse(result.stdout) as AnalysisReport;
  recordObservation('compiled-toolkit', { command: result.command, durationMs: result.durationMs, ...analysisEvidence(report) });
  return report;
}
function semantic(report: AnalysisReport): unknown {
  const { runId: _runId, ...data } = report;
  return data;
}

async function assertToolkit(report: AnalysisReport, root: string, assertions: Assertions): Promise<void> {
  clean(report, assertions);
  const snapshot = report.snapshot!;
  assertions.equal('exact nine implemented owners', snapshot.inventory.modules.map(module => module.id), owners);
  assertions.equal('no outside-source warnings or invented ownership', [report.warnings, snapshot.inventory.outsideModuleFiles], [[], []]);
  const disk = (await Promise.all(['src', 'subs'].map(directory => filesBelow(root, directory))))
    .flat().filter(file => /(?:^|\/)src\//.test(file)).sort();
  assertions.equal('all toolkit runtime, owned tests and resources inventoried', snapshot.inventory.files.map(file => file.path).sort(), disk);
  const source = snapshot.inventory.files.filter(file => file.kind === 'source');
  const complete = new Set(snapshot.catalog!.files.filter(file => file.state === 'complete').map(file => file.file));
  assertions.equal('every owned source loaded and catalogued completely', source.filter(file => !complete.has(file.path)), []);
  assertions.ok('owned ESM process probe is compiler input', complete.has('src/tests/process-probe.mjs'));
  assertions.ok('owned ESM process probe imports are checked', snapshot.accesses.some(access => access.location.file === 'src/tests/process-probe.mjs'));
  for (const owner of owners) assertions.ok(`${owner}: tests remain owned and analyzed`, source.some(file => file.owner === owner && file.area === 'tests'));
  const independent = /^(?:examples|scripts|site)\//;
  assertions.equal('independent application and tool sources never enter catalog', snapshot.catalog!.files.filter(file => independent.test(file.file)), []);
  assertions.equal('independent scopes never produce source accesses', snapshot.accesses.filter(access => independent.test(access.importer.file)), []);
  assertions.equal('independent scopes are absent from walked source areas', report.scope!.walkedAreas.filter(file => independent.test(file)), []);
  assertions.equal('each access evaluated exactly once', snapshot.results.map(result => result.accessId).sort(), snapshot.accesses.map(access => access.id).sort());
  assertions.equal('no application access hidden behind coverage or outside scope', snapshot.results.filter(result => !['checked', 'external'].includes(result.outcome)), []);
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
      completed(report, assertions, 'complete', 'failed');
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
