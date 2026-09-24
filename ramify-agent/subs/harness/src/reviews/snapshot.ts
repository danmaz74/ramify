import { posix } from 'node:path';
import { z } from 'zod';
import type { JsonSchema, ToolDefinition, ToolResult } from '../../subs/agent/src/interfaces/port.js';
import type { CandidateSource, TreeEntry } from '../../subs/evidence/src/git.js';

/*
 * A reviewer's only view of the project: one audited candidate, served from
 * Git's objects, and its diff from the iteration's base. Nothing here reads
 * the working directory, so a later writer changing the live tree, or a
 * newer generated view, cannot reach the reviewer, and there is no path a
 * tool resolves outside the candidate.
 *
 * Every path an agent names is resolved here before anything is read: an
 * absolute path, one that climbs out, one into `.git` or into a generated
 * view, one through a symbolic link, and one the candidate does not hold are
 * refused with the reason, and the refusal is the tool's error result. A
 * symbolic link is never followed; its target may be anywhere.
 */

/** One changed entry of the candidate diff, as `git diff --name-status` names it. */
export interface CandidateChange {
  readonly status: string;
  readonly path: string;
}

/** One audited candidate and its diff from the iteration's base. */
export interface CandidateSnapshot {
  readonly commit: string;
  readonly base: string;
  readonly tree: string;
  /** Every entry of the candidate's tree by path. */
  readonly entries: ReadonlyMap<string, TreeEntry>;
  /** Every directory the tree implies, the root as `''`. */
  readonly directories: ReadonlySet<string>;
  readonly changes: readonly CandidateChange[];
}

/** Opens the candidate `commit` with its diff from `base`, from the source alone. */
export async function openCandidateSnapshot(
  source: CandidateSource,
  projectRoot: string,
  candidate: { readonly commit: string; readonly base: string },
): Promise<CandidateSnapshot> {
  const [tree, listed, changes] = await Promise.all([
    source.commitTree(projectRoot, candidate.commit),
    source.treeEntries(projectRoot, candidate.commit),
    source.diffNameStatus(projectRoot, candidate.base, candidate.commit),
  ]);
  const entries = new Map(listed.map(entry => [entry.path, entry]));
  const directories = new Set<string>(['']);
  for (const path of entries.keys()) {
    for (let parent = posix.dirname(path); parent !== '.' && !directories.has(parent); parent = posix.dirname(parent)) directories.add(parent);
  }
  return { commit: candidate.commit, base: candidate.base, tree, entries, directories, changes: [...changes] };
}

/** Why a path was refused. */
export type SnapshotDenial = 'invalid' | 'absolute' | 'outside' | 'repository' | 'live-view' | 'symlink' | 'missing';

/** A path the snapshot resolved: a file or a directory of the candidate. */
export type SnapshotPath =
  | { readonly ok: true; readonly path: string; readonly kind: 'file'; readonly entry: TreeEntry }
  | { readonly ok: true; readonly path: string; readonly kind: 'directory' }
  | { readonly ok: false; readonly denial: SnapshotDenial; readonly text: string };

/** Directory names that hold a generated view, which is never part of an audited candidate. */
const generatedViews = new Set(['.ramify-architect', '.ramify']);

/**
 * Resolves a path an agent named against the candidate. `''` and `.` are its
 * root. A deleted path of the diff resolves to nothing here: its old content
 * is read through the diff.
 */
