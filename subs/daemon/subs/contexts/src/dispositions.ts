import type { SessionRevision } from '../../../../analysis/src/interfaces/session.js';
import type { CapturedInput, PathOwnership, ProjectExclusion, ProjectScope } from '../../../../analysis/subs/project/src/interfaces/project.js';
import type { ExpectedContent, PathCheckDisposition } from './interfaces/contexts.js';

/** Project's classifier, supplied through `AnalysisDriver.classify`; contexts has no other. */
export type Classify = (scope: ProjectScope, path: string) => PathOwnership;
type NotAnalyzed = Extract<PathCheckDisposition, { readonly disposition: 'not-analyzed' }>;
type NotChecked = Extract<PathCheckDisposition, { readonly disposition: 'not-checked' }>;
/** One named path classified at a revision: analyzed paths need their content; the
 * others carry their final disposition already. */
export type PathClass =
  | { readonly kind: 'analyzed'; readonly path: string; readonly module: string }
  | { readonly kind: 'settled'; readonly disposition: NotAnalyzed | NotChecked };

const emptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const readRoles: ReadonlySet<CapturedInput['role']> = new Set(['description', 'readme', 'source', 'resource', 'configuration']);
const indexes = new WeakMap<SessionRevision, ReadonlyMap<string, CapturedInput>>();

/** A revision's captured inputs by path, directories left out; built once per revision. */
export function inputIndex(data: SessionRevision): ReadonlyMap<string, CapturedInput> {
  let index = indexes.get(data);
  if (!index) {
    const built = new Map<string, CapturedInput>();
    for (const input of data.inputs) if (input.role !== 'directory' && !built.has(input.path)) built.set(input.path, input);
    indexes.set(data, index = built);
  }
  return index;
}

/** An input whose bytes an analysis stage read. An existence probe or a listed entry's
 * kind is recorded without bytes and identified by kind and path only; an absence or a
 * directory holds no content. */
export function analysisInput(input: CapturedInput | undefined): boolean {
  if (!input) return false;
  if (readRoles.has(input.role)) return true;
  return input.role === 'dependency' && (input.bytes > 0 || input.sha256 === emptySha256);
}

function notAnalyzedReason(exclusion: ProjectExclusion): NotAnalyzed['reason'] {
  if (exclusion.kind === 'owned-ignored' || exclusion.kind === 'external' || exclusion.kind === 'scratch') return exclusion.kind;
  return 'reserved';
}

/**
 * Classify each named path by containment under `scope`, before any content rule: an
 * owned path outside every exclusion is analyzed and needs its content; a path in an
 * owned-ignored, external or scratch directory or another always-excluded path is
 * not analyzed. Work is one classifier call per path.
 */
export function classifyPaths(classify: Classify, scope: ProjectScope, paths: readonly string[]): PathClass[] {
  return paths.map((path): PathClass => {
    const owner = classify(scope, path);
    if (owner.status === 'owned' && !owner.exclusion) return { kind: 'analyzed', path, module: owner.module };
    if (owner.status === 'owned' || owner.status === 'excluded') {
      const exclusion = owner.exclusion!;
      return { kind: 'settled', disposition: { path, disposition: 'not-analyzed', module: owner.module, exclusion, reason: notAnalyzedReason(exclusion) } };
    }
    // Validation admits no path outside the root or malformed; one is never checked.
    return { kind: 'settled', disposition: { path, disposition: 'not-checked', module: null, exclusion: null, reason: 'unobserved-input' } };
  });
}

/** True when `expect` names exactly the analyzed paths: the client's expectations follow this classification. */
export function follows(classes: readonly PathClass[], expect: readonly ExpectedContent[]): boolean {
  const analyzed = classes.filter(item => item.kind === 'analyzed');
  if (analyzed.length !== expect.length) return false;
  const named = new Set(expect.map(item => item.path));
  return analyzed.every(item => named.has(item.path));
}

/** The classification a `classification-changed` answer carries. */
export function classification(classes: readonly PathClass[]): PathCheckDisposition[] {
  return classes.map(item => item.kind === 'settled' ? item.disposition
    : { path: item.path, disposition: 'not-checked', module: item.module, exclusion: null, reason: 'classification-changed' });
}

/**
 * Each named path's disposition at the deciding revision `data`, whose classification
 * the expectations follow. An analyzed path is checked when the revision read its
 * expected content, or observed it absent as expected; a deleted path the context saw
 * analyzed in an earlier revision is checked by its removal. `captured` says the paths
 * were re-observed by a capture since the request arrived: only then does an analyzed
 * path that is not an analysis input of the revision prove an owned non-source file.
 */
export function decide(classes: readonly PathClass[], expect: readonly ExpectedContent[], data: SessionRevision,
  captured: boolean, removed: ReadonlyMap<string, number>): PathCheckDisposition[] {
  const expected = new Map(expect.map(item => [item.path, item.sha256]));
  const index = inputIndex(data);
  return classes.map((item): PathCheckDisposition => {
    if (item.kind === 'settled') return item.disposition;
    const { path, module } = item;
    const sha256 = expected.get(path) ?? null;
    const input = index.get(path);
    const notChecked = (reason: NotChecked['reason']): NotChecked => ({ path, disposition: 'not-checked', module, exclusion: null, reason });
    if (input && analysisInput(input)) return sha256 === input.sha256
      ? { path, disposition: 'checked', module, exclusion: null, reason: 'content', sha256 } : notChecked('superseded');
    if (input?.role === 'absent') return sha256 === null
      ? { path, disposition: 'checked', module, exclusion: null, reason: 'deleted', sha256: null } : notChecked('superseded');
    if (!captured) return notChecked('unobserved-input');
    // A kind observation states that the path exists, which an absent expectation contradicts.
    if (input) return sha256 === null ? notChecked('superseded')
      : { path, disposition: 'not-analyzed', module, exclusion: null, reason: 'owned-non-source' };
    if (sha256 === null && removed.has(path)) return { path, disposition: 'checked', module, exclusion: null, reason: 'deleted', sha256: null };
    return { path, disposition: 'not-analyzed', module, exclusion: null, reason: 'owned-non-source' };
  });
}

/** Every named path not checked: the deciding revision has no ownership table to classify by. */
export function unclassified(paths: readonly string[]): PathCheckDisposition[] {
  return paths.map(path => ({ path, disposition: 'not-checked', module: null, exclusion: null, reason: 'unobserved-input' }));
}

/** Analysis inputs of `previous` that `next` no longer holds as analysis inputs, recorded
 * in `removed` at `sequence`; paths `next` analyzes leave it. At most `bound` entries are
 * kept, oldest dropped first. */
export function recordRemovals(removed: Map<string, number>, previous: SessionRevision, next: SessionRevision,
  sequence: number, bound: number): void {
  const index = inputIndex(next);
  for (const path of [...removed.keys()]) if (analysisInput(index.get(path))) removed.delete(path);
  for (const input of previous.inputs) {
    if (!analysisInput(input) || analysisInput(index.get(input.path))) continue;
    removed.delete(input.path); removed.set(input.path, sequence);
  }
  while (removed.size > bound) removed.delete(removed.keys().next().value!);
}
