import { createDefaultTagRegistry } from '../../subs/model/src/index.js';
import type { AccessResult, AnalysisReport, Capability } from '../interfaces/analysis.js';
import type { Destination, ImportDecision, ImportReason, ModuleRecord, OriginalId, SourceArea } from '../../subs/model/src/interfaces/model.js';
import type { CapturedInput, InventoryFile, InventoryModule, ProjectExclusion } from '../../subs/project/src/interfaces/project.js';
import type { AccessSelection, SourceAccess, SourceLimit } from '../../subs/typescript/src/interfaces/source.js';
import type { DependencyBehaviorFact, DependencyBehaviorFacts } from '../../subs/typescript/src/interfaces/dependency-behavior.js';

/**
 * Hand-built analysis reports for the modularity projection. Modules are named
 * by id (`app`, `app/core`); a module's directory is `subs/<name>/` below its
 * parent's, its ordinary area `src` and its tests area `src/tests`. Files,
 * originals and accesses use project-relative paths; the builder derives the
 * area-relative `OriginalId.file` the real analysis reports.
 */

export interface FixtureModule { readonly id: string; readonly testing?: boolean;
  readonly descriptionBytes?: number; readonly readmeBytes?: number | null }
export interface FixtureFile { readonly path: string; readonly owner: string; readonly area?: 'ordinary' | 'tests';
  readonly kind?: 'source' | 'resource'; readonly bytes?: number; readonly state?: 'complete' | 'incomplete';
  readonly issueIds?: readonly string[] }
export interface FixtureOriginal { readonly file: string; readonly binding: string; readonly value?: boolean }
export interface FixtureExposure { readonly module: string; readonly file: string; readonly binding: string;
  readonly destinations: readonly Destination[]; readonly effective?: boolean }
export type FixtureTarget = string | { readonly external: string } | { readonly outside: string } | 'unresolved';
export interface FixtureSelection { readonly file: string; readonly binding: string; readonly name?: string;
  readonly status?: AccessSelection['status'] }
/** An import decision for one selected original; resolved selections default to allowed `exposed`. */
export interface FixtureDecision { readonly file: string; readonly binding: string; readonly status: 'allowed' | 'denied';
  readonly reason: ImportReason }
export interface FixtureAccess { readonly id: string; readonly importer: string; readonly target: FixtureTarget;
  readonly runtime?: boolean; readonly selections?: readonly FixtureSelection[]; readonly coverageIds?: readonly string[];
  readonly decisions?: readonly FixtureDecision[]; readonly outcome?: AccessResult['outcome'] }
/** One access fact; classification and limits default to the aggregate fact's. */
export interface FixtureAccessFact { readonly id: string; readonly classification?: DependencyBehaviorFact['classification'];
  readonly limitIds?: readonly string[] }
/**
 * An aggregate fact. Without `accesses`, every access from the consumer file that selects the original
 * contributes one access fact with the aggregate's classification and limits.
 */
export interface FixtureFact { readonly consumer: string; readonly file: string; readonly binding: string;
  readonly classification: DependencyBehaviorFact['classification']; readonly limitIds?: readonly string[];
  readonly accesses?: readonly FixtureAccessFact[] }
export interface FixtureSpec {
  readonly modules: readonly FixtureModule[];
  readonly files: readonly FixtureFile[];
  readonly originals: readonly FixtureOriginal[];
  readonly exposures: readonly FixtureExposure[];
  readonly accesses: readonly FixtureAccess[];
  readonly coverage?: readonly string[];
  readonly coverageAt?: Readonly<Record<string, string>>;
  /** Omitted: not requested. `missing`: requested without facts. */
  readonly behavior?: { readonly status?: 'completed' | 'failed'; readonly facts: readonly FixtureFact[];
    readonly limits?: readonly string[] } | 'missing';
  /** The scope's ownership exclusions; declared nested trees among them are the omitted scopes. */
  readonly exclusions?: readonly ProjectExclusion[];
}

const directory = (id: string): string => id.split('/').slice(1).map(name => `subs/${name}/`).join('');
const baseCapabilities: readonly Capability[] = ['static-access', 'coverage', 'registry'];

