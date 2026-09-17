import { createDefaultTagRegistry } from '../../subs/model/src/index.js';
import type { AnalysisReport, Capability } from '../interfaces/analysis.js';
import type { Destination, ModuleRecord, OriginalId, SourceArea } from '../../subs/model/src/interfaces/model.js';
import type { InventoryFile } from '../../subs/project/src/interfaces/project.js';
import type { AccessSelection, SourceAccess, SourceLimit } from '../../subs/typescript/src/interfaces/source.js';
import type { DependencyBehaviorFact, DependencyBehaviorFacts } from '../../subs/typescript/src/interfaces/dependency-behavior.js';

/**
 * Hand-built analysis reports for the modularity projection. Modules are named
 * by id (`app`, `app/core`); a module's directory is `subs/<name>/` below its
 * parent's, its ordinary area `src` and its tests area `src/tests`. Files,
 * originals and accesses use project-relative paths; the builder derives the
 * area-relative `OriginalId.file` the real analysis reports.
 */

export interface FixtureModule { readonly id: string; readonly testing?: boolean }
export interface FixtureFile { readonly path: string; readonly owner: string; readonly area?: 'ordinary' | 'tests';
  readonly kind?: 'source' | 'resource'; readonly bytes?: number; readonly state?: 'complete' | 'incomplete';
  readonly issueIds?: readonly string[] }
export interface FixtureOriginal { readonly file: string; readonly binding: string; readonly value?: boolean }
export interface FixtureExposure { readonly module: string; readonly file: string; readonly binding: string;
  readonly destinations: readonly Destination[]; readonly effective?: boolean }
export type FixtureTarget = string | { readonly external: string } | { readonly outside: string } | 'unresolved';
export interface FixtureSelection { readonly file: string; readonly binding: string; readonly name?: string;
  readonly status?: AccessSelection['status'] }
export interface FixtureAccess { readonly id: string; readonly importer: string; readonly target: FixtureTarget;
  readonly runtime?: boolean; readonly selections?: readonly FixtureSelection[]; readonly coverageIds?: readonly string[] }
export interface FixtureFact { readonly consumer: string; readonly file: string; readonly binding: string;
  readonly classification: DependencyBehaviorFact['classification']; readonly limitIds?: readonly string[] }
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
  readonly independentScopes?: readonly string[];
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
  const inventoryFiles: InventoryFile[] = spec.files.map(file => ({ path: file.path, owner: file.owner, area: file.area ?? 'ordinary',
    kind: file.kind ?? 'source', sha256: '0'.repeat(64), bytes: file.bytes ?? 10 }));
  const accesses: SourceAccess[] = spec.accesses.map(access => {
    const location = { file: access.importer, start: 0, end: 1, line: 1, column: 1 };
    const target: SourceAccess['target'] = typeof access.target === 'string'
      ? access.target === 'unresolved' ? { kind: 'unresolved' } : { kind: 'application', origin: { file: access.target, area: area(access.target) } }
      : 'external' in access.target ? { kind: 'external', resolution: 'package', name: access.target.external, resolvedFile: null }
      : { kind: 'outside-module', file: access.target.outside };
    return {
      id: access.id, location, importer: { file: access.importer, area: area(access.importer) }, specifier: 'x',
      form: 'import', selectionForm: 'named', runtimeLoad: access.runtime ?? true, target,
      selections: (access.selections ?? []).map(selection => ({
        location, exportedName: selection.name ?? selection.binding, localName: selection.binding,
        original: (selection.status ?? 'resolved') === 'resolved' ? originalId(selection.file, selection.binding) : null,
        request: 'value', explicitType: false, forwarding: [], status: selection.status ?? 'resolved',
      })),
      coverageIds: access.coverageIds ?? [],
    };
  });
  const coverage: SourceLimit[] = (spec.coverage ?? []).map(id => ({ id, code: 'unresolved-target', message: id, related: [],
    location: { file: spec.coverageAt?.[id] ?? 'outside.ts', start: 0, end: 1, line: 1, column: 1 } }));
  const behavior: DependencyBehaviorFacts | undefined = spec.behavior === undefined || spec.behavior === 'missing' ? undefined : {
    status: spec.behavior.status ?? 'completed',
    facts: spec.behavior.facts.map(fact => ({ consumer: { file: fact.consumer, area: area(fact.consumer) },
      original: originalId(fact.file, fact.binding), accessIds: [], classification: fact.classification,
      evidence: [], limitIds: fact.limitIds ?? [] })),
    limits: (spec.behavior.limits ?? []).map(id => ({ id, code: 'compiler-failure', location: null, message: id })),
  };
  const requested = spec.behavior === undefined ? baseCapabilities : [...baseCapabilities, 'dependency-behavior' as const];
  const scope = { root: '/fixture', selection: 'given' as const, invokedFrom: '/fixture', configuration: '/fixture/tsconfig.json',
    walkedAreas: areas.map(item => item.root), independentScopes: spec.independentScopes ?? [] };
  return {
    schemaVersion: 'ramify.analysis/1', runId: 'random', inputId: 'input-1',
    request: { project: { cwd: '/fixture', scope: 'whole-project', configuration: 'discover' }, registry, capabilities: requested,
      limits: {} as AnalysisReport['request']['limits'] },
    scope, registry,
    capabilities: [...requested].sort().map(capability => ({ capability, available: true, requested: true,
      executed: capability !== 'dependency-behavior' || behavior !== undefined })),
    stages: [], outcome: { execution: 'completed', check: 'passed', coverage: coverage.length ? 'partial' : 'complete' },
    snapshot: {
      inventory: { scope, modules: [], files: inventoryFiles, references: [], outsideModuleFiles: [], warnings: [] },
      areas, inputs: [],
      catalog: {
        originals: spec.originals.map(original => ({ id: originalId(original.file, original.binding),
          origin: { file: original.file, area: area(original.file) }, declarations: [], hasValue: original.value ?? true,
          hasType: !(original.value ?? true) })),
        files: spec.files.map(file => ({ file: file.path, state: file.state ?? 'complete', exports: [], issueIds: file.issueIds ?? [],
          descriptionFiles: [] })),
        coverage: [],
      },
      linked: null,
      model: { registry, modules, originals: [], exposures: spec.exposures.map(exposure => ({ module: exposure.module,
        original: originalId(exposure.file, exposure.binding), names: [exposure.binding], destinations: exposure.destinations,
        evidence: [], provider: null, effective: exposure.effective ?? true })) },
      accesses, results: [],
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
  view: 'subs/ui/src/view.ts', styles: 'subs/ui/src/styles.d.ts', css: 'subs/ui/src/view.css',
  button: 'subs/ui/subs/widgets/src/button.ts', probe: 'subs/tools/src/probe.ts',
} as const;

/**
 * app ─ core (exposes makeModel, Model, ModelOptions, help; tests expose fixtureModel)
 *     ─ ui (exposes render, Unused; Broken is ineffective) ─ widgets (exposes Button)
 *     ─ tools (testing-classified module)
 * Production: app→core, app→ui, ui↔widgets at runtime; core→app and ui→core type-only.
 */
export const graphSpec: FixtureSpec = {
  modules: [{ id: 'app' }, { id: 'app/core' }, { id: 'app/ui' }, { id: 'app/ui/widgets' }, { id: 'app/tools', testing: true }],
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
