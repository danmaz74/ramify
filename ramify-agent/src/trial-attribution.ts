import type { HarnessLineIdentities } from '../subs/harness/src/kpi/delivered.js';

export interface SetupLineIdentityInput {
  readonly runId: string;
  readonly base: string;
  readonly final: string;
  /** Complete ordered first-parent chain, including BASE first and FINAL last. */
  readonly firstParentCommits: readonly string[] | null;
  readonly records: readonly RecordedSetupDelta[];
  /** Complete direct-diff origin/remover partitions; unavailable identity is a caller-level failure. */
  readonly candidates: readonly SetupCandidatePartition[];
  readonly facts: readonly SetupLineMappingFacts[];
}
export interface SetupCandidatePartition { readonly commit: string; readonly path: string; readonly kind: 'added' | 'deleted' }
export interface RecordedSetupDelta {
  readonly id: string; readonly runId: string; readonly path: string;
  readonly beforeRevision: string; readonly commit: string;
  readonly beforeBlobHash: string | null; readonly afterBlobHash: string | null;
  readonly added: readonly SetupSourceLine[] | null; readonly deleted: readonly SetupSourceLine[] | null;
}
/** SHA-256 of exact UTF-8 line bytes including LF when present, retaining CR and missing EOF LF. */
export interface SetupSourceLine { readonly line: number; readonly hash: string }
export interface SetupLineMappingFacts {
  readonly recordId: string; readonly base: string; readonly final: string;
  readonly beforeRevision: string; readonly commit: string;
  readonly beforeBlobHash: string | null; readonly afterBlobHash: string | null;
  readonly sourceAdded: readonly SetupSourceLine[] | null; readonly sourceDeleted: readonly SetupSourceLine[] | null;
  readonly beforePath: string | null; readonly afterPath: string | null;
  /** Complete direct changed-line ranges, not samples; null includes binary/unreadable/incomplete facts. */
  readonly finalAdded: readonly SetupAddedLineFact[] | null;
  readonly baseDeleted: readonly SetupDeletedLineFact[] | null;
}
export interface SetupAddedLineFact {
  readonly line: number; readonly hash: string; readonly originCommit: string;
  readonly originPath: string; readonly originLine: number; readonly boundary: boolean;
}
export interface SetupDeletedLineFact {
  readonly line: number; readonly hash: string; readonly lastSeenCommit: string;
  readonly sourceBeforePath: string; readonly sourceBeforeLine: number | null; readonly removingCommit: string | null;
}

type Kind = SetupCandidatePartition['kind'];
type Partition = { readonly commit: string; readonly path: string; readonly kind: Kind; value: Set<number> | null };
const present = (value: string) => typeof value === 'string' && value.length > 0;
const position = (value: number) => Number.isSafeInteger(value) && value > 0;
const hash = (value: string | null) => value === null || /^[a-f0-9]{64}$/.test(value);
const path = (value: string | null): value is string => typeof value === 'string' && value.length > 0 && !/[\\\0]/.test(value) && !value.startsWith('/') && !/^[A-Za-z]:/.test(value) && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
const key = (commit: string, file: string, kind: Kind) => JSON.stringify([commit, file, kind]);
function sources(values: readonly SetupSourceLine[] | null): values is readonly SetupSourceLine[] {
  return values !== null && new Set(values.map(value => value.line)).size === values.length && values.every(value => position(value.line) && typeof value.hash === 'string' && hash(value.hash));
}
function equalSources(left: readonly SetupSourceLine[] | null, right: readonly SetupSourceLine[] | null) {
  if (!sources(left) || !sources(right) || left.length !== right.length) return false;
  const byLine = new Map(left.map(value => [value.line, value.hash]));
  return right.every(value => byLine.get(value.line) === value.hash);
}

/** Verifies supplied identities, never guesses Git lineage or grants a path/commit exemption.
 * Collectors authenticate blobs, exact repository-prefix conversion and full range coverage.
 * Invalid candidate identity throws so callers retain attribution unavailable, rather than [].
 */
