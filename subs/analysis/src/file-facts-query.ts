import type { CapturedInput } from '../subs/project/src/interfaces/project.js';
import type { SourceLimit } from '../subs/typescript/src/interfaces/source.js';
import type { AffectedPathSeed, FileStructuralFact, FileStructuralFacts } from './interfaces/affected.js';
import { byteOrder, locatedOrder } from './report.js';
import { accessTargets } from './session-facts.js';
import type { SessionFacts } from './session-facts.js';

/** These forms can hide a target anywhere in the analyzed project. Their notes
 * remain in the ordinary coverage result unless they refer to a requested file. */
const incompleteIncoming = new Set<SourceLimit['code']>(['unresolved-target', 'nonliteral-target', 'unsupported-loader',
  'unsupported-commonjs', 'shared-global', 'compiler-blocked']);

/** Project a batch of already validated paths from retained facts; no compiler or filesystem reads. */
export function projectFileFacts(facts: SessionFacts, seeds: readonly AffectedPathSeed[], inputs: readonly CapturedInput[],
  auxiliarySource: (path: string) => boolean): FileStructuralFacts {
  const notes = new Map<string, SourceLimit>();
  for (const note of facts.catalog.coverage) notes.set(note.id, note);
  for (const file of Object.values(facts.files)) {
    for (const note of [...file.description.coverage, ...file.coverage]) notes.set(note.id, note);
  }
  for (const note of facts.companions.coverage) notes.set(note.id, note);
  const partial = [...notes.values()].some(note => incompleteIncoming.has(note.code));
  const inventoried = new Set(facts.inventory?.files.map(file => file.path));
  const observed = new Map(inputs.filter(input => input.role !== 'directory').map(input => [input.path, input]));
  const requested = new Set(seeds.map(seed => seed.path));
  const incoming = new Map<string, Set<string>>();
  const incomingNotes = new Map<string, Set<string>>();
  const depend = (target: string, importer: string, coverage: readonly string[] = []): void => {
    if (!requested.has(target) || target === importer) return;
    const paths = incoming.get(target) ?? new Set<string>();
    paths.add(importer); incoming.set(target, paths);
    const ids = incomingNotes.get(target) ?? new Set<string>();
    for (const id of coverage) ids.add(id);
    incomingNotes.set(target, ids);
  };
  for (const [path, file] of Object.entries(facts.files)) {
    for (const access of file.accesses) {
      const targets = new Set(accessTargets(access));
      for (const target of targets) depend(target, path, access.coverageIds);
    }
    for (const dependency of [...file.description.dependencies.files, ...file.description.dependencies.resources,
      ...file.description.dependencies.shims]) depend(dependency, path);
  }
  const locatedNotes = new Map<string, Set<string>>();
  for (const note of notes.values()) {
    for (const location of [note.location, ...note.related]) {
      if (!requested.has(location.file)) continue;
      const ids = locatedNotes.get(location.file) ?? new Set<string>();
      ids.add(note.id); locatedNotes.set(location.file, ids);
    }
  }
  const files = seeds.map((seed): FileStructuralFact => {
    const { path, status, module, exclusion } = seed;
    const retained = facts.files[path];
    const observation = observed.get(path);
    const analyzed = status === 'owned' && exclusion === null;
    // A complete inventory includes every admitted compiler source under an owned path.
    const missingSource = analyzed && !inventoried.has(path) && auxiliarySource(path);
    const existence = inventoried.has(path) || retained || observation && observation.role !== 'absent' ? 'present'
      : observation?.role === 'absent' || missingSource ? 'missing' : 'unknown';
    const description = analyzed ? retained?.description.exports : undefined;
    const reason = status === 'outside-project' ? 'outside-project' : exclusion !== null ? 'excluded'
      : existence === 'missing' ? 'missing-file' : 'not-analyzed';
    const exports: FileStructuralFact['exports'] = description
      ? { state: description.state, hasExports: description.exports.length ? true : description.state === 'complete' ? false : null,
        names: description.exports.map(item => item.name).sort(byteOrder) }
      : { state: 'unavailable', hasExports: null, names: null, reason };
    const ids = new Set([...locatedNotes.get(path) ?? [], ...incomingNotes.get(path) ?? []]);
    const limits = [...ids].flatMap(id => { const note = notes.get(id); return note ? [note] : []; }).sort(locatedOrder);
    const available = analyzed && !!retained;
    return { path, status, module, exclusion, existence, exports,
      incoming: { state: available ? partial ? 'partial' : 'complete' : 'unavailable',
        paths: available ? [...incoming.get(path) ?? []].sort(byteOrder) : null }, limits };
  });
  return { schemaVersion: 'ramify.file-facts/1', files };
}
