import { relative } from 'node:path';
import type { LinkedDescriptions } from '../subs/descriptions/src/interfaces/linking.js';
import { originalKey } from '../subs/model/src/index.js';
import type { Model, ResolvedTagRegistry, SourceArea, SourceLocation } from '../subs/model/src/interfaces/model.js';
import type { CapturedInput, ProjectInventory } from '../subs/project/src/interfaces/project.js';
import type { FileDescription, SourceAccess, SourceCatalog, SourceLimit } from '../subs/typescript/src/interfaces/source.js';
import type { CompanionOutputs } from './companion-findings.js';
import type { AccessResult, AnalysisDiagnostic, AnalysisInputs } from './interfaces/analysis.js';
import { ReportDraft, byteOrder } from './report.js';
import type { SnapshotCounts } from './report.js';

/**
 * Retained facts of one session: per-file export descriptions and access
 * facts, the assembled catalog, the linked model and per-access decisions,
 * with the reverse indexes an update follows. Everything here is frozen plain
 * data; compiler objects never enter it.
 */
export interface FileFacts {
  readonly description: FileDescription;
  /** This file's accesses in the order a whole pass lists them. */
  readonly accesses: readonly SourceAccess[];
  /** Access coverage notes located in this file. */
  readonly coverage: readonly SourceLimit[];
  readonly candidates: readonly string[];
}
export interface AccessDecision {
  readonly result: AccessResult;
  /** Diagnostics of this access in production order. */
  readonly diagnostics: readonly AnalysisDiagnostic[];
}
export interface FactIndexes {
  /** Owned file whose description an access read, to the files holding those accesses. */
  readonly importers: Readonly<Record<string, readonly string[]>>;
  /** Original key to the accesses whose selections resolved to it. */
  readonly selectors: Readonly<Record<string, readonly string[]>>;
  /** Access id to the file holding it. */
  readonly owners: Readonly<Record<string, string>>;
  /**
   * Observation path, relative to the root, to the owned files contributing it:
   * each file's own path, its candidates and its description dependencies. Keys
   * and files are in byte order; a path outside the root keeps its relative spelling.
   */
  readonly contributors: Readonly<Record<string, readonly string[]>>;
}
/** An invalid acquisition: the batch run records its issues and, when it has one, the inventory. */
export interface InvalidAcquisition {
  readonly issues: readonly AnalysisDiagnostic[];
  readonly inventory: ProjectInventory | null;
  readonly inputs: readonly CapturedInput[];
  /** A description failed to parse. Any other invalid acquisition leaves the parse stage blocked. */
  readonly parseInvalid: boolean;
}
export interface SessionFacts {
  readonly registry: ResolvedTagRegistry;
  readonly invalid: InvalidAcquisition | null;
  /** The last valid inventory; null when none was ever acquired. */
  readonly inventory: ProjectInventory | null;
  readonly areas: readonly SourceArea[];
  /** Registry diagnostics of area derivation; a non-empty list is an invalid parse stage. */
  readonly areaIssues: readonly AnalysisDiagnostic[];
  readonly files: Readonly<Record<string, FileFacts>>;
  readonly catalog: SourceCatalog;
  readonly linked: LinkedDescriptions | null;
  /** Description diagnostics of an invalid link or model. */
  readonly linkIssues: readonly AnalysisDiagnostic[];
  readonly model: Model | null;
  readonly decisions: Readonly<Record<string, AccessDecision>>;
  /** The signature-companion findings and notes of `model`; empty without a model. */
  readonly companions: CompanionOutputs;
  readonly indexes: FactIndexes;
}

export const emptyIndexes: FactIndexes = Object.freeze({ importers: Object.freeze({}), selectors: Object.freeze({}), owners: Object.freeze({}),
  contributors: Object.freeze({}) });
export const emptyCatalog: SourceCatalog = Object.freeze({ originals: Object.freeze([]), files: Object.freeze([]), coverage: Object.freeze([]) });

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function sortedPaths(paths: Iterable<string>): string[] {
  return [...new Set(paths)].sort(byteOrder);
}