export function resolveSnapshotPath(snapshot: CandidateSnapshot, input: unknown): SnapshotPath {
  if (typeof input !== 'string' || input.length > 1000 || input.includes('\0')) {
    return denied('invalid', 'A path is a string of at most 1000 characters, relative to the candidate\'s root');
  }
  if (input.startsWith('/') || input.startsWith('~') || input.startsWith('\\') || /^[A-Za-z]:/u.test(input)) {
    return denied('absolute', `"${input}" is an absolute path. Only the audited candidate is readable here; name a path relative to its root`);
  }
  const normal = posix.normalize(input.replaceAll('\\', '/'));
  const path = normal === '.' || normal === './' ? '' : normal.replace(/^\.\//u, '').replace(/\/$/u, '');
  if (path === '..' || path.startsWith('../')) {
    return denied('outside', `"${input}" leaves the audited candidate. Only paths beneath its root are readable`);
  }
  const segments = path === '' ? [] : path.split('/');
  if (segments.includes('.git')) return denied('repository', `"${input}" is inside the repository's own metadata, which is not part of the candidate`);
  if (segments.some(segment => generatedViews.has(segment))) {
    return denied('live-view', `"${input}" is a generated view. A live view describes the tree as it is now, not the audited candidate, so it is not readable here`);
  }
  // A link anywhere on the way is refused, never followed.
  for (let index = 1; index <= segments.length; index += 1) {
    const prefix = segments.slice(0, index).join('/');
    const entry = snapshot.entries.get(prefix);
    if (entry?.kind === 'symlink') return denied('symlink', `"${prefix}" is a symbolic link; its target may lie outside the candidate, so it is not followed`);
    if (entry?.kind === 'submodule') return denied('outside', `"${prefix}" is a submodule, whose content is not part of this candidate`);
  }
  const entry = snapshot.entries.get(path);
  if (entry !== undefined) return { ok: true, path, kind: 'file', entry };
  if (snapshot.directories.has(path)) return { ok: true, path, kind: 'directory' };
  return denied('missing', `The audited candidate has no "${path}"`);
}

function denied(denial: SnapshotDenial, text: string): SnapshotPath {
  return { ok: false, denial, text };
}

export const snapshotToolNames = {
  list: 'snapshot_list',
  read: 'snapshot_read',
  search: 'snapshot_search',
  diff: 'snapshot_diff',
} as const;

/** The most lines one read answers, and the largest file it reads. */
export const snapshotReadLimits = { lines: 2000, bytes: 512 * 1024, matches: 100, patchBytes: 256 * 1024 } as const;

const listInput = z.object({ path: z.string().optional() }).strict();
const readInput = z.object({ path: z.string(), startLine: z.int().positive().optional(), lineCount: z.int().positive().optional() }).strict();
const searchInput = z.object({ pattern: z.string().min(1).max(500), path: z.string().optional() }).strict();
const diffInput = z.object({ path: z.string().optional() }).strict();

/** What the tools answered, for the submission's validation and the attempt's records. */
export interface SnapshotTools {
  readonly definitions: readonly ToolDefinition[];
  /** Every changed path whose content or patch a tool answered: the paths the reviewer may name as inspected. */
  inspected(): ReadonlySet<string>;
  /** Every refused path, in order. */
  denials(): ReadonlyArray<{ readonly tool: string; readonly denial: SnapshotDenial; readonly path: string }>;
}

/** The reviewer's four read tools over one snapshot. None of them mutates anything. */
export function snapshotTools(snapshot: CandidateSnapshot, source: CandidateSource, projectRoot: string): SnapshotTools {
  const changed = new Set(snapshot.changes.map(change => change.path));
  const inspected = new Set<string>();
  const denials: Array<{ tool: string; denial: SnapshotDenial; path: string }> = [];

  const refuse = (tool: string, path: unknown, resolved: Extract<SnapshotPath, { ok: false }>): ToolResult => {
    denials.push({ tool, denial: resolved.denial, path: typeof path === 'string' ? path.slice(0, 1000) : String(path) });
    return { text: resolved.text, isError: true };
  };
  const invalid = (error: z.ZodError): ToolResult => ({ text: `Invalid input: ${error.issues.map(issue => `${issue.path.join('.') || '(input)'}: ${issue.message}`).join('; ')}`, isError: true });
  const tool = <S extends z.ZodType>(name: string, description: string, schema: S, run: (input: z.infer<S>, signal: AbortSignal) => Promise<ToolResult>): ToolDefinition => ({
    name,
    description,
    inputSchema: z.toJSONSchema(schema) as JsonSchema,
    mutating: false,
    async execute(input, signal) {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      try {
        return await run(parsed.data, signal);
      } catch (error) {
        return { text: `The candidate could not be read: ${error instanceof Error ? error.message : String(error)}`, isError: true };
      }
    },
  });

  const list = tool(snapshotToolNames.list, 'List the files and directories directly beneath a directory of the audited candidate; the root when no path is given.', listInput, async input => {
    const resolved = resolveSnapshotPath(snapshot, input.path ?? '');
    if (!resolved.ok) return refuse(snapshotToolNames.list, input.path, resolved);
    if (resolved.kind === 'file') return { text: `${resolved.path} is a file` };
    const prefix = resolved.path === '' ? '' : `${resolved.path}/`;
    const children = new Set<string>();
    for (const path of [...snapshot.entries.keys(), ...snapshot.directories]) {
      if (path === resolved.path || !path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const name = rest.split('/')[0]!;
      const child = `${prefix}${name}`;
      const entry = snapshot.entries.get(child);
      children.add(entry === undefined ? `${name}/` : entry.kind === 'symlink' ? `${name} (symbolic link, not followed)` : name);
    }
    return { text: [...children].sort().join('\n') || '(empty)' };
  });

  const read = tool(snapshotToolNames.read, 'Read one file of the audited candidate, with line numbers. startLine counts from 1.', readInput, async (input, signal) => {
    const resolved = resolveSnapshotPath(snapshot, input.path);
    if (!resolved.ok) return refuse(snapshotToolNames.read, input.path, resolved);
    if (resolved.kind === 'directory') return { text: `${resolved.path} is a directory; list it with ${snapshotToolNames.list}`, isError: true };
    if ((resolved.entry.bytes ?? 0) > snapshotReadLimits.bytes) {
      return { text: `${resolved.path} holds ${resolved.entry.bytes} bytes, more than the ${snapshotReadLimits.bytes} one read answers; search it instead`, isError: true };
    }
    const content = await source.readBlob(projectRoot, snapshot.commit, resolved.path, signal);
    if (content.includes('\0')) return { text: `${resolved.path} is a binary file of ${resolved.entry.bytes ?? 'unknown'} bytes` };
    const lines = content.split('\n');
    if (lines.at(-1) === '') lines.pop();
    const start = input.startLine ?? 1;
    const count = Math.min(input.lineCount ?? snapshotReadLimits.lines, snapshotReadLimits.lines);
    const shown = lines.slice(start - 1, start - 1 + count);
    if (changed.has(resolved.path)) inspected.add(resolved.path);
    const more = start - 1 + shown.length < lines.length ? `\n(${lines.length} lines; ask for startLine ${start + shown.length} for more)` : '';
    return { text: `${shown.map((line, index) => `${String(start + index).padStart(6)}\t${line}`).join('\n')}${more}` };
  });

  const search = tool(snapshotToolNames.search, 'Search the audited candidate\'s text files for an extended regular expression, beneath a path or everywhere.', searchInput, async (input, signal) => {
    let paths: string[] = [];
    if (input.path !== undefined) {
      const resolved = resolveSnapshotPath(snapshot, input.path);
      if (!resolved.ok) return refuse(snapshotToolNames.search, input.path, resolved);
      paths = resolved.path === '' ? [] : [resolved.path];
    }
    // A link's blob is its target's name, not content of the candidate.
    const matches = (await source.grepTree(projectRoot, snapshot.commit, input.pattern, paths, signal))
      .filter(match => resolveSnapshotPath(snapshot, match.path).ok);
    const shown = matches.slice(0, snapshotReadLimits.matches);
    const more = matches.length > shown.length ? `\n(${matches.length} matches; the first ${shown.length} are shown)` : '';
    return { text: shown.length === 0 ? 'No match' : `${shown.map(match => `${match.path}:${match.line}: ${match.text}`).join('\n')}${more}` };
  });

  const diff = tool(snapshotToolNames.diff, 'Without a path, list every path the candidate changed from the iteration\'s base. With one, show that path\'s patch.', diffInput, async (input, signal) => {
    if (input.path === undefined) {
      return { text: snapshot.changes.length === 0 ? 'The candidate changed nothing' : snapshot.changes.map(change => `${change.status}\t${change.path}`).join('\n') };
    }
    const path = resolveChangedPath(snapshot, input.path);
    if (typeof path !== 'string') return refuse(snapshotToolNames.diff, input.path, path);
    const patch = await source.diffPatch(projectRoot, snapshot.base, snapshot.commit, path, signal);
    inspected.add(path);
    return {
      text: patch.length > snapshotReadLimits.patchBytes
        ? `${patch.slice(0, snapshotReadLimits.patchBytes)}\n(the patch holds ${patch.length} characters; the first ${snapshotReadLimits.patchBytes} are shown)`
        : patch,
    };
  });

  return {
    definitions: [list, read, search, diff],
    inspected: () => inspected,
    denials: () => denials,
  };
}

/**
 * A path of the candidate diff, deleted ones included, resolved by the same
 * rules as any other path.
 */
export function resolveChangedPath(snapshot: CandidateSnapshot, input: string): string | Extract<SnapshotPath, { ok: false }> {
  const resolved = resolveSnapshotPath(snapshot, input);
  const path = resolved.ok ? resolved.path : resolved.denial === 'missing' ? posix.normalize(input).replace(/^\.\//u, '') : null;
  if (path === null) return resolved as Extract<SnapshotPath, { ok: false }>;
  if (!snapshot.changes.some(change => change.path === path)) {
    return { ok: false, denial: 'missing', text: `The candidate did not change "${path}"; ${snapshotToolNames.diff} without a path lists what it changed` };
  }
  return path;
}
