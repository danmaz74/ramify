import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { LinkedDescriptions } from '../subs/descriptions/src/interfaces/linking.js';
import { linkDescriptions } from '../subs/descriptions/src/link.js';
import type { ParsedDescription } from '../subs/descriptions/src/interfaces/syntax.js';
import { parseDescription } from '../subs/descriptions/src/parse.js';
import { buildModel, deriveSourceAreas, originalKey } from '../subs/model/src/index.js';
import type { Model, ResolvedTagRegistry, SourceArea } from '../subs/model/src/interfaces/model.js';
import type { CapturedInput, ObservedChange, ProjectInventory, ProjectIssue, ProjectObserver } from '../subs/project/src/interfaces/project.js';
import { readProject } from '../subs/project/src/read-project.js';
import type { AccessInterpreter, CatalogOriginal, RetainedSourceAnalysis, SourceAccess, SourceCatalog,
  SourceLimit } from '../subs/typescript/src/interfaces/source.js';
import { evaluateAccessesAsync } from './evaluate-accesses.js';
import type { AccessResult, AnalysisDiagnostic, AnalysisInputs, AnalysisReport, StageId } from './interfaces/analysis.js';
import type { CheckedSet, RevisionPath, RevisionTimings, SessionLimits } from './interfaces/session.js';
import { diagnostic, projectDiagnostics } from './report-data.js';
import { ReportDraft, WorkLimit, byteOrder } from './report.js';
import type { AccessDecision, FileFacts, SessionFacts } from './session-facts.js';
import { accessSurface, assembleAccesses, buildIndexes, canonicalLocations, deepFreeze, emptyCatalog, emptyIndexes,
  sortedPaths } from './session-facts.js';

/** Mutable state of one session; the public handle owns it and serializes access. */
export interface SessionState {
  /** The request echoed by every projected report; session limits are not part of it. */
  request: AnalysisInputs;
  readonly limits: SessionLimits;
  readonly registry: ResolvedTagRegistry;
  observer: ProjectObserver | null;
  adapter: RetainedSourceAnalysis | null;
  /** The areas the adapter was created with; a different derivation recreates it. */
  adapterAreas: string | null;
  facts: SessionFacts | null;
  /** The next update recomputes everything: after a failure or an invalid update. */
  stale: boolean;
  /** Descriptions parsed by the observer's parse callback, for invalid-description diagnostics. */
  readonly parsed: Map<string, ParsedDescription>;
}

export type PhaseTimings = { -readonly [K in keyof Omit<RevisionTimings, 'publish' | 'total'>]: number };
export interface Computed {
  readonly status: 'computed';
  readonly facts: SessionFacts;
  readonly checked: CheckedSet;
  readonly changed: readonly string[];
  readonly timings: PhaseTimings;
  /** Accesses decided again only because their original's declarations moved. */
  readonly positionRefreshed: readonly string[];
}
export type StepResult =
  | Computed
  | { readonly status: 'identical' }
  | { readonly status: 'reported'; readonly report: AnalysisReport }
  | { readonly status: 'cancelled' };

const cancelled = (): Error & { code: string } => Object.assign(new Error('Retained session operation was cancelled'), { code: 'cancelled' });
export const isCancellation = (error: unknown, signal?: AbortSignal): boolean => signal?.aborted === true
  || (error !== null && typeof error === 'object' && 'code' in error && error.code === 'cancelled')
  || (error instanceof Error && error.name === 'AbortError');
const check = (signal?: AbortSignal): void => { if (signal?.aborted) throw cancelled(); };
export const zeroTimings = (): PhaseTimings => ({ classify: 0, inventory: 0, compiler: 0, descriptions: 0, accesses: 0, link: 0, decide: 0 });
const internal = (message: string): Error => Object.assign(new Error(message), { code: 'internal-error' });

/** A failure report shaped like a batch failure at the named stage. */
export function failureReport(state: SessionState, error: unknown, stage: StageId, inventory?: ProjectInventory | null): AnalysisReport {
  const draft = new ReportDraft(state.request);
  draft.registry = state.registry; draft.stage('registry', 'completed');
  if (inventory) draft.inventory(inventory);
  draft.failure(error, stage);
  return draft.finish();
}