const accessOrder = (a: SourceAccess, b: SourceAccess): number => byteOrder(a.location.file, b.location.file) || a.location.start - b.location.start
  || (a.selections[0]?.location.start ?? 0) - (b.selections[0]?.location.start ?? 0) || byteOrder(a.id, b.id);

/** Accesses of every file in the order a whole pass lists them. */
export function assembleAccesses(files: Readonly<Record<string, FileFacts>>): SourceAccess[] {
  return Object.values(files).flatMap(file => file.accesses).sort(accessOrder);
}

/** Access coverage of every file, deduplicated by identity in the batch order. */
export function assembleCoverage(files: Readonly<Record<string, FileFacts>>): SourceLimit[] {
  const notes = new Map<string, SourceLimit>();
  for (const file of Object.values(files)) for (const note of file.coverage) if (!notes.has(note.id)) notes.set(note.id, note);
  return [...notes.values()].sort((a, b) => byteOrder(a.location.file, b.location.file) || a.location.start - b.location.start || byteOrder(a.id, b.id));
}

/** The owned files an access's facts read: its target and every forwarding hop. */
export function accessTargets(access: SourceAccess): string[] {
  const targets = new Set<string>();
  if (access.target.kind === 'application') targets.add(access.target.origin.file);
  for (const selection of access.selections) for (const origin of selection.forwarding) targets.add(origin.file);
  return [...targets];
}

/** The observation paths one file contributes, relative to the root. A description
 * names a dependency outside the root as `external:<absolute path>`. */
function contributions(root: string, path: string, file: FileFacts): string[] {
  const local = (dependency: string): string => dependency.startsWith('external:') ? relative(root, dependency.slice('external:'.length)) : dependency;
  const { files, resources, shims, absent } = file.description.dependencies;
  return [path, ...file.candidates, ...[...files, ...resources, ...shims, ...absent].map(local)];
}

export function buildIndexes(files: Readonly<Record<string, FileFacts>>, root: string): FactIndexes {
  const importers = new Map<string, Set<string>>();
  const selectors = new Map<string, Set<string>>();
  const contributors = new Map<string, Set<string>>();
  const owners: Record<string, string> = {};
  for (const [path, file] of Object.entries(files)) {
    for (const observation of contributions(root, path, file)) {
      let set = contributors.get(observation);
      if (!set) { set = new Set(); contributors.set(observation, set); }
      set.add(path);
    }
    for (const access of file.accesses) {
      owners[access.id] = path;
      for (const target of accessTargets(access)) {
        let set = importers.get(target);
        if (!set) { set = new Set(); importers.set(target, set); }
        set.add(path);
      }
      for (const selection of access.selections) {
        if (!selection.original) continue;
        const key = originalKey(selection.original);
        let set = selectors.get(key);
        if (!set) { set = new Set(); selectors.set(key, set); }
        set.add(access.id);
      }
    }
  }
  const record = (map: Map<string, Set<string>>): Record<string, readonly string[]> =>
    Object.fromEntries([...map].map(([key, set]) => [key, sortedPaths(set)]));
  return deepFreeze({ importers: record(importers), selectors: record(selectors), owners,
    contributors: Object.fromEntries([...contributors].sort(([a], [b]) => byteOrder(a, b)).map(([key, set]) => [key, sortedPaths(set)])) });
}

const plainString = /^[\x20\x21\x23-\x5b\x5d-\x7e]*$/;
/** UTF-8 length of a string's JSON serialization. */
const stringBytes = (value: string): number => plainString.test(value) ? value.length + 2 : Buffer.byteLength(JSON.stringify(value));
const numberBytes = (value: number): number => Number.isFinite(value) ? String(value).length : 4;
/** Each ledger entry packs an object's own bytes, below 2^32, and its reference count. */
const countSpan = 2 ** 21;