export function buildReport(spec: FixtureSpec): AnalysisReport {
  const registry = createDefaultTagRegistry();
  const areas: SourceArea[] = spec.modules.flatMap(module => [
    { owner: module.id, kind: 'ordinary' as const, root: `${directory(module.id)}src`, profile: module.testing ? ['testing'] : [] },
    { owner: module.id, kind: 'tests' as const, root: `${directory(module.id)}src/tests`, profile: ['testing'] },
  ]);
  const files = new Map(spec.files.map(file => [file.path, file]));
  const area = (path: string): SourceArea => {
    const file = files.get(path);
    if (!file) throw new Error(`Fixture file ${path} is not declared`);
    return areas.find(item => item.owner === file.owner && item.kind === (file.area ?? 'ordinary'))!;
  };
  const originalId = (path: string, binding: string): OriginalId => {
    const owner = files.get(path)!.owner;
    const root = `${directory(owner)}src/`;
    if (!path.startsWith(root)) throw new Error(`Fixture original ${path} is outside ${root}`);
    return { kind: 'code', owner, file: path.slice(root.length), binding };
  };
  const modules: ModuleRecord[] = spec.modules.map(module => ({
    id: module.id, name: module.id.split('/').at(-1)!, parent: module.id.includes('/') ? module.id.slice(0, module.id.lastIndexOf('/')) : null,
    headerTags: module.testing ? ['testing'] : [], areas: areas.filter(item => item.owner === module.id),
  }));
  const inventoryModules: InventoryModule[] = spec.modules.map(module => {
    const dir = directory(module.id).replace(/\/$/, '');
    const readme = dir ? `${dir}/README.md` : 'README.md';
    return {
      id: module.id, name: module.id.split('/').at(-1)!, parent: module.id.includes('/') ? module.id.slice(0, module.id.lastIndexOf('/')) : null,
      directory: dir, headerTags: module.testing ? ['testing'] : [], areas: areas.filter(item => item.owner === module.id)
        .map(item => ({ ...item, present: true })),
      description: {} as InventoryModule['description'],
      purpose: module.readmeBytes === null ? { state: 'missing-file', readme }
        : { state: 'present', readme, paragraph: `${module.id} purpose.` },
    };
  });
  const documentationInputs: CapturedInput[] = spec.modules.flatMap(module => {
    const dir = directory(module.id).replace(/\/$/, '');
    const at = (name: string) => dir ? `${dir}/${name}` : name;
    return [
      { path: at('module.ramify'), role: 'description' as const, sha256: 'd'.repeat(64), bytes: module.descriptionBytes ?? 10 },
      { path: at('README.md'), role: 'readme' as const, sha256: 'r'.repeat(64), bytes: module.readmeBytes === null ? 0 : module.readmeBytes ?? 20 },
    ];
  });
  const inventoryFiles: InventoryFile[] = spec.files.map(file => ({ path: file.path, owner: file.owner, area: file.area ?? 'ordinary',
    kind: file.kind ?? 'source', placement: 'src', sha256: '0'.repeat(64), bytes: file.bytes ?? 10 }));
  const accesses: SourceAccess[] = spec.accesses.map(access => {
    const location = { file: access.importer, start: 0, end: 1, line: 1, column: 1 };
    const target: SourceAccess['target'] = typeof access.target === 'string'
      ? access.target === 'unresolved' ? { kind: 'unresolved' } : { kind: 'application', origin: { file: access.target, area: area(access.target), auxiliary: false } }
      : 'external' in access.target ? { kind: 'external', resolution: 'package', name: access.target.external, resolvedFile: null }
      : { kind: 'outside-project', file: access.target.outside };
    return {
      id: access.id, location, importer: { file: access.importer, area: area(access.importer), auxiliary: false }, specifier: 'x',
      form: 'import', selectionForm: 'named', runtimeLoad: access.runtime ?? true, target,
      selections: (access.selections ?? []).map(selection => ({
        location, exportedName: selection.name ?? selection.binding, localName: selection.binding,
        original: (selection.status ?? 'resolved') === 'resolved' ? originalId(selection.file, selection.binding) : null,
        request: 'value', explicitType: false, forwarding: [], status: selection.status ?? 'resolved',
      })),
      coverageIds: access.coverageIds ?? [],
    };
  });
  const results: AccessResult[] = spec.accesses.map(access => {
    const source = accesses.find(item => item.id === access.id)!;
    const question = { importer: source.importer, location: source.location, target: source.target.kind === 'application'
      ? source.target.origin : source.importer, forwarding: [], selection: null };
    const decision = (file: string, binding: string, status: 'allowed' | 'denied', reason: ImportReason): ImportDecision => ({
      status, reason, question, visibility: null, requirements: [], checkedOrigins: [], blockingOrigins: [],
      original: { id: originalId(file, binding), origin: { file, area: area(file), auxiliary: false }, declarations: [], hasValue: true, hasType: false,
        tags: [], tagEvidence: [], companions: { named: [], evidence: [], inferred: false, unresolved: 0 } } });
    const decisions = source.target.kind !== 'application' ? [] : access.decisions
      ? access.decisions.map(item => decision(item.file, item.binding, item.status, item.reason))
      : (access.selections ?? []).filter(selection => (selection.status ?? 'resolved') === 'resolved')
        .map(selection => decision(selection.file, selection.binding, 'allowed', 'exposed'));
    const outcome: AccessResult['outcome'] = access.outcome ?? (source.target.kind === 'external' ? 'external'
      : source.target.kind === 'outside-project' ? 'outside-scope' : source.target.kind === 'unresolved' ? 'unverifiable'
      : source.coverageIds.length ? 'mixed' : 'checked');
    return { accessId: access.id, decisions, outcome, diagnostics: [], coverage: source.coverageIds };
  });
  const coverage: SourceLimit[] = (spec.coverage ?? []).map(id => ({ id, code: 'unresolved-target', message: id, related: [],
    location: { file: spec.coverageAt?.[id] ?? 'outside.ts', start: 0, end: 1, line: 1, column: 1 } }));
  const selects = (access: FixtureAccess, file: string, binding: string) => (access.selections ?? [])
    .some(selection => selection.file === file && selection.binding === binding && (selection.status ?? 'resolved') === 'resolved');
  const accessFacts = (fact: FixtureFact) => {
    const listed = fact.accesses ?? spec.accesses.filter(access => access.importer === fact.consumer && selects(access, fact.file, fact.binding))
      .map((access): FixtureAccessFact => ({ id: access.id }));
    if (!listed.length) throw new Error(`Fixture fact ${fact.consumer} -> ${fact.file}#${fact.binding} has no access`);
    return [...listed].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0).map(item => {
      const classification = item.classification ?? fact.classification;
      return { accessId: item.id, classification, evidence: [],
        limitIds: item.limitIds ?? (classification === 'unknown' ? fact.limitIds ?? [] : []) };
    });
  };
  const behavior: DependencyBehaviorFacts | undefined = spec.behavior === undefined || spec.behavior === 'missing' ? undefined : {
    status: spec.behavior.status ?? 'completed',
    facts: spec.behavior.facts.map(fact => {
      const accesses = accessFacts(fact);
      return { consumer: { file: fact.consumer, area: area(fact.consumer), auxiliary: false }, original: originalId(fact.file, fact.binding),
        accessIds: accesses.map(item => item.accessId), accesses, classification: fact.classification,
        evidence: [], limitIds: fact.limitIds ?? [] };
    }),
    limits: (spec.behavior.limits ?? []).map(id => ({ id, code: 'compiler-failure', location: null, message: id })),
  };
  const requested = spec.behavior === undefined ? baseCapabilities : [...baseCapabilities, 'dependency-behavior' as const];
  const scope = { root: '/fixture', selection: 'given' as const, invokedFrom: '/fixture', configuration: '/fixture/tsconfig.json',
    walkedAreas: areas.map(item => item.root), ownership: { modules: [], exclusions: spec.exclusions ?? [] } };
  return {
    schemaVersion: 'ramify.analysis/2', runId: 'random', inputId: 'input-1',
    request: { project: { cwd: '/fixture', scope: 'whole-project', configuration: 'discover' }, registry, capabilities: requested,
      limits: {} as AnalysisReport['request']['limits'] },
    scope, registry,
    capabilities: [...requested].sort().map(capability => ({ capability, available: true, requested: true,
      executed: capability !== 'dependency-behavior' || behavior !== undefined })),
    stages: [], outcome: { execution: 'completed', check: 'passed', coverage: coverage.length ? 'partial' : 'complete' },
    snapshot: {
      inventory: { scope, modules: inventoryModules, files: inventoryFiles, references: [], outsideModuleFiles: [], warnings: [] },
      areas, inputs: documentationInputs,
      catalog: {
        originals: spec.originals.map(original => ({ id: originalId(original.file, original.binding),
          origin: { file: original.file, area: area(original.file), auxiliary: false }, declarations: [], hasValue: original.value ?? true,
          hasType: !(original.value ?? true), companions: { named: [], evidence: [], inferred: false, unresolved: 0 } })),
        files: spec.files.map(file => ({ file: file.path, state: file.state ?? 'complete', exports: [], issueIds: file.issueIds ?? [],
          descriptionFiles: [] })),
        coverage: [],
      },
      linked: null,
      model: { registry, modules, originals: [], exposures: spec.exposures.map(exposure => ({ module: exposure.module,
        original: originalId(exposure.file, exposure.binding), names: [exposure.binding], destinations: exposure.destinations,
        evidence: [], provider: null, effective: exposure.effective ?? true })) },
      accesses, results,
      ...(behavior ? { dependencyBehavior: behavior } : {}),
    },
    diagnostics: [], warnings: [], coverage,
    summary: { complete: true, owners: modules.length, sourceFiles: 0, resources: 0, originals: 0, accesses: accesses.length,
      allowed: 0, denied: 0, errors: 0, warnings: 0, coverageNotes: coverage.length, external: 0 },
  };
}