/** Registry-derived areas of every module; issues make the parse stage invalid. */
export function deriveAreas(registry: ResolvedTagRegistry, inventory: ProjectInventory): { areas: SourceArea[]; issues: AnalysisDiagnostic[] } {
  const areas: SourceArea[] = [], issues: AnalysisDiagnostic[] = [];
  for (const module of inventory.modules) {
    const profiles = deriveSourceAreas(registry, module.id, module.areas.find(area => area.kind === 'ordinary')!.root, module.headerTags);
    if (profiles.status === 'valid') areas.push(...profiles.value);
    else issues.push(...profiles.issues.map(issue => diagnostic(issue.code, issue.message, 'registry', module.description.status === 'valid'
      ? [{ file: module.description.document.file, ...module.description.document.module.span }] : [])));
  }
  return { areas, issues };
}

/** Diagnostics of an invalid or incomplete acquisition, as the batch run records them. */
export async function acquisitionDiagnostics(parsed: ReadonlyMap<string, ParsedDescription>,
  inventory: ProjectInventory | null, issues: readonly ProjectIssue[]): Promise<AnalysisDiagnostic[]> {
  return projectDiagnostics(inventory, issues, parsed);
}

/** Facts of an invalid acquisition: no model, results or decisions. */
export function invalidFacts(state: SessionState, issues: readonly AnalysisDiagnostic[], inventory: ProjectInventory | null,
  inputs: readonly CapturedInput[] = []): SessionFacts {
  return deepFreeze({ registry: state.registry, invalid: { issues, inventory, inputs }, inventory: state.facts?.inventory ?? null,
    areas: [], areaIssues: [], files: {}, catalog: emptyCatalog, linked: null, linkIssues: [], model: null, decisions: {}, indexes: emptyIndexes });
}

/** A local invalid update has no current inventory. Capture the batch's invalid
 * envelope through the acquisition port, without running any source stage. */
export async function captureInvalidFacts(state: SessionState, signal?: AbortSignal): Promise<SessionFacts> {
  const parsed = new Map<string, ParsedDescription>();
  const acquired = await readProject({ request: state.request.project, limits: state.request.limits.acquisition,
    registry: state.registry.id, parse: (file, text) => {
      const result = parseDescription(file, text); parsed.set(file, result); return result;
    }, ...(signal ? { signal } : {}) });
  if (acquired.status === 'cancelled') throw cancelled();
  if (acquired.status === 'acquired') {
    await acquired.view.dispose();
    throw Object.assign(new Error('Invalid project changed during acquisition; retry the update'), { code: 'changed-input' });
  }
  if (acquired.status !== 'invalid' || !acquired.sealedInputs) {
    throw Object.assign(new Error(acquired.issues.map(issue => issue.message).join('; ')),
      { code: acquired.issues[0]?.code ?? 'read-failure' });
  }
  return invalidFacts(state, await acquisitionDiagnostics(parsed, acquired.inventory, acquired.issues), acquired.inventory, acquired.sealedInputs);
}

interface LinkOutcome {
  readonly linked: LinkedDescriptions;
  readonly model: Model | null;
  readonly issues: readonly AnalysisDiagnostic[];
}

/** Link and build the model over the assembled catalog, as the batch run does. */
function link(state: SessionState, inventory: ProjectInventory, catalog: SourceCatalog): LinkOutcome {
  const linked = linkDescriptions({ registry: state.registry, inventory, catalog });
  if (linked.status === 'invalid') {
    return { linked, model: null, issues: linked.issues.map(issue => diagnostic(issue.code, issue.message,
      issue.code === 'missing-export' ? 'missing-export' : 'description', issue.locations)) };
  }
  let pairs = 0;
  for (const selection of linked.selections) {
    pairs += selection.pairs.length;
    if (pairs > state.request.limits.maxExposurePairs) throw new WorkLimit('maxExposurePairs', state.request.limits.maxExposurePairs, pairs);
  }
  const model = buildModel(linked.modelInput);
  if (model.status === 'invalid') {
    return { linked, model: null, issues: model.issues.map(issue => diagnostic(issue.code, issue.message, 'description', issue.locations)) };
  }
  return { linked, model: model.value, issues: [] };
}

