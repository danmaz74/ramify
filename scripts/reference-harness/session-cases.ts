import { recordObservation } from './observations.js';
import type { Observation } from './observations.js';
import { execFile } from 'node:child_process';
import { readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { ownerId, sourcePath } from './linking-expectations.js';
import { repositoryRoot } from './plan.js';
import type { AssertionEvidence, InstanceHandler, ProjectContext } from './runner.js';
import { compilerValid } from './static-expectations.js';
import { clean, completed, sessionReport } from './session-expectations.js';

const referenceRoot = join(repositoryRoot, 'examples/collection-review');
const probe = 'subs/consumer/src/probe.ts', api = 'subs/provider/src/interfaces/api.ts';
const ku = 'workspace/catalog/ui', style = sourcePath(ku, 'catalog-card.module.css');
const handlers = new Map<string, InstanceHandler>();
type Handler = Extract<InstanceHandler, { kind: 'project' }>;
const unchanged = async (): Promise<void> => {};
async function append(root: string, path: string, text: string): Promise<void> { await put(root, path, await readFile(join(root, path), 'utf8') + text); }
async function configure(root: string, options: Record<string, unknown>, include?: readonly string[]): Promise<void> {
  const config = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
  Object.assign(config.compilerOptions, options);
  if (include) config.include = include;
  await put(root, 'tsconfig.json', JSON.stringify(config));
}
function add(id: string, fixture: 'R' | 'F', mutate: Handler['mutate'], run: Handler['run'], options: {
  prepare?: Handler['prepare']; partialBaseline?: boolean;
} = {}): void {
  handlers.set(id, { kind: 'project', fixture: fixture === 'R' ? { kind: 'copy', sourceRoot: referenceRoot }
    : { kind: 'create', create: createProjectFixture },
  prepare: async context => {
    if (fixture === 'R') await symlink(join(referenceRoot, 'node_modules'), join(context.root, 'node_modules'));
    await options.prepare?.(context);
  }, baseline: async context => {
    await compilerValid(context.root, context.assertions);
    const report = await sessionReport(context.root);
    if (options.partialBaseline) completed(report, context.assertions, 'partial'); else clean(report, context.assertions);
    context.assertions.equal('baseline exact owner count', report.summary.owners, fixture === 'R' ? 15 : 3);
  }, mutate, run });
}
function accessResult(report: AnalysisReport, importer: string, specifier?: string) {
  const accesses = report.snapshot!.accesses.filter(access => access.importer.file === importer
    && (specifier === undefined || access.specifier === specifier));
  return accesses.map(access => ({ access, result: report.snapshot!.results.find(result => result.accessId === access.id)! }));
}
function locatedCoverage(context: ProjectContext, report: AnalysisReport, code: string, file: string): void {
  context.assertions.ok(`${code}: explicit located coverage`, report.coverage.some(issue => issue.code === code
    && issue.location.file === file && issue.location.line > 0 && issue.location.column > 0));
}
function knownValue(context: ProjectContext, report: AnalysisReport): void {
  const decisions = accessResult(report, probe).flatMap(item => item.result.decisions);
  context.assertions.ok('known exposed value still receives allowed original decision', decisions.some(decision => decision.status === 'allowed'
    && decision.original?.id.owner === 'fixture/provider' && decision.original.id.file === 'interfaces/api.ts' && decision.original.id.binding === 'value'));
}

for (const declaration of [false, true]) add(`I1-23:missing-resource/${declaration ? 'declaration' : 'source'}`, 'R',
  ({ root }) => rm(join(root, style)), async context => {
    const report = await sessionReport(context.root);
    if (declaration) {
      context.assertions.equal('missing exposed resource invalidates input', report.outcome, { execution: 'invalid', check: 'failed', coverage: 'not-run' });
      context.assertions.ok('missing resource identifies the declaration', report.diagnostics.some(issue => issue.code === 'missing-file'
        && issue.location?.file.endsWith('/ui/module.ramify')));
      context.assertions.ok('invalid declaration blocks all source checking', report.stages.filter(stage => ['access', 'decide'].includes(stage.stage))
        .every(stage => stage.status === 'blocked' && stage.blockedBy.length > 0));
      context.assertions.equal('no permission decision from invalid input', report.summary.allowed + report.summary.denied, 0);
    } else {
      completed(report, context.assertions, 'partial');
      locatedCoverage(context, report, 'resource-target', sourcePath(ku, 'catalog-card.tsx'));
      const items = accessResult(report, sourcePath(ku, 'catalog-card.tsx'), './catalog-card.module.css');
      context.assertions.equal('missing resource never becomes external or an allowed application access', items.map(item =>
        [item.access.target.kind, item.result.outcome, item.result.decisions]), [['unresolved', 'unverifiable', []]]);
      context.assertions.equal('missing undeclared resource has no permission error', report.diagnostics, []);
    }
  }, { prepare: declaration ? ({ root }) => append(root, sourcePath(ku, '').replace(/src\/$/, 'module.ramify'),
    '\nexpose-src default from "catalog-card.module.css" tagged [ui, browser] to parent\n') : undefined });
add('I1-23:missing-resource-export', 'R', ({ root }) => put(root, sourcePath(ku, '__i1_probe.ts'),
  "import { absentStyle } from './catalog-card.module.css'; void absentStyle;\n"), async context => {
  // TS2614 is intentional: the effective resource description has no such export.
  const report = await sessionReport(context.root);
  completed(report, context.assertions, 'complete', 'failed');
  const importer = sourcePath(ku, '__i1_probe.ts');
  const found = report.diagnostics.filter(issue => issue.code === 'missing-export');
  context.assertions.equal('absent resource export is one located error', found.map(issue => [issue.category, issue.location?.file,
    issue.location?.line, issue.importer?.owner, issue.importer?.kind]), [['missing-export', importer, 1, ownerId(ku), 'ordinary']]);
  const items = accessResult(report, importer);
  context.assertions.equal('missing selection remains attached to actual resource target', items.map(item => [item.access.target.kind,
    item.access.target.kind === 'application' ? item.access.target.origin.file : null,
    item.access.selections.map(selection => [selection.exportedName, selection.status]), item.result.diagnostics]),
    [['application', style, [['absentStyle', 'missing-export']], [found[0].id]]]);
  context.assertions.equal('definite missing resource name is not downgraded to coverage', report.coverage, []);
});

for (const [variant, importer, specifier] of [['package', 'src/protocol.ts', '@trpc/server'], ['builtin', 'src/server.ts', 'node:http']] as const) {
  add(`I1-24:external/${variant}`, 'R', unchanged, async context => {
    const report = await sessionReport(context.root);
    clean(report, context.assertions);
    const items = accessResult(report, importer, specifier);
    context.assertions.ok('authored external import was examined', items.length > 0);
    context.assertions.ok('external scope proven by resolution', items.every(item => item.access.target.kind === 'external'
      && item.access.target.resolution === variant && item.access.target.name === specifier
      && (variant === 'builtin' || item.access.target.resolvedFile !== null)));
    context.assertions.ok('external targets have no fabricated application permission', items.every(item => item.result.outcome === 'external'
      && item.result.decisions.length === 0 && item.access.selections.every(selection => selection.original === null)));
    context.assertions.equal('external summary counts recorded external occurrences', report.summary.external,
      report.snapshot!.results.filter(item => item.outcome === 'external').length);
  });
}
add('I1-24:unresolved', 'F', ({ root }) => put(root, probe, "import { missing } from '@unmapped/application'; void missing;\n"), async context => {
  const report = await sessionReport(context.root);
  completed(report, context.assertions, 'partial');
  locatedCoverage(context, report, 'unresolved-target', probe);
  context.assertions.equal('bare spelling does not prove package resolution', accessResult(report, probe).map(item =>
    [item.access.target.kind, item.result.outcome, item.result.decisions]), [['unresolved', 'unverifiable', []]]);
  context.assertions.equal('unresolved compiler error alone does not fail permission checking', report.diagnostics, []);
});
add('I1-24:unsupported-macro', 'R', ({ root }) => put(root, sourcePath('workspace', '__i1_probe.ts'),
  "const modules = import.meta.glob('./*.tsx'); void modules;\n"), async context => {
  await compilerValid(context.root, context.assertions);
  const report = await sessionReport(context.root);
  completed(report, context.assertions, 'partial');
  const importer = sourcePath('workspace', '__i1_probe.ts');
  locatedCoverage(context, report, 'unsupported-loader', importer);
  context.assertions.ok('glob receives no guessed targets or permission', accessResult(report, importer).some(item =>
    item.access.form === 'macro' && item.result.outcome === 'unverifiable' && item.result.decisions.length === 0));
});
for (const [variant, source] of [
  ['require', "declare function require(path: string): { value: number }; const ns = require('../../provider/src/interfaces/api.js'); void ns.value;"],
  ['import-equals', "import ns = require('../../provider/src/interfaces/api.js'); void ns.value;"],
  ['export-equals', "import ns = require('../../provider/src/interfaces/api.js'); export = ns;"],
  ['module-exports', "declare const module: { exports: unknown }; declare function require(path: string): unknown; module.exports = require('../../provider/src/interfaces/api.js');"],
] as const) add(`I1-24:unsupported-commonjs/${variant}`, 'F', ({ root }) => put(root, probe, source + '\n'), async context => {
  await compilerValid(context.root, context.assertions);
  const report = await sessionReport(context.root);
  completed(report, context.assertions, 'partial');
  locatedCoverage(context, report, 'unsupported-commonjs', probe);
  const items = accessResult(report, probe);
  context.assertions.ok('CommonJS source occurrences retained', items.length > 0);
  context.assertions.ok('unsupported CommonJS cannot fabricate allowed selections', items.every(item =>
    item.access.form === 'commonjs' && item.result.outcome === 'unverifiable' && item.result.decisions.length === 0));
}, { prepare: variant === 'require' ? undefined : async ({ root }) => {
  await configure(root, { module: 'Node16', moduleResolution: 'Node16' });
  await put(root, 'package.json', '{"private":true,"type":"commonjs"}\n');
} });
const partial = ({ root }: { root: string }) => append(root, probe, '\ndeclare const target: string; void import(target);\n');
add('I1-24:partial-clean', 'F', partial, async context => {
  await compilerValid(context.root, context.assertions);
  const report = await sessionReport(context.root);
  completed(report, context.assertions, 'partial'); knownValue(context, report);
  locatedCoverage(context, report, 'nonliteral-target', probe);
  context.assertions.equal('bounded partial checking has no errors', report.diagnostics, []);
});
add('I1-24:partial-denied', 'F', ({ root }) => append(root, probe,
  "import { privateValue } from '../../provider/src/interfaces/api.js'; void privateValue;\n"), async context => {
  await compilerValid(context.root, context.assertions);
  const report = await sessionReport(context.root);
  completed(report, context.assertions, 'partial', 'failed'); knownValue(context, report);
  locatedCoverage(context, report, 'nonliteral-target', probe);
  context.assertions.equal('known denial retained with independent coverage', report.diagnostics.map(issue => [issue.code, issue.location?.file,
    issue.original, issue.importer?.owner]), [['not-visible', probe,
    { kind: 'code', owner: 'fixture/provider', file: 'interfaces/api.ts', binding: 'privateValue' }, 'fixture/consumer']]);
  context.assertions.equal('one denied selection', report.summary.denied, 1);
}, { prepare: partial, partialBaseline: true });
add('I1-24:resolution-blocked', 'F', async ({ root }) => {
  await put(root, 'subs/provider/src/interfaces/broken.ts', "export { broken } from './missing.js';\n");
  await append(root, probe, "import { broken } from '../../provider/src/interfaces/broken.js'; void broken;\n");
}, async context => {
  const report = await sessionReport(context.root);
  completed(report, context.assertions, 'partial'); knownValue(context, report);
  context.assertions.ok('compiler blocking diagnostic retained as located coverage', report.coverage.some(issue => issue.code === 'compiler-blocked'
    && issue.compilerCode === 2307 && issue.location.file === 'subs/provider/src/interfaces/broken.ts'));
  const blocked = accessResult(report, probe, '../../provider/src/interfaces/broken.js');
  context.assertions.equal('blocked import occurrence remains recorded', blocked.length, 1);
  context.assertions.ok('unresolved original is never assigned an allowed binding decision', blocked.every(item =>
    ['mixed', 'unverifiable'].includes(item.result.outcome) && item.access.selections.every(selection => selection.status === 'unresolved')
    && item.result.decisions.every(decision => decision.original === null && decision.question.selection === null)));
  context.assertions.equal('unrelated compiler problem is not a permission error', report.diagnostics, []);
});
add('I1-29:outside-module-target', 'F', async ({ root }) => {
  await put(root, 'loose.ts', 'export const loose = 1;\n');
  await configure(root, {}, ['src', 'subs/**/src', 'loose.ts']);
  await append(root, probe, "import { loose } from '../../../loose.js'; void loose;\n");
}, async context => {
  await compilerValid(context.root, context.assertions);
  const report = await sessionReport(context.root);
  completed(report, context.assertions, 'partial'); knownValue(context, report);
  locatedCoverage(context, report, 'outside-module-target', probe);
  context.assertions.equal('outside-source warning remains distinct from failures', report.warnings,
    [{ code: 'outside-module-source', entry: 'loose.ts', count: 1, files: ['loose.ts'] }]);
  context.assertions.equal('outside-module application target has no invented permission or external scope',
    accessResult(report, probe, '../../../loose.js').map(item => [item.access.target, item.result.outcome, item.result.decisions]),
    [[{ kind: 'outside-module', file: 'loose.ts' }, 'outside-scope', []]]);
});

for (const id of ['I1-27:cancel/acquisition', 'I1-27:cancel/catalog', 'I1-27:read-failure',
  'I1-27:dispose/completed', 'I1-27:dispose/in-flight', 'I1-27:report-retention',
  'I1-29:changed-input/once', 'I1-29:changed-input/repeated']) {
  add(id, 'F', unchanged, async context => {
    // Isolated builtin instrumentation observes the real API without injecting a
    // fake analyzer or extending the production contract with testing hooks.
    const result = await promisify(execFile)(process.execPath, ['--expose-gc', '--import', import.meta.resolve('tsx'),
      join(repositoryRoot, 'scripts/reference-harness/session-lifecycle.ts'), context.root, id],
    { cwd: repositoryRoot, timeout: id.endsWith('report-retention') ? 120_000 : 30_000, maxBuffer: 2 * 1024 ** 2 });
    context.assertions.equal('isolated lifecycle worker stderr', result.stderr, '');
    const evidence = JSON.parse(result.stdout) as { assertions: AssertionEvidence[]; observations?: Observation[]; error?: string };
    for (const observation of evidence.observations ?? []) recordObservation(observation.kind, observation.data);
    context.assertions.ok('lifecycle worker returned actual assertions', evidence.assertions.length > 0);
    for (const assertion of evidence.assertions) context.assertions.equal(`${assertion.name}${assertion.error ? ': ' + assertion.error : ''}`, assertion.status, 'passed');
    context.assertions.equal('lifecycle worker completed without hidden failure', evidence.error, undefined);
  });
}
export const sessionHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