export const paths = {
  main: 'src/main.ts', service: 'src/interfaces/service.ts',
  model: 'subs/core/src/model.ts', helper: 'subs/core/src/helper.ts',
  modelTest: 'subs/core/src/tests/model.test.ts', support: 'subs/core/src/tests/support.ts',
  view: 'subs/ui/src/view.ts', styles: 'subs/ui/src/styles.d.ts', css: 'subs/ui/src/guide.md',
  button: 'subs/ui/subs/widgets/src/button.ts', probe: 'subs/tools/src/probe.ts',
} as const;

/**
 * app ─ core (exposes makeModel, Model, ModelOptions, help; tests expose fixtureModel)
 *     ─ ui (exposes render, Unused; Broken is ineffective) ─ widgets (exposes Button)
 *     ─ tools (testing-classified module)
 * Production: app→core, app→ui, ui↔widgets at runtime; core→app and ui→core type-only.
 */
export const graphSpec: FixtureSpec = {
  modules: [{ id: 'app' }, { id: 'app/core' }, { id: 'app/ui' }, { id: 'app/ui/widgets' },
    { id: 'app/tools', testing: true, readmeBytes: null }],
  files: [
    { path: paths.main, owner: 'app', bytes: 100 }, { path: paths.service, owner: 'app', bytes: 50 },
    { path: paths.model, owner: 'app/core', bytes: 200 }, { path: paths.helper, owner: 'app/core', bytes: 20 },
    { path: paths.modelTest, owner: 'app/core', area: 'tests', bytes: 300 }, { path: paths.support, owner: 'app/core', area: 'tests', bytes: 30 },
    { path: paths.view, owner: 'app/ui', bytes: 400 }, { path: paths.styles, owner: 'app/ui', bytes: 5 },
    { path: paths.css, owner: 'app/ui', kind: 'resource', bytes: 7, state: 'incomplete', issueIds: ['css-description'] },
    { path: paths.button, owner: 'app/ui/widgets', bytes: 60 }, { path: paths.probe, owner: 'app/tools', bytes: 70 },
  ],
  originals: [
    { file: paths.service, binding: 'Service', value: false },
    { file: paths.model, binding: 'makeModel' }, { file: paths.model, binding: 'Model', value: false },
    { file: paths.model, binding: 'ModelOptions', value: false }, { file: paths.helper, binding: 'help' },
    { file: paths.support, binding: 'fixtureModel' },
    { file: paths.view, binding: 'render' }, { file: paths.view, binding: 'Unused' }, { file: paths.view, binding: 'Broken' },
    { file: paths.button, binding: 'Button' },
  ],
  exposures: [
    { module: 'app', file: paths.service, binding: 'Service', destinations: ['descendants'] },
    { module: 'app/core', file: paths.model, binding: 'makeModel', destinations: ['parent', 'descendants'] },
    { module: 'app/core', file: paths.model, binding: 'Model', destinations: ['parent'] },
    { module: 'app/core', file: paths.model, binding: 'ModelOptions', destinations: ['parent'] },
    { module: 'app/core', file: paths.helper, binding: 'help', destinations: ['parent'] },
    { module: 'app/core', file: paths.support, binding: 'fixtureModel', destinations: ['parent'] },
    { module: 'app/ui', file: paths.view, binding: 'render', destinations: ['parent'] },
    { module: 'app/ui', file: paths.view, binding: 'Unused', destinations: ['parent'] },
    { module: 'app/ui', file: paths.view, binding: 'Broken', destinations: ['parent'], effective: false },
    // A relay by the parent of a child's original is not an owned exposure.
    { module: 'app/ui', file: paths.button, binding: 'Button', destinations: ['parent'] },
    { module: 'app/ui/widgets', file: paths.button, binding: 'Button', destinations: ['parent'] },
  ],
  accesses: [
    { id: 'a01', importer: paths.main, target: paths.model, selections: [{ file: paths.model, binding: 'makeModel' }] },
    { id: 'a02', importer: paths.main, target: paths.view, selections: [{ file: paths.view, binding: 'render' }] },
    { id: 'a03', importer: paths.model, target: paths.helper, selections: [{ file: paths.helper, binding: 'help' }] },
    { id: 'a04', importer: paths.model, target: paths.service, runtime: false, selections: [{ file: paths.service, binding: 'Service' }] },
    { id: 'a05', importer: paths.view, target: paths.button, selections: [{ file: paths.button, binding: 'Button' }] },
    { id: 'a06', importer: paths.button, target: paths.view, selections: [{ file: paths.view, binding: 'render' }] },
    { id: 'a07', importer: paths.view, target: { external: 'react' }, selections: [{ file: paths.view, binding: 'x', status: 'unresolved' }] },
    { id: 'a08', importer: paths.modelTest, target: paths.model, selections: [{ file: paths.model, binding: 'makeModel' }] },
    { id: 'a09', importer: paths.probe, target: paths.model, runtime: false, selections: [{ file: paths.model, binding: 'Model' }] },
    { id: 'a10', importer: paths.view, target: paths.model, runtime: false, selections: [{ file: paths.model, binding: 'Model' }] },
    { id: 'a11', importer: paths.probe, target: paths.support, selections: [{ file: paths.support, binding: 'fixtureModel' }] },
  ],
};

