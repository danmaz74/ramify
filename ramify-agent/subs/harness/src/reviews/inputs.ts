import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import type { CandidateSource } from '../../subs/evidence/src/git.js';
import { anchorOf } from '../analysis/submission.js';
import { canonicalJson } from '../jobs/commands.js';
import { resolveSnapshotPath, type CandidateSnapshot } from './snapshot.js';

/*
 * The captured inputs of the scope and design questions, each named with
 * the hash of its bytes so a request binds exactly what its reviewer was
 * given. Scope reads the plan excerpts its assignment cites; design reads a
 * small selection of guidance from the audited candidate itself, so the
 * guidance and the code it judges are one snapshot.
 */

/** One captured input as its reviewer receives it: the reference, the hash of its text, and the text. */
export interface CapturedInput {
  readonly ref: string;
  readonly hash: string;
  readonly text: string;
}

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex');

/** A plan reference as an assignment holds it. */
export interface PlanReference {
  readonly anchor?: string | undefined;
  readonly lines?: readonly [number, number] | undefined;
}

/**
 * The text of each plan reference in the captured plan: a heading's section
 * up to the next heading of its level or above, or a line range. A
 * reference the plan does not hold is left out; the assignment was
 * validated against the same plan, so none is expected.
 */
export function planExcerpts(plan: string, references: readonly PlanReference[]): CapturedInput[] {
  const lines = plan.split('\n');
  const excerpts: CapturedInput[] = [];
  for (const reference of references) {
    let text: string | undefined;
    let ref: string;
    if (reference.anchor !== undefined) {
      ref = `plan#${anchorOf(reference.anchor)}`;
      const start = lines.findIndex(line => {
        const heading = /^(#{1,6})\s+(.*?)\s*$/u.exec(line);
        return heading !== null && anchorOf(heading[2]!) === anchorOf(reference.anchor!);
      });
      if (start >= 0) {
        const level = headingLevel(lines[start]!)!;
        let end = start + 1;
        while (end < lines.length && (headingLevel(lines[end]!) ?? Number.POSITIVE_INFINITY) > level) end += 1;
        text = lines.slice(start, end).join('\n').trim();
      }
    } else if (reference.lines !== undefined) {
      const [from, to] = reference.lines;
      ref = `plan:${from}-${to}`;
      if (from >= 1 && to >= from && to <= lines.length) text = lines.slice(from - 1, to).join('\n').trim();
    } else {
      continue;
    }
    if (text !== undefined && !excerpts.some(entry => entry.ref === ref)) excerpts.push({ ref, hash: hashOf(text), text });
  }
  return excerpts;
}

function headingLevel(line: string): number | null {
  const heading = /^(#{1,6})\s/u.exec(line);
  return heading === null ? null : heading[1]!.length;
}

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
