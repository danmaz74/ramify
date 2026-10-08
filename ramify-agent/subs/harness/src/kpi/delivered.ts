import type { ChangeHistory, LineCommit } from '../../subs/evidence/src/git.js';
import type { LineEventSummary } from '../run/records.js';

/*
 * The change weight `w_e` of each writer invocation: its share of the run's
 * delivered change (docs/measurements-and-kpis.md, "Changed lines").
 *
 * The delivered change is the direct diff from the run's base to its last
 * accepted commit. A line written, rewritten or reverted along the way is
 * counted once, in that diff, and a change made and undone is not in it, so
 * it counts nowhere. Work no gate accepted is not in it either.
 *
 * Each added line goes to the commit Git blames it on, and each deleted base
 * line to the commit that removed it, the successor of the last commit that
 * still held it. A commit the harness made, and a path only the harness
 * writes, is never a writer's. A commit goes to the writer invocations whose
 * work it holds; where several share one, as an engineer and its repair in
 * one gate commit, each path's lines are split by the writers' recorded
 * per-path increases. A line no writer can be named for stays unattributed
 * with its reason, never assigned to a writer by guesswork.
 *
 * Binary paths carry no lines. This is a projection over the run's records
 * and the repository's history; nothing is written.
 */

export interface DeliveredChangeRequest {
  readonly projectRoot: string;
  /** The commit the run started from. */
  readonly base: string;
  /** The run's last accepted commit. */
  readonly final: string;
  /** Each commit a gate made, with the writer invocations whose work it holds, in the order they started. */
  readonly writers: ReadonlyMap<string, readonly string[]>;
  /** The commits the harness made itself: scratch setup and feature-file materialization and rewording. */
  readonly harness: ReadonlySet<string>;
  /** Paths only the harness writes, such as the run's feature files, whose pending tags a gate commit drops. */
  readonly harnessPaths: ReadonlySet<string>;
  /** Each writer's recorded line events, which split a commit several writers share; null where none can be read. */
  readonly recorded: ReadonlyMap<string, LineEventSummary | null>;
  /** Verified surviving setup lines: additions in final, deletions in base, with their origin/removing commit. */
  readonly harnessDeltas?: HarnessLineIdentities;
  /** Paths whose simultaneous writer contributions cannot be separated reliably. */
  readonly overlappingPaths?: ReadonlySet<string>;
  readonly signal?: AbortSignal | undefined;
}

/** Owner-local producer seam. The producer verifies mappings against these exact revisions.
 * Null means a mapping is unknown; [] means verified no surviving setup lines of that kind.
 * Counts or source-commit line numbers cannot substitute for final/base positions.
 */
export interface HarnessLineIdentities {
  readonly base: string;
  readonly final: string;
  readonly entries: readonly {
    readonly commit: string;
    readonly path: string;
    readonly added: readonly number[] | null;
    readonly deleted: readonly number[] | null;
  }[];
}

export type DeliveredChange =
  | { readonly state: 'not-applicable'; readonly reason: string }
  | { readonly state: 'unavailable'; readonly reason: string }
  | {
      readonly state: 'measured';
      readonly base: string;
      readonly final: string;
      /** `w_e` of each writer the delivered change names; a writer absent here delivered nothing. */
      readonly weights: ReadonlyMap<string, number>;
      /** Delivered lines no writer can be named for, by reason. */
      readonly unattributed: ReadonlyMap<string, number>;
      /** Delivered lines the harness made: in its own commits or in paths only it writes. */
      readonly harness: number;
      /** Paths whose change is binary, which carries no line weight. */
      readonly binaryPaths: readonly string[];
    };

/** The lines one commit contributed to one path of the delivered change. */
interface Tally { added: number; deleted: number }