export const diagramPaths = {
  main: 'src/main.ts', both: 'src/both.ts', partial: 'src/partial.ts', mixed: 'src/mixed.ts', barrel: 'src/barrel.ts',
  local: 'src/local.ts', test: 'src/tests/a.test.ts', b: 'subs/b/src/index.ts', c: 'subs/c/src/index.ts',
  act: 'subs/core/src/act.ts', helper: 'subs/core/src/helper.ts', probe: 'subs/tools/src/probe.ts',
} as const;

/**
 * `dependency-report`: consumer `a` reaches originals owned by `a/core` through the imported modules `a/b`
 * and `a/c`, and `helper` also through its own barrel. `a/tools` (testing) and `a/empty` have no dependency.
 *
 * - `act`: main calls it through B and imports it unused through C; both calls it through B and uses it as a
 *   type through C; mixed calls it through B in the access that also selects the denied `secret`.
 * - `Shape` (type through B), `settings` (data through C, whose access carries a source limit).
 * - `Config`: non-behavioral through B and unknown through C.
 * - Controls without a diagram fact: an unused import, a same-owner call, a symbol-free load, external,
 *   outside-project and unresolved targets and a missing export.
 * - The test file calls `act` through B.
 */
export const dependencyReportSpec: FixtureSpec = (() => {
  const p = diagramPaths;
  const core = (binding: string, value = true) => ({ file: p.act, binding, value });
  return {
    modules: [{ id: 'a' }, { id: 'a/b' }, { id: 'a/c' }, { id: 'a/core' }, { id: 'a/empty' }, { id: 'a/tools', testing: true }],
    files: [
      { path: p.main, owner: 'a' }, { path: p.both, owner: 'a' }, { path: p.partial, owner: 'a' }, { path: p.mixed, owner: 'a' },
      { path: p.barrel, owner: 'a' }, { path: p.local, owner: 'a' }, { path: p.test, owner: 'a', area: 'tests' },
      { path: p.b, owner: 'a/b' }, { path: p.c, owner: 'a/c' }, { path: p.act, owner: 'a/core' }, { path: p.helper, owner: 'a/core' },
      { path: p.probe, owner: 'a/tools' },
    ],
    originals: [core('act'), core('Shape', false), core('settings'), core('Config', false), core('unusedThing'), core('secret'),
      { file: p.helper, binding: 'helper' }, { file: p.local, binding: 'local' }],
    exposures: [],
    accesses: [
      { id: 'x01', importer: p.main, target: p.b, selections: [{ file: p.act, binding: 'act' }] },
      { id: 'x02', importer: p.main, target: p.c, selections: [{ file: p.act, binding: 'act' }] },
      { id: 'x03', importer: p.both, target: p.b, selections: [{ file: p.act, binding: 'act' }] },
      { id: 'x04', importer: p.both, target: p.c, selections: [{ file: p.act, binding: 'act' }] },
      { id: 'x05', importer: p.main, target: p.b, runtime: false, selections: [{ file: p.act, binding: 'Shape' }] },
      { id: 'x06', importer: p.main, target: p.c, selections: [{ file: p.act, binding: 'settings' }], coverageIds: ['source-limit/s'] },
      { id: 'x07', importer: p.partial, target: p.b, runtime: false, selections: [{ file: p.act, binding: 'Config' }] },
      { id: 'x08', importer: p.partial, target: p.c, runtime: false, selections: [{ file: p.act, binding: 'Config' }] },
      { id: 'x09', importer: p.main, target: p.b, selections: [{ file: p.act, binding: 'unusedThing' }] },
      { id: 'x10', importer: p.main, target: p.local, selections: [{ file: p.local, binding: 'local' }] },
      { id: 'x11', importer: p.main, target: p.barrel, selections: [{ file: p.helper, binding: 'helper' }] },
      { id: 'x12', importer: p.barrel, target: p.helper, selections: [{ file: p.helper, binding: 'helper' }] },
      { id: 'x13', importer: p.main, target: { external: 'react' } },
      { id: 'x14', importer: p.main, target: { outside: 'loose/x.ts' } },
      { id: 'x15', importer: p.main, target: 'unresolved' },
      { id: 'x16', importer: p.main, target: p.act },
      { id: 'x17', importer: p.mixed, target: p.b, selections: [{ file: p.act, binding: 'act' }, { file: p.act, binding: 'secret' }],
        decisions: [{ file: p.act, binding: 'act', status: 'allowed', reason: 'exposed' },
          { file: p.act, binding: 'secret', status: 'denied', reason: 'not-visible' }] },
      { id: 'x18', importer: p.test, target: p.b, selections: [{ file: p.act, binding: 'act' }] },
      { id: 'x19', importer: p.main, target: p.b, selections: [{ file: p.act, binding: 'gone', status: 'missing-export' }] },
    ],
    behavior: { facts: [
      { consumer: p.main, file: p.act, binding: 'act', classification: 'behavioral',
        accesses: [{ id: 'x01' }, { id: 'x02', classification: 'unused' }] },
      { consumer: p.both, file: p.act, binding: 'act', classification: 'behavioral',
        accesses: [{ id: 'x03' }, { id: 'x04', classification: 'non-behavioral' }] },
      { consumer: p.main, file: p.act, binding: 'Shape', classification: 'non-behavioral' },
      { consumer: p.main, file: p.act, binding: 'settings', classification: 'non-behavioral' },
      { consumer: p.partial, file: p.act, binding: 'Config', classification: 'unknown', limitIds: ['behavior-limit/u'],
        accesses: [{ id: 'x07', classification: 'non-behavioral' }, { id: 'x08' }] },
      { consumer: p.main, file: p.act, binding: 'unusedThing', classification: 'unused' },
      { consumer: p.main, file: p.local, binding: 'local', classification: 'behavioral' },
      { consumer: p.main, file: p.helper, binding: 'helper', classification: 'behavioral' },
      { consumer: p.barrel, file: p.helper, binding: 'helper', classification: 'non-behavioral' },
      { consumer: p.mixed, file: p.act, binding: 'act', classification: 'behavioral' },
      { consumer: p.mixed, file: p.act, binding: 'secret', classification: 'behavioral' },
      { consumer: p.test, file: p.act, binding: 'act', classification: 'behavioral' },
    ], limits: ['behavior-limit/u'] },
  };
})();