/** Decide the named accesses against the model; diagnostics are grouped per access. */
export async function decide(state: SessionState, model: Model, accesses: readonly SourceAccess[], signal?: AbortSignal): Promise<Record<string, AccessDecision>> {
  const decisions: Record<string, AccessDecision> = {};
  const produced = new Map<string, AnalysisDiagnostic[]>();
  const results: AccessResult[] = [];
  await evaluateAccessesAsync(model, accesses, state.request.limits.maxDiagnostics, {
    diagnostic: item => { const list = produced.get(item.accessId!) ?? []; list.push(item); produced.set(item.accessId!, list); },
    result: item => results.push(item),
    checkpoint: () => check(signal),
  });
  for (const result of results) decisions[result.accessId] = deepFreeze({ result, diagnostics: produced.get(result.accessId) ?? [] });
  return decisions;
}

type Interpreted = Awaited<ReturnType<AccessInterpreter['interpret']>>;

/** Per-file access facts from one interpretation of the named files. */
function fileAccessFacts(files: readonly string[], interpreted: Interpreted): Map<string, Omit<FileFacts, 'description'>> {
  const accesses = new Map<string, SourceAccess[]>(), coverage = new Map<string, SourceLimit[]>();
  const candidates = new Map(interpreted.candidates.map(entry => [entry.file, entry.paths]));
  const selected = new Set(files);
  for (const access of interpreted.accesses) {
    const list = accesses.get(access.location.file) ?? []; list.push(access); accesses.set(access.location.file, list);
  }
  for (const note of interpreted.coverage) {
    if (!selected.has(note.location.file)) throw internal(`Coverage note located outside the interpreted files: ${note.location.file}`);
    const list = coverage.get(note.location.file) ?? []; list.push(note); coverage.set(note.location.file, list);
  }
  return new Map(files.map(file => [file, { accesses: accesses.get(file) ?? [], coverage: coverage.get(file) ?? [], candidates: candidates.get(file) ?? [] }]));
}

/**
 * Whole recomputation over the warm compiler: the cold and broad paths, and
 * the audit's candidate. The adapter is created when the session has none and
 * recreated when the derived areas differ from the ones it was created with.
 */
export async function recomputeAll(state: SessionState, inventory: ProjectInventory, timings: PhaseTimings,
  signal?: AbortSignal): Promise<SessionFacts> {
  const derived = deriveAreas(state.registry, inventory);
  if (derived.issues.length) {
    return deepFreeze({ registry: state.registry, invalid: null, inventory, areas: [], areaIssues: derived.issues, files: {},
      catalog: emptyCatalog, linked: null, linkIssues: [], model: null, decisions: {}, indexes: emptyIndexes });
  }
  const observer = state.observer;
  if (!observer) throw internal('The session has no observer');
  let start = performance.now();
  const areasKey = JSON.stringify(derived.areas);
  if (state.adapter && state.adapterAreas !== areasKey) {
    const stale = state.adapter;
    state.adapter = null; state.adapterAreas = null;
    await stale.dispose();
  }
  if (!state.adapter) {
    check(signal);
    // The adapter carries the compiler API; loading it here keeps the batch
    // entry free of the compiler package until a session needs one.
    const { createRetainedSourceAnalysis } = await import('../subs/typescript/src/retained-source-analysis.js');
    state.adapter = await createRetainedSourceAnalysis({ root: inventory.scope.root, configuration: inventory.scope.configuration,
      inventory, areas: derived.areas, limits: state.request.limits.source, sink: observer.sink });
    state.adapterAreas = areasKey;
  }
  const adapter = state.adapter;
  timings.compiler += performance.now() - start;
  const owned = sortedPaths(inventory.files.map(file => file.path));
  start = performance.now();
  check(signal);
  const described = await adapter.describe(owned, signal);
  const catalog = adapter.catalog();
  timings.descriptions += performance.now() - start;
  start = performance.now();
  check(signal);
  const interpreted = await adapter.interpreter().interpret(owned, signal);
  const perFile = fileAccessFacts(owned, interpreted);
  timings.accesses += performance.now() - start;
  const descriptions = new Map(described.descriptions.map(description => [description.file, description]));
  const files: Record<string, FileFacts> = {};
  for (const path of owned) {
    const description = descriptions.get(path);
    if (!description) throw internal(`The whole description round returned no description for ${path}`);
    files[path] = deepFreeze({ description, ...perFile.get(path)! });
  }
  start = performance.now();
  const linked = link(state, inventory, catalog);
  timings.link += performance.now() - start;
  start = performance.now();
  check(signal);
  const decisions = linked.model ? await decide(state, linked.model, assembleAccesses(files), signal) : {};
  timings.decide += performance.now() - start;
  return deepFreeze({ registry: state.registry, invalid: null, inventory, areas: derived.areas, areaIssues: [], files, catalog,
    linked: linked.linked, linkIssues: linked.issues, model: linked.model, decisions, indexes: buildIndexes(files) });
}

