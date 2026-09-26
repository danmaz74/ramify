import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import type { CandidateSource } from '../../subs/evidence/src/git.js';
import { canonicalJson } from '../jobs/commands.js';
import { resolveSnapshotPath, type CandidateSnapshot } from './snapshot.js';

/*
 * The captured inputs of the scope and design questions, each named with
 * the hash of its bytes so a request binds exactly what its reviewer was
 * given. Design reads a small selection of guidance from the audited
 * candidate itself, so the guidance and the code it judges are one snapshot.
 * Code and scope read the assignment package, which the request cites by
 * its element and deviation IDs.
 */

/** One captured input as its reviewer receives it: the reference, the hash of its text, and the text. */
export interface CapturedInput {
  readonly ref: string;
  readonly hash: string;
  readonly text: string;
}

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The bounds of one design review's guidance selection. */
export const guidanceLimits = { files: 12, fileBytes: 64 * 1024, totalBytes: 192 * 1024 } as const;

/**
 * The guidance a design review of this candidate is given, by path, in
 * order: every principles document the candidate holds (`*.principles.md`),
 * then the `README.md` of each directory on the way to a changed path, the
 * module prose of what changed and of its ancestors. A generated view, a
 * symbolic link and a file larger than one read are never guidance. The
 * selection stops at the bounds; it is deliberately small, since design is
 * judged against what applies, not against every document.
 */
export function guidancePaths(snapshot: CandidateSnapshot): string[] {
  const principles = [...snapshot.entries.keys()]
    .filter(path => posix.basename(path).endsWith('.principles.md'))
    .sort();
  const readmes = new Set<string>();
  for (const change of snapshot.changes) {
    for (let directory = posix.dirname(change.path); ; directory = posix.dirname(directory)) {
      const path = directory === '.' ? 'README.md' : `${directory}/README.md`;
      if (snapshot.entries.has(path)) readmes.add(path);
      if (directory === '.' || directory === '') break;
    }
  }
  const selected: string[] = [];
  let total = 0;
  for (const path of [...principles, ...[...readmes].sort()]) {
    if (selected.length >= guidanceLimits.files || selected.includes(path)) continue;
    const resolved = resolveSnapshotPath(snapshot, path);
    if (!resolved.ok || resolved.kind !== 'file' || resolved.entry.kind !== 'file') continue;
    const bytes = resolved.entry.bytes ?? 0;
    if (bytes > guidanceLimits.fileBytes || total + bytes > guidanceLimits.totalBytes) continue;
    total += bytes;
    selected.push(path);
  }
  return selected;
}

/** The selected guidance, read from the candidate's objects, each with the hash of its bytes. */
export async function readGuidance(source: CandidateSource, projectRoot: string, snapshot: CandidateSnapshot, signal?: AbortSignal): Promise<CapturedInput[]> {
  const paths = guidancePaths(snapshot);
  const texts = await Promise.all(paths.map(path => source.readBlob(projectRoot, snapshot.commit, path, signal)));
  return paths.map((path, index) => ({ ref: path, hash: hashOf(texts[index]!), text: texts[index]! }));
}

/**
 * The key of a design orientation: the guidance selection and its hashes,
 * the question, the reviewer's prompt package and the executor that runs
 * it. Any change to one of them is another orientation, never a reuse.
 */
export function orientationKey(inputs: {
  readonly guidance: ReadonlyArray<{ readonly ref: string; readonly hash: string }>;
  readonly packageHash: string | null;
  readonly agent: string;
  readonly model: string | null;
  readonly context: unknown;
}): string {
  return hashOf(canonicalJson({
    question: 'design',
    guidance: inputs.guidance.map(entry => ({ ref: entry.ref, hash: entry.hash })),
    package: inputs.packageHash,
    agent: inputs.agent,
    model: inputs.model,
    context: inputs.context ?? null,
  }));
}
