import { expect } from 'vitest';
import type { CandidateSource, TreeEntry } from '../../../subs/evidence/src/git.js';
import { reviewPolicyVersion, type ReviewPolicy } from '../../run/records.js';

/*
 * The answers Git gives a review about its frozen candidates.
 *
 * Git is an external system, and this is a response script, not a
 * repository: each audited commit a scenario names has the tree ID, the
 * files and the diff the scenario states, and nothing is read from disk. A
 * read of a commit the scenario did not state fails, as would a revision
 * Git does not know. What the reviewer's tools then answered, and what the
 * run recorded, is what a test asserts.
 */

export interface ScriptedCommit {
  readonly tree: string;
  /** Every file of the commit: its content, or the target of a symbolic link. */
  readonly files: Readonly<Record<string, string | { readonly symlink: string }>>;
  /** The base the diff is taken from, and what it changed. */
  readonly base: string;
  readonly changes: ReadonlyArray<{ readonly status: string; readonly path: string }>;
}

export interface ScriptedCandidates extends CandidateSource {
  /** Every call, as `operation commit[ path]`, in order. */
  readonly calls: string[];
  /** Makes one operation fail from now on, as a repository that cannot answer does. */
  fail(operation: keyof CandidateSource, commit: string): void;
}

export function scriptedCandidates(root: string, commits: Readonly<Record<string, ScriptedCommit>>): ScriptedCandidates {
  const calls: string[] = [];
  const failing = new Set<string>();
  const commitOf = (operation: keyof CandidateSource, project: string, commit: string, detail = ''): ScriptedCommit => {
    expect(project).toBe(root);
    calls.push(`${operation} ${commit}${detail === '' ? '' : ` ${detail}`}`);
    if (failing.has(`${operation} ${commit}`)) throw new Error(`fatal: ${operation} of ${commit} cannot be answered`);
    const scripted = commits[commit];
    if (scripted === undefined) throw new Error(`fatal: no candidate is scripted for ${commit}`);
    return scripted;
  };
  const text = (scripted: ScriptedCommit, path: string): string | undefined => {
    const file = scripted.files[path];
    return file === undefined ? undefined : typeof file === 'string' ? file : file.symlink;
  };
  return {
    calls,
    fail(operation, commit) { failing.add(`${operation} ${commit}`); },
    async commitTree(project, commit) { return commitOf('commitTree', project, commit).tree; },
    async treeEntries(project, commit) {
      const scripted = commitOf('treeEntries', project, commit);
      return Object.entries(scripted.files).sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, file]): TreeEntry => ({
        path,
        kind: typeof file === 'string' ? 'file' : 'symlink',
        bytes: Buffer.byteLength(typeof file === 'string' ? file : file.symlink),
      }));
    },
    async readBlob(project, commit, path) {
      const content = text(commitOf('readBlob', project, commit, path), path);
      if (content === undefined) throw new Error(`fatal: path '${path}' does not exist in '${commit}'`);
      return content;
    },
    async grepTree(project, commit, pattern, paths = []) {
      const scripted = commitOf('grepTree', project, commit, pattern);
      const expression = new RegExp(pattern, 'u');
      return Object.keys(scripted.files).sort()
        .filter(path => paths.length === 0 || paths.some(prefix => path === prefix || path.startsWith(`${prefix}/`)))
        .flatMap(path => (text(scripted, path) ?? '').split('\n').flatMap((line, index) => (expression.test(line) ? [{ path, line: index + 1, text: line }] : [])));
    },
    async diffNameStatus(project, from, to) {
      const scripted = commitOf('diffNameStatus', project, to, from);
      expect(from).toBe(scripted.base);
      return [...scripted.changes];
    },
    async diffPatch(project, from, to, path) {
      const scripted = commitOf('diffPatch', project, to, path ?? '');
      expect(from).toBe(scripted.base);
      const changed = scripted.changes.filter(change => path === undefined || change.path === path);
      return changed.map(change => {
        const content = text(scripted, change.path) ?? '';
        return `--- a/${change.path}\n+++ b/${change.path}\n${content.split('\n').filter(line => line !== '').map(line => `+${line}`).join('\n')}\n`;
      }).join('');
    },
  };
}

/** A review policy for a test: the trial's values with short bounds, overridable. */
export function testReviewPolicy(extra: Partial<ReviewPolicy> = {}): ReviewPolicy {
  return {
    version: reviewPolicyVersion,
    kinds: ['code'],
    concurrency: 2,
    queue: 12,
    retries: 1,
    attemptMs: 60_000,
    settleMs: 60_000,
    maxConcerns: 20,
    ...extra,
  };
}

/**
 * Git's answer to the one question a scenario gate asks of its audited
 * commits: the tree of each, `tree-of-<commit>`, for a scenario that states
 * no candidate files. Every other read fails, as for an unknown commit.
 */
export function treeCandidates(root: string): ScriptedCandidates {
  const calls: string[] = [];
  const failing = new Set<string>();
  const refused = (operation: string) => async (): Promise<never> => {
    throw new Error(`fatal: this scenario answers no ${operation}`);
  };
  return {
    calls,
    fail(operation, commit) { failing.add(`${operation} ${commit}`); },
    async commitTree(project, commit) {
      expect(project).toBe(root);
      calls.push(`commitTree ${commit}`);
      if (failing.has(`commitTree ${commit}`)) throw new Error(`fatal: commitTree of ${commit} cannot be answered`);
      return `tree-of-${commit}`;
    },
    treeEntries: refused('treeEntries'),
    readBlob: refused('readBlob'),
    grepTree: refused('grepTree'),
    diffNameStatus: refused('diffNameStatus'),
    diffPatch: refused('diffPatch'),
  };
}