export function wholeCheckedSet(path: RevisionPath, facts: SessionFacts): CheckedSet {
  return { path, files: sortedPaths(Object.keys(facts.files)), accesses: Object.keys(facts.decisions).length, modelRebuilt: facts.model !== null };
}

const inputIdentity = (input: CapturedInput): string => `${input.role}/${input.sha256}/${input.bytes}`;

/** Observed paths whose identity differs between two input lists. */
export function changedInputs(before: readonly CapturedInput[], after: readonly CapturedInput[]): string[] {
  const left = new Map(before.map(input => [input.path, inputIdentity(input)]));
  const right = new Map(after.map(input => [input.path, inputIdentity(input)]));
  const changed = new Set<string>();
  for (const [path, identity] of left) if (right.get(path) !== identity) changed.add(path);
  for (const path of right.keys()) if (!left.has(path)) changed.add(path);
  return sortedPaths(changed);
}

/** An original's parts other than its declaration positions. */
const originalSurface = (original: CatalogOriginal): string =>
  JSON.stringify({ id: original.id, origin: original.origin, hasValue: original.hasValue, hasType: original.hasType, declarations: original.declarations.map(at => at.file) });

/**
 * Replace the declaration evidence of moved originals inside the retained
 * model and its link input, without a relink. The decisions selecting those
 * originals are decided again by the caller so their evidence and diagnostic
 * identities match a fresh pass.
 */
function patchPositions(linked: LinkedDescriptions, model: Model, catalog: SourceCatalog, moved: ReadonlySet<string>): { linked: LinkedDescriptions; model: Model } {
  const fresh = new Map(catalog.originals.map(original => [originalKey(original.id), original]));
  const patchedModel: Model = deepFreeze({ ...model, originals: model.originals.map(original => {
    const key = originalKey(original.id);
    const current = fresh.get(key);
    return moved.has(key) && current ? { ...original, declarations: canonicalLocations(current.declarations) } : original;
  }) });
  if (linked.status !== 'valid') return { linked, model: patchedModel };
  const patchedLinked: LinkedDescriptions = deepFreeze({ ...linked, modelInput: { ...linked.modelInput,
    originals: linked.modelInput.originals.map(original => {
      const key = originalKey(original.id);
      const current = fresh.get(key);
      return moved.has(key) && current ? { ...original, declarations: current.declarations } : original;
    }) } });
  return { linked: patchedLinked, model: patchedModel };
}

/** Original keys whose record or exposure set differs between two models. */
function affectedOriginals(previous: Model, current: Model): Set<string> {
  const affected = new Set<string>();
  const records = (model: Model): Map<string, string> => new Map(model.originals.map(original => [originalKey(original.id), JSON.stringify(original)]));
  const exposures = (model: Model): Map<string, string> => {
    const grouped = new Map<string, string[]>();
    for (const exposure of model.exposures) {
      const key = originalKey(exposure.original);
      const list = grouped.get(key) ?? []; list.push(JSON.stringify(exposure)); grouped.set(key, list);
    }
    return new Map([...grouped].map(([key, list]) => [key, list.sort(byteOrder).join('\n')]));
  };
  for (const [left, right] of [[records(previous), records(current)], [exposures(previous), exposures(current)]] as const) {
    for (const [key, value] of left) if (right.get(key) !== value) affected.add(key);
    for (const key of right.keys()) if (!left.has(key)) affected.add(key);
  }
  return affected;
}

/** An exposure can affect importers anywhere that select an original inside
 * its module's subtree, as well as every access made inside that subtree. */