export function verifySetupLineIdentities(input: SetupLineIdentityInput): HarnessLineIdentities {
  if (!present(input.runId) || !present(input.base) || !present(input.final)) throw new Error('Setup attribution requires run and revision identities');
  const partitions = new Map<string, Partition>();
  for (const candidate of input.candidates) {
    if (!present(candidate.commit) || !path(candidate.path) || !['added', 'deleted'].includes(candidate.kind)) throw new Error('Setup attribution candidate identity unavailable');
    partitions.set(key(candidate.commit, candidate.path, candidate.kind), { ...candidate, value: new Set() });
  }
  const chain = input.firstParentCommits;
  const validChain = chain !== null && chain[0] === input.base && chain.at(-1) === input.final && chain.every(present) && new Set(chain).size === chain.length;
  const index = (commit: string) => validChain ? chain!.indexOf(commit) : -1;
  const counts = new Map<string, number>();
  for (const record of input.records) counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
  const unknown = (record: RecordedSetupDelta, facts: readonly SetupLineMappingFacts[], kind: Kind) => {
    const files = new Set([record.path, ...facts.flatMap(fact => [fact.beforePath, fact.afterPath])].filter(path));
    const relevant = [...partitions.values()].filter(partition => partition.kind === kind && files.has(partition.path));
    // A missing rename/path relation cannot falsely prove zero setup contribution.
    const targets = relevant.length ? relevant : [...partitions.values()].filter(partition => partition.kind === kind);
    for (const partition of targets) if (index(record.commit) < 0 || partition.commit === record.commit) partition.value = null;
  };
  const set = (record: RecordedSetupDelta, file: string, kind: Kind, values: readonly number[]) => {
    const partition = partitions.get(key(record.commit, file, kind));
    if (values.length && !partition) throw new Error('Setup attribution direct-diff partition missing');
    if (partition?.value) for (const value of values) partition.value.add(value);
  };
  for (const record of input.records) {
    const matching = input.facts.filter(fact => fact.recordId === record.id);
    const fact = matching.length === 1 ? matching[0]! : null;
    const before = index(record.beforeRevision); const containing = index(record.commit);
    const bound = counts.get(record.id) === 1 && present(record.id) && record.runId === input.runId && path(record.path) && before >= 0 && containing >= before &&
      fact !== null && fact.base === input.base && fact.final === input.final && fact.beforeRevision === record.beforeRevision && fact.commit === record.commit &&
      hash(record.beforeBlobHash) && hash(record.afterBlobHash) && record.beforeBlobHash === fact.beforeBlobHash && record.afterBlobHash === fact.afterBlobHash &&
      (fact.beforePath === null || path(fact.beforePath)) && (fact.afterPath === null || path(fact.afterPath));
    if (!bound || fact === null) { unknown(record, matching, 'added'); unknown(record, matching, 'deleted'); continue; }
    for (const kind of ['added', 'deleted'] as const) {
      const source = kind === 'added' ? record.added : record.deleted;
      const observedSource = kind === 'added' ? fact.sourceAdded : fact.sourceDeleted;
      const blob = kind === 'added' ? record.afterBlobHash : record.beforeBlobHash;
      if (!equalSources(source, observedSource) || (source!.length > 0 && blob === null)) { unknown(record, matching, kind); continue; }
      const byLine = new Map(source!.map(value => [value.line, value.hash]));
      if (kind === 'added') {
        const rows = fact.finalAdded;
        if (rows === null || new Set(rows.map(row => row.line)).size !== rows.length || (rows.length > 0 && !path(fact.afterPath))) { unknown(record, matching, kind); continue; }
        const verified: number[] = []; let invalid = false;
        for (const row of rows) {
          if (path(fact.afterPath) && present(row.originCommit) && !partitions.has(key(row.originCommit, fact.afterPath, kind))) throw new Error('Setup attribution direct-diff partition missing');
          if (!position(row.line) || typeof row.hash !== 'string' || !hash(row.hash) || index(row.originCommit) < 0 ||
              !partitions.has(key(row.originCommit, fact.afterPath!, kind))) { invalid = true; break; }
          if (row.originCommit !== record.commit) continue;
          if (!position(row.originLine) || !path(row.originPath) || row.boundary !== false || row.originPath !== record.path) { invalid = true; break; }
          const expected = byLine.get(row.originLine);
          if (expected === undefined) continue; // Other same-commit lines retain writer attribution.
          if (expected !== row.hash) { invalid = true; break; }
          verified.push(row.line);
        }
        if (invalid) unknown(record, matching, kind); else if (fact.afterPath !== null) set(record, fact.afterPath, kind, verified);
      } else {
        const rows = fact.baseDeleted;
        if (rows === null || new Set(rows.map(row => row.line)).size !== rows.length || (rows.length > 0 && !path(fact.beforePath))) { unknown(record, matching, kind); continue; }
        const verified: number[] = []; let invalid = false;
        for (const row of rows) {
          const last = index(row.lastSeenCommit);
          const remover = last < 0 ? undefined : chain![last + 1];
          if (path(fact.beforePath) && remover !== undefined && !partitions.has(key(remover, fact.beforePath, kind))) throw new Error('Setup attribution direct-diff partition missing');
          if (!position(row.line) || typeof row.hash !== 'string' || !hash(row.hash) || remover === undefined || row.removingCommit !== remover ||
              !partitions.has(key(remover, fact.beforePath!, kind))) { invalid = true; break; }
          if (remover !== record.commit) continue;
          if (!path(row.sourceBeforePath) || !position(row.sourceBeforeLine!) || row.sourceBeforePath !== record.path) { invalid = true; break; }
          const expected = byLine.get(row.sourceBeforeLine!);
          if (expected === undefined) continue;
          if (expected !== row.hash) { invalid = true; break; }
          verified.push(row.line);
        }
        if (invalid) unknown(record, matching, kind); else if (fact.beforePath !== null) set(record, fact.beforePath, kind, verified);
      }
    }
  }
  const entries = new Map<string, { commit: string; path: string; added: readonly number[] | null; deleted: readonly number[] | null }>();
  for (const partition of partitions.values()) {
    const identity = JSON.stringify([partition.commit, partition.path]);
    const entry = entries.get(identity) ?? { commit: partition.commit, path: partition.path, added: [], deleted: [] };
    entry[partition.kind] = partition.value === null ? null : [...partition.value].sort((a, b) => a - b);
    entries.set(identity, entry);
  }
  return { base: input.base, final: input.final, entries: [...entries.values()] };
}