/**
 * An object's own serialized bytes: its brackets, separators, keys and
 * primitive members, with each object or array member contributing nothing,
 * since that member is counted as an object of its own. Summed over every
 * object of an unshared tree, this equals the tree's JSON length.
 */
function ownBytes(value: object, children: object[]): number {
  let bytes = 2, members = 0;
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) {
      if (members++) bytes++;
      if (typeof item === 'object' && item !== null) children.push(item);
      else bytes += typeof item === 'string' ? stringBytes(item) : typeof item === 'number' ? numberBytes(item)
        : typeof item === 'boolean' ? (item ? 4 : 5) : 4;
    }
    return bytes;
  }
  for (const key in value) {
    const item = (value as Record<string, unknown>)[key];
    let size: number;
    if (typeof item === 'object') { size = item === null ? 4 : 0; if (item !== null) children.push(item); }
    else if (typeof item === 'string') size = stringBytes(item);
    else if (typeof item === 'number') size = numberBytes(item);
    else if (typeof item === 'boolean') size = item ? 4 : 5;
    else continue;
    if (members++) bytes++;
    bytes += stringBytes(key) + 1 + size;
  }
  return bytes;
}

/**
 * Retained-fact accounting by object identity. Every distinct object reachable
 * from the retained roots counts its own serialized bytes once, however many
 * roots and parents refer to it. Facts are frozen, so an object's bytes and
 * members never change while it is counted. Retaining a root visits only the
 * objects not yet counted; releasing one visits only the objects it alone
 * kept, by reference counts over the acyclic facts.
 */
export class FactLedger {
  readonly #entries = new Map<object, number>();
  /** References beyond the packed count's range, for an object referred to that often. */
  readonly #overflow = new Map<object, number>();
  #total = 0;