export async function deliveredChange(history: ChangeHistory, request: DeliveredChangeRequest): Promise<DeliveredChange> {
  if (request.final === request.base) return { state: 'not-applicable', reason: 'No commit was accepted after the run base' };
  if (request.writers.size === 0) return { state: 'not-applicable', reason: 'No gate committed a writer\'s work' };
  const { projectRoot, base, final, signal } = request;
  const unattributed = new Map<string, number>();
  const unattribute = (reason: string, lines = 1) => unattributed.set(reason, (unattributed.get(reason) ?? 0) + lines);
  const byCommit = new Map<string, Map<string, Tally>>();
  const tally = (commit: string, path: string, kind: keyof Tally) => {
    const paths = byCommit.get(commit) ?? new Map<string, Tally>();
    const entry = paths.get(path) ?? { added: 0, deleted: 0 };
    entry[kind] += 1;
    paths.set(path, entry);
    byCommit.set(commit, paths);
  };
  let harness = 0;
  const setupLine = (commit: string, path: string, kind: keyof Tally, line: number): boolean => {
    if (request.harness.has(commit)) return false; // Exclusive setup commit already has exact commit attribution.
    const mapping = request.harnessDeltas;
    const entries = mapping?.entries.filter(entry => entry.commit === commit && entry.path === path) ?? [];
    if (entries.length === 0) return false;
    const positions = entries.flatMap(entry => entry[kind] ?? []);
    const unknown = mapping!.base !== base || mapping!.final !== final || entries.some(entry => entry[kind] === null) ||
      positions.some(position => !Number.isInteger(position) || position < 1) || !Number.isInteger(line) || line < 1;
    if (unknown) {
      unattribute(`setup line mapping unavailable for ${commit.slice(0, 12)} ${path} ${kind}: exact final/base revision-bound identities required`);
      return true;
    }
    if (!positions.includes(line)) return false;
    harness += 1;
    return true;
  };
  const binaryPaths: string[] = [];

  try {
    const order = [base, ...await history.commitsBetween(projectRoot, base, final, signal)];
    for (const file of await history.changedFiles(projectRoot, base, final, signal)) {
      const path = file.after ?? file.before!;
      if (file.binary) { binaryPaths.push(path); continue; }
      const lines = (ranges: typeof file.added) => ranges.reduce((total, [, count]) => total + count, 0);
      if ((file.after !== null && request.harnessPaths.has(file.after)) || (file.before !== null && request.harnessPaths.has(file.before))) {
        harness += lines(file.added) + lines(file.deleted);
        continue;
      }
      if (file.after !== null && file.added.length > 0) {
        const origins = await history.lineOrigins(projectRoot, base, final, file.after, file.added, signal);
        for (const origin of origins) {
          if (origin.boundary) unattribute('Git blames an added line on the base or earlier');
          else if (!setupLine(origin.commit, file.after, 'added', origin.line)) tally(origin.commit, file.after, 'added');
        }
        unanswered(lines(file.added), origins, 'Git named no commit for an added line', unattribute);
      }
      if (file.before !== null && file.deleted.length > 0) {
        const seen = await history.lineLastSeen(projectRoot, base, final, file.before, file.deleted, signal);
        for (const last of seen) {
          // The commit that removed a base line is the one after the last that held it.
          const index = order.indexOf(last.commit);
          const removing = index >= 0 && index < order.length - 1 ? order[index + 1]! : null;
          if (removing === null) unattribute('Git names no commit of the range that removed a deleted line');
          else if (!setupLine(removing, file.before, 'deleted', last.line)) tally(removing, file.before, 'deleted');
        }
        unanswered(lines(file.deleted), seen, 'Git named no commit for a deleted line', unattribute);
      }
    }
  } catch (error) {
    return { state: 'unavailable', reason: `The delivered change could not be read from Git: ${error instanceof Error ? error.message : String(error)}` };
  }

  const weights = new Map<string, number>();
  const add = (writer: string, lines: number) => weights.set(writer, (weights.get(writer) ?? 0) + lines);
  for (const [commit, paths] of byCommit) {
    const originalTotal = [...paths.values()].reduce((sum, entry) => sum + entry.added + entry.deleted, 0);
    if (request.harness.has(commit)) { harness += originalTotal; continue; }
    const owners = request.writers.get(commit) ?? [];
    if (owners.length === 0) { unattribute(`commit ${commit.slice(0, 12)} holds no recorded writer's work`, originalTotal); continue; }
    // An explicit uncertain overlap applies even when only one writer was
    // recorded. Preserve other paths rather than attributing an unknown
    // external/unfinished writer's contribution to that recorded writer.
    for (const [path, entry] of paths) {
      if (!request.overlappingPaths?.has(path) && !owners.some(writer => request.recorded.get(writer)?.gaps.some(gap => gap.startsWith('overlapping-writers:')))) continue;
      unattribute(`commit ${commit.slice(0, 12)} has uncertain overlapping writer attribution in ${path}`, entry.added + entry.deleted);
      paths.delete(path);
    }
    const total = [...paths.values()].reduce((sum, entry) => sum + entry.added + entry.deleted, 0);
    if (total === 0) continue;
    if (owners.length === 1) { add(owners[0]!, total); continue; }
    const unreadable = owners.filter(writer => (request.recorded.get(writer) ?? null) === null);
    if (unreadable.length > 0) {
      unattribute(`commit ${commit.slice(0, 12)} holds the work of ${owners.join(', ')}, and the line events of ${unreadable.join(', ')} cannot be read`, total);
      continue;
    }
    for (const [path, entry] of paths) {
      if (owners.some(writer => request.recorded.get(writer)!.gaps.some(gap => gap.startsWith('changed-paths-unknown:')))) {
        unattribute(`commit ${commit.slice(0, 12)} has uncertain overlapping writer attribution in ${path}`, entry.added + entry.deleted);
        continue;
      }
      for (const kind of ['added', 'deleted'] as const) {
        if (entry[kind] === 0) continue;
        const shares = owners.map(writer => request.recorded.get(writer)!.paths.find(recorded => recorded.path === path)?.[kind] ?? 0);
        const sum = shares.reduce((total, share) => total + share, 0);
        if (sum === 0) {
          unattribute(`commit ${commit.slice(0, 12)} holds the work of ${owners.join(', ')}, and none recorded a line ${kind} in ${path}`, entry[kind]);
          continue;
        }
        owners.forEach((writer, index) => { if (shares[index]! > 0) add(writer, entry[kind] * shares[index]! / sum); });
      }
    }
  }
  return { state: 'measured', base, final, weights, unattributed, harness, binaryPaths: binaryPaths.sort() };
}