function descriptionAccesses(inventory: ProjectInventory, descriptions: readonly string[], accesses: readonly SourceAccess[]): Set<string> {
  if (!descriptions.length) return new Set();
  const paths = new Set(descriptions);
  const roots = new Set(inventory.modules.filter(module => module.description.status === 'valid'
    && paths.has(module.description.document.file)).map(module => module.id));
  const parents = new Map(inventory.modules.map(module => [module.id, module.parent]));
  const inside = (owner: string): boolean => {
    let current: string | null = owner;
    while (current !== null) {
      if (roots.has(current)) return true;
      current = parents.get(current) ?? null;
    }
    return false;
  };
  return new Set(accesses.filter(access => inside(access.importer.area.owner)
    || access.selections.some(selection => selection.original && inside(selection.original.owner))).map(access => access.id));
}

/**
 * The revision step. Classify the changes through the observer, then take the
 * metadata, description, unchanged-surface, source or broad path over the retained facts.
 */
export async function revise(state: SessionState, changes: readonly ObservedChange[], signal?: AbortSignal): Promise<StepResult> {
  const observer = state.observer;
  if (!observer) throw internal('The session has no observer');
  const timings = zeroTimings();
  let stage: StageId = 'acquisition';
  try {
    check(signal);
    let start = performance.now();
    const before = observer.inputs;
    const beforeId = observer.inputId;
    // A failed acquisition leaves the observer's last valid inventory in
    // place. Reconcile through its configuration boundary before trusting it
    // again, even if this request names only a source file or README.
    const reconcile = state.stale || state.facts?.invalid;
    const update = await observer.apply(reconcile
      ? [...changes, { path: observer.inventory.scope.configuration, kind: 'unknown' }]
      : changes, signal);
    timings.inventory = performance.now() - start;
    start = performance.now();
    if (update.kind === 'incomplete') {
      state.stale = true;
      const first = update.issues[0];
      const error = Object.assign(new Error(update.issues.map(issue => issue.message).join('; ')), { code: first?.code ?? 'read-failure', path: first?.path });
      return { status: 'reported', report: failureReport(state, error, 'acquisition', state.facts?.inventory) };
    }
    const after = observer.inputs;
    const changed = changedInputs(before, after);
    if (update.kind === 'invalid') {
      state.stale = true;
      timings.classify = performance.now() - start;
      start = performance.now();
      const facts = await captureInvalidFacts(state, signal);
      timings.inventory += performance.now() - start;
      if (state.facts?.invalid && JSON.stringify(state.facts.invalid) === JSON.stringify(facts.invalid)) return { status: 'identical' };
      return { status: 'computed', facts,
        checked: { path: 'broad', files: [], accesses: 0, modelRebuilt: false }, changed, timings, positionRefreshed: [] };
    }
    const unknown = changes.some(change => change.kind === 'unknown');
    if (!state.stale && state.adapter?.hot && (update.kind === 'unchanged' || (!changed.length && observer.inputId === beforeId))) return { status: 'identical' };
    const inventory = observer.inventory;
    const owned = new Set(inventory.files.map(file => file.path));
    const previous = state.facts;
    const local = update.kind === 'local' ? update : null;
    const ownedChanged = local ? local.changed.filter(path => owned.has(path)) : [];
    const otherChanged = local ? local.changed.filter(path => !owned.has(path)) : [];
    const explained = new Set(local ? [...local.changed, ...local.readmes, ...local.descriptions, ...local.created, ...local.deleted] : []);
    // A created or deleted file changes the membership of every directory
    // between it and the root; those observations are explained by it.
    for (const path of [...(local?.created ?? []), ...(local?.deleted ?? [])]) {
      for (let directory = dirname(path); directory !== '.' && directory !== '/'; directory = dirname(directory)) explained.add(directory);
    }
    const unexplained = changed.filter(path => !explained.has(path));
    const structural = update.kind === 'structural';
    const descriptions = local?.descriptions ?? [];
    const shims = new Set(Object.values(previous?.files ?? {}).flatMap(file => file.description.dependencies.shims));
    const shimChanged = ownedChanged.some(path => shims.has(path));
    const areasChanged = descriptions.length > 0 && previous
      && JSON.stringify(deriveAreas(state.registry, inventory).areas) !== JSON.stringify(previous.areas);
    const broad = state.stale || !state.adapter || !state.adapter.hot || !previous || previous.invalid !== null || previous.areaIssues.length > 0
      || unknown || structural || areasChanged || shimChanged || otherChanged.length > 0 || unexplained.length > 0
      || (local !== null && (local.created.length > 0 || local.deleted.length > 0));
    timings.classify = performance.now() - start;

    if (!broad && local && !ownedChanged.length && !descriptions.length) {
      // Metadata only: purposes changed, nothing the compiler, the link or a
      // decision reads. The facts keep everything but the inventory.
      const facts = deepFreeze({ ...previous!, inventory });
      return { status: 'computed', facts, checked: { path: 'metadata', files: [], accesses: 0, modelRebuilt: false }, changed, timings, positionRefreshed: [] };
    }

    if (!broad && descriptions.length && !ownedChanged.length) {
      stage = 'link';
      start = performance.now();
      const outcome = link(state, inventory, previous!.catalog);
      timings.link = performance.now() - start;
      stage = 'decide';
      start = performance.now();
      const accesses = assembleAccesses(previous!.files);
      const selected = descriptionAccesses(inventory, descriptions, accesses);
      const targets = outcome.model ? accesses.filter(access => selected.has(access.id) || !previous!.decisions[access.id]) : [];
      const decisions: Record<string, AccessDecision> = outcome.model ? { ...previous!.decisions } : {};
      if (outcome.model && targets.length) Object.assign(decisions, await decide(state, outcome.model, targets, signal));
      timings.decide = performance.now() - start;
      const facts = deepFreeze({ ...previous!, inventory, linked: outcome.linked, model: outcome.model, linkIssues: outcome.issues, decisions });
      return { status: 'computed', facts, checked: { path: 'description', files: [], accesses: targets.length, modelRebuilt: outcome.model !== null },
        changed, timings, positionRefreshed: [] };
    }

    if (broad) {
      stage = 'catalog';
      start = performance.now();
      if (state.adapter) {
        // Created and deleted files enter the program by name; a whole
        // invalidation is a separate update so neither hides the other.
        const oldFiles = new Set(previous?.inventory?.files.map(file => file.path));
        const created = [...owned].filter(path => !oldFiles.has(path));
        const deleted = [...oldFiles].filter(path => !owned.has(path));
        await state.adapter.update({ changed: state.stale ? [...owned] : ownedChanged, created, deleted,
          inventory, invalidateAll: false }, signal);
        if (state.stale || unknown || structural || shimChanged || otherChanged.length > 0 || unexplained.length > 0) {
          await state.adapter.update({ changed: [], created: [], deleted: [], inventory: null, invalidateAll: true }, signal);
        }
      }
      timings.compiler = performance.now() - start;
      const facts = await recomputeAll(state, inventory, timings, signal);
      state.stale = false;
      return { status: 'computed', facts, checked: wholeCheckedSet('broad', facts), changed, timings, positionRefreshed: [] };
    }

    // The source side: one compiler update, the description closure, the
    // affected importers, the model when the link input changed, then the
    // decisions the change reaches.
    const adapter = state.adapter!;
    const facts = previous!;
    stage = 'catalog';
    start = performance.now();
    await adapter.update({ changed: ownedChanged, created: [], deleted: [], inventory: null, invalidateAll: false }, signal);
    timings.compiler = performance.now() - start;
    start = performance.now();
    const described = await adapter.describe(ownedChanged, signal);
    const delta = described.delta;
    const catalog = adapter.catalog();
    timings.descriptions = performance.now() - start;
    const files: Record<string, FileFacts> = { ...facts.files };
    for (const description of described.descriptions) {
      const current = files[description.file];
      if (!current) throw internal(`Described a file with no retained facts: ${description.file}`);
      files[description.file] = deepFreeze({ ...current, description });
    }

    stage = 'access';
    start = performance.now();
    const reinterpret = new Set<string>(ownedChanged);
    for (const target of delta.changed) for (const importer of facts.indexes.importers[target] ?? []) reinterpret.add(importer);
    // A note that cites a position inside a file whose declarations only moved
    // carries the old position; its file is read again.
    for (const target of delta.moved) {
      for (const importer of facts.indexes.importers[target] ?? []) {
        if (facts.files[importer]?.coverage.some(note => note.related.some(at => at.file === target))) reinterpret.add(importer);
      }
    }
    const interpretedFiles = sortedPaths(reinterpret);
    const interpreted = await adapter.interpreter().interpret(interpretedFiles, signal);
    const perFile = fileAccessFacts(interpretedFiles, interpreted);
    for (const path of interpretedFiles) files[path] = deepFreeze({ ...files[path]!, ...perFile.get(path)! });
    timings.accesses = performance.now() - start;
    const unchangedSurface = interpretedFiles.every(path => ownedChanged.includes(path))
      && ownedChanged.every(path => !delta.changed.includes(path) && accessSurface(facts.files[path]!) === accessSurface(files[path]!));

    stage = 'link';
    start = performance.now();
    const previousOriginals = new Map(facts.catalog.originals.map(original => [originalKey(original.id), original]));
    const currentOriginals = new Map(catalog.originals.map(original => [originalKey(original.id), original]));
    const changedKeys = delta.changedOriginals.map(originalKey);
    const movedOriginals = new Set(changedKeys.filter(key => {
      const earlier = previousOriginals.get(key), current = currentOriginals.get(key);
      return !!earlier && !!current && originalSurface(earlier) === originalSurface(current);
    }));
    const rebuild = descriptions.length > 0 || facts.model === null || delta.changed.length > 0 || delta.removedOriginals.length > 0
      || changedKeys.some(key => !movedOriginals.has(key));
    let { linked, model, linkIssues } = facts;
    if (rebuild) {
      const outcome = link(state, inventory, catalog);
      linked = outcome.linked; model = outcome.model; linkIssues = outcome.issues;
    } else if (movedOriginals.size && linked && model) {
      ({ linked, model } = patchPositions(linked, model, catalog, movedOriginals));
    }
    timings.link = performance.now() - start;

    stage = 'decide';
    start = performance.now();
    const indexes = buildIndexes(files);
    const decisions: Record<string, AccessDecision> = {};
    const positionRefreshed: string[] = [];
    let decided = 0;
    if (model) {
      const decideIds = new Set<string>();
      const previousAccess = new Map<string, string>();
      for (const path of interpretedFiles) for (const access of facts.files[path]?.accesses ?? []) previousAccess.set(access.id, JSON.stringify(access));
      const ordered = assembleAccesses(files);
      for (const id of descriptionAccesses(inventory, descriptions, ordered)) decideIds.add(id);
      const byId = new Map(ordered.map(access => [access.id, access]));
      for (const path of interpretedFiles) {
        for (const access of files[path]!.accesses) if (previousAccess.get(access.id) !== JSON.stringify(access)) decideIds.add(access.id);
      }
      let all = facts.model === null;
      if (rebuild && facts.model) {
        if (JSON.stringify(facts.model.modules) !== JSON.stringify(model.modules)) all = true;
        else for (const key of affectedOriginals(facts.model, model)) for (const id of facts.indexes.selectors[key] ?? []) decideIds.add(id);
      }
      const selected = all ? new Set(byId.keys()) : new Set([...decideIds].filter(id => byId.has(id)));
      for (const key of movedOriginals) for (const id of indexes.selectors[key] ?? []) if (!selected.has(id)) { selected.add(id); positionRefreshed.push(id); }
      for (const access of ordered) {
        const retained = facts.decisions[access.id];
        if (!selected.has(access.id) && retained) decisions[access.id] = retained;
      }
      const refreshed = new Set(positionRefreshed);
      const targets = ordered.filter(access => selected.has(access.id) || !decisions[access.id]);
      decided = targets.filter(access => !refreshed.has(access.id)).length;
      if (targets.length) Object.assign(decisions, await decide(state, model, targets, signal));
    }
    timings.decide = performance.now() - start;
    const path: RevisionPath = model && unchangedSurface && !descriptions.length ? 'unchanged-surface' : 'source';
    const next: SessionFacts = deepFreeze({ registry: state.registry, invalid: null, inventory, areas: facts.areas, areaIssues: [], files, catalog,
      linked, linkIssues, model, decisions, indexes });
    return { status: 'computed', facts: next, checked: { path, files: interpretedFiles, accesses: decided, modelRebuilt: rebuild },
      changed, timings, positionRefreshed: sortedPaths(positionRefreshed) };
  } catch (error) {
    // The compiler or the facts may have advanced past the published
    // revision; the next update recomputes everything from the disk.
    state.stale = true;
    if (isCancellation(error, signal)) return { status: 'cancelled' };
    return { status: 'reported', report: failureReport(state, error, stage, state.facts?.inventory) };
  }
}