  /** Bytes of every distinct object the retained roots reach. */
  get total(): number { return this.#total; }

  /** Count `root` as retained once more; returns the bytes it added. */
  retain(root: object): number {
    const entries = this.#entries, pending: object[] = [root];
    let added = 0;
    while (pending.length) {
      const value = pending.pop()!;
      const entry = entries.get(value);
      if (entry !== undefined) {
        if (entry % countSpan < countSpan - 1) entries.set(value, entry + 1);
        else this.#overflow.set(value, (this.#overflow.get(value) ?? 0) + 1);
        continue;
      }
      const bytes = ownBytes(value, pending);
      entries.set(value, bytes * countSpan + 1);
      added += bytes;
    }
    this.#total += added;
    return added;
  }

  /** Release one retention of `root`; returns the bytes no retained root reaches any longer. */
  release(root: object): number {
    const entries = this.#entries, pending: object[] = [root];
    let freed = 0;
    while (pending.length) {
      const value = pending.pop()!;
      const entry = entries.get(value);
      if (entry === undefined) throw new Error('Released facts were not retained');
      const extra = this.#overflow.get(value);
      if (extra !== undefined) { if (extra > 1) this.#overflow.set(value, extra - 1); else this.#overflow.delete(value); continue; }
      if (entry % countSpan > 1) { entries.set(value, entry - 1); continue; }
      entries.delete(value);
      freed += Math.floor(entry / countSpan);
      if (Array.isArray(value)) { for (const item of value as unknown[]) if (typeof item === 'object' && item !== null) pending.push(item); }
      else for (const key in value) {
        const item = (value as Record<string, unknown>)[key];
        if (typeof item === 'object' && item !== null) pending.push(item);
      }
    }
    this.#total -= freed;
    return freed;
  }

  clear(): void { this.#entries.clear(); this.#overflow.clear(); this.#total = 0; }
}

/**
 * Retained size of one fact set: the serialized bytes of its distinct
 * objects, each counted once however often the facts refer to it.
 */
export function factBytes(facts: SessionFacts): number {
  return new FactLedger().retain(facts);
}

const place = (location: SourceLocation): string => location.file;

/** Position-insensitive identity of one file's access facts. */
export function accessSurface(file: FileFacts): string {
  return JSON.stringify({
    accesses: file.accesses.map(access => ({
      file: access.location.file, importer: access.importer, specifier: access.specifier, form: access.form,
      selectionForm: access.selectionForm, runtimeLoad: access.runtimeLoad, target: access.target,
      selections: access.selections.map(selection => ({ file: selection.location.file, exportedName: selection.exportedName,
        localName: selection.localName, original: selection.original, request: selection.request,
        explicitType: selection.explicitType, forwarding: selection.forwarding, status: selection.status })),
      coverage: access.coverageIds.length,
    })),
    coverage: file.coverage.map(note => ({ code: note.code, message: note.message, compilerCode: note.compilerCode ?? null,
      file: note.location.file, related: note.related.map(place) })),
    candidates: file.candidates,
  });
}

/** Position-insensitive identity of one finding, for the position-only delta. */
export function diagnosticSurface(item: AnalysisDiagnostic): string {
  return JSON.stringify({ category: item.category, code: item.code, message: item.message, file: item.location?.file ?? null,
    related: item.related.map(place), importer: item.importer, original: item.original });
}

/** The model's canonical declaration list for one original: unique, ordered. */
export function canonicalLocations(values: readonly SourceLocation[]): SourceLocation[] {
  const unique = new Map<string, SourceLocation>();
  for (const { file, start, end, line, column } of values) {
    const value = { file, start, end, line, column };
    unique.set(JSON.stringify(value), value);
  }
  return [...unique.values()].sort((a, b) => byteOrder(a.file, b.file) || a.start - b.start || a.end - b.end || a.line - b.line || a.column - b.column);
}

/** All diagnostics of the facts in the order a batch run records them. */
export function recordedDiagnostics(facts: SessionFacts, accesses: readonly SourceAccess[]): AnalysisDiagnostic[] {
  if (facts.invalid) return [...facts.invalid.issues];
  if (facts.areaIssues.length) return [...facts.areaIssues];
  if (facts.linkIssues.length || !facts.model) return [...facts.linkIssues];
  return [...accesses.flatMap(access => facts.decisions[access.id]?.diagnostics ?? []), ...facts.companions.diagnostics];
}

/**
 * Drive one report draft from the retained facts exactly as `runAnalysis`
 * drives it from a batch run. `finish()` on the result yields the report.
 */
export function draftReport(facts: SessionFacts, request: AnalysisInputs, inputs: readonly CapturedInput[],
  inputId: string | null): ReportDraft {
  const draft = driveReport(facts, request, true);
  if (facts.invalid) return draft;
  draft.patch({ inputs: [...inputs].sort((a, b) => byteOrder(a.path, b.path) || byteOrder(a.role, b.role)) });
  draft.inputId = inputId;
  return draft;
}

/**
 * Drive the same stages, findings and limits without building a snapshot:
 * the draft records only the summary counts a snapshot would yield.
 * `publication()` on the result yields what a published revision keeps.
 */
export function draftPublication(facts: SessionFacts, request: AnalysisInputs): ReportDraft {
  return driveReport(facts, request, false);
}

function driveReport(facts: SessionFacts, request: AnalysisInputs, snapshot: boolean): ReportDraft {
  const draft = new ReportDraft(request);
  draft.registry = facts.registry; draft.stage('registry', 'completed');
  draft.current = 'acquisition';
  if (facts.invalid) {
    if (facts.invalid.inventory) draft.inventory(facts.invalid.inventory, snapshot);
    draft.record(facts.invalid.issues);
    draft.stage('acquisition', 'invalid', draft.diagnostics);
    // The batch run marks the parse invalid only where a description failed to
    // parse. A description diagnostic of a validated layout, such as an
    // exposure statement whose source file is missing, leaves parse blocked.
    if (facts.invalid.parseInvalid) {
      draft.stage('parse', 'invalid', draft.diagnostics.filter(item => item.category === 'description'));
    }
    draft.execution = 'invalid';
    draft.current = 'report';
    return draft;
  }
  if (!facts.inventory) throw new Error('Valid session facts require an inventory');
  draft.inventory(facts.inventory, snapshot);
  draft.stage('acquisition', 'completed'); draft.stage('parse', 'completed'); draft.current = 'parse';
  if (snapshot) draft.patch({ areas: facts.areas });
  if (facts.areaIssues.length) {
    draft.record(facts.areaIssues);
    draft.stage('parse', 'invalid', draft.diagnostics); draft.execution = 'invalid';
  } else {
    draft.current = 'catalog';
    if (snapshot) draft.patch({ catalog: facts.catalog });
    else draft.counts = { ...draft.counts!, originals: facts.catalog.originals.length };
    draft.cover(facts.catalog.coverage.filter(note => note.code !== 'resource-description'
      || facts.inventory!.references.some(reference => reference.normalized === note.location.file)));
    draft.stage('catalog', 'completed');
    draft.current = 'link';
    if (facts.linked && snapshot) draft.patch({ linked: facts.linked });
    if (facts.linkIssues.length || !facts.model) {
      draft.record(facts.linkIssues);
      draft.stage('link', 'invalid', draft.diagnostics); draft.execution = 'invalid';
    } else {
      if (snapshot) draft.patch({ model: facts.model });
      draft.stage('link', 'completed'); draft.current = 'access';
      if (snapshot) {
        const accesses = assembleAccesses(facts.files);
        draft.patch({ accesses }); draft.cover(assembleCoverage(facts.files)); draft.stage('access', 'completed');
        draft.current = 'decide';
        const results = accesses.map(access => {
          const decision = facts.decisions[access.id];
          if (!decision) throw new Error(`Retained facts hold no decision for access ${access.id}`);
          return decision.result;
        });
        draft.patch({ results });
        draft.record(recordedDiagnostics(facts, accesses));
        draft.cover(facts.companions.coverage);
      } else {
        draft.cover(assembleCoverage(facts.files)); draft.stage('access', 'completed');
        draft.current = 'decide';
        draft.counts = { ...draft.counts!, ...decisionCounts(facts) };
        draft.record(decidedDiagnostics(facts));
        draft.record(facts.companions.diagnostics);
        draft.cover(facts.companions.coverage);
      }
      draft.stage('decide', 'completed', draft.diagnostics); draft.execution = 'completed';
    }
  }
  draft.current = 'report';
  return draft;
}

/** The access, decision and external counts a snapshot's accesses and results yield, without listing them. */
function decisionCounts(facts: SessionFacts): Pick<SnapshotCounts, 'accesses' | 'allowed' | 'denied' | 'external'> {
  let accesses = 0, allowed = 0, denied = 0, external = 0;
  for (const file of Object.values(facts.files)) {
    for (const access of file.accesses) {
      const decision = facts.decisions[access.id];
      if (!decision) {
        // Name the first missing access in the order a whole pass reports it.
        const missing = assembleAccesses(facts.files).find(item => !facts.decisions[item.id])!;
        throw new Error(`Retained facts hold no decision for access ${missing.id}`);
      }
      accesses++;
      if (decision.result.outcome === 'external') external++;
      for (const item of decision.result.decisions) {
        if (item.status === 'allowed') allowed++;
        else if (item.status === 'denied') denied++;
      }
    }
  }
  return { accesses, allowed, denied, external };
}

/**
 * Decision diagnostics in the order `recordedDiagnostics` lists them, sorting
 * only the accesses that have any: a stable sort keeps the relative order a
 * sort of every access gives them.
 */
function decidedDiagnostics(facts: SessionFacts): AnalysisDiagnostic[] {
  const found = Object.values(facts.files).flatMap(file => file.accesses.filter(access => facts.decisions[access.id]!.diagnostics.length));
  return found.sort(accessOrder).flatMap(access => facts.decisions[access.id]!.diagnostics);
}