/** Lines Git was asked about and did not answer for, which stay unattributed rather than vanish. */
function unanswered(asked: number, answered: readonly LineCommit[], reason: string, unattribute: (reason: string, lines: number) => void): void {
  if (answered.length < asked) unattribute(reason, asked - answered.length);
}

/**
 * A history whose answers are kept, keyed by their arguments: commit ids do
 * not change what they name, so a run's delivered change is read from Git
 * once however often its metrics are asked for. A failed answer is not
 * kept, and the oldest answers are dropped beyond `limit`.
 */
export function cachedChangeHistory(history: ChangeHistory, limit = 512): ChangeHistory {
  const answers = new Map<string, Promise<unknown>>();
  const kept = <T>(key: unknown[], read: () => Promise<T>): Promise<T> => {
    const id = JSON.stringify(key);
    const known = answers.get(id);
    if (known !== undefined) return known as Promise<T>;
    const answer = read();
    answers.set(id, answer);
    answer.catch(() => answers.delete(id));
    while (answers.size > limit) answers.delete(answers.keys().next().value!);
    return answer;
  };
  return {
    commitsBetween: (root, from, to, signal) => kept(['commits', root, from, to], () => history.commitsBetween(root, from, to, signal)),
    changedFiles: (root, from, to, signal) => kept(['files', root, from, to], () => history.changedFiles(root, from, to, signal)),
    lineOrigins: (root, from, to, path, ranges, signal) => kept(['origins', root, from, to, path, ranges], () => history.lineOrigins(root, from, to, path, ranges, signal)),
    lineLastSeen: (root, from, to, path, ranges, signal) => kept(['seen', root, from, to, path, ranges], () => history.lineLastSeen(root, from, to, path, ranges, signal)),
  };
}
