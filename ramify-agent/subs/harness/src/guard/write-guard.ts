import { isContained, resolveRealTarget } from './resolve-contained-path.js';

/*
 * The write guard. `edit` and `write` are intercepted before they execute:
 * the target is resolved against the invocation's working directory, then
 * against the real filesystem, and only then checked against the write scope
 * the assignment recorded.
 *
 * A few files are refused outright, whatever the scope contains: the tracked
 * feature files and the project's configuration for the harness. Only the
 * harness writes them, so no scope and no authorization reaches them.
 *
 * A block makes no mutation, does not end the session, does not request
 * approval and does not widen the scope. Only a recorded assignment changes
 * write authority: a retry or a successful read does not.
 *
 * Nothing here stores what the call proposed to write.
 */

/** The write scope as the guard uses it: canonical paths, and the revision that recorded them. */
export interface GuardedScope {
  /** The revision of the `WriteScope` these paths were captured at. */
  readonly revision: number;
  /** Canonical directories whose whole contents the assignment may write. */
  readonly roots: readonly string[];
  /** Canonical single files the assignment may write, such as a declaration or a contract. */
  readonly files: readonly string[];
  /** Canonical files refused outright, whatever the roots and files contain. */
  readonly denied?: readonly string[] | undefined;
}

/** What the guard decided about one call. */
export type GuardVerdict = 'allowed' | 'blocked-scope' | 'blocked-unresolved';

/** One guarded call, as the observation records it. Never the proposed contents. */
export interface GuardDecisionRecord {
  readonly verdict: GuardVerdict;
  /** The target exactly as the agent wrote it. */
  readonly requested: string;
  /** What it resolved to, or null when it could not be resolved. */
  readonly resolved: string | null;
  readonly reason: string;
  /** Set when the target is one of the files only the harness writes. */
  readonly denied?: true | undefined;
}

/** The field a mutating built-in names its target in. */
function targetOf(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const record = input as Record<string, unknown>;
  for (const field of ['path', 'file_path', 'filePath']) {
    const value = record[field];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

/**
 * Decides one guarded call. It resolves the target first and judges the
 * scope second, so a path that cannot be resolved is never reported as a
 * scope violation and a scope violation is never reported as a resolution
 * failure.
 */
export async function decideWrite(
  scope: GuardedScope,
  workingDirectory: string,
  input: unknown,
): Promise<GuardDecisionRecord> {
  const requested = targetOf(input);
  if (requested === null) {
    return { verdict: 'blocked-unresolved', requested: '', resolved: null, reason: 'the call names no path to write' };
  }
  const target = await resolveRealTarget(workingDirectory, requested);
  if (!target.ok) {
    return { verdict: 'blocked-unresolved', requested, resolved: null, reason: target.reason };
  }
  if (scope.denied?.includes(target.resolved) === true) {
    return {
      verdict: 'blocked-scope',
      requested,
      resolved: target.resolved,
      reason: `${target.resolved} is written by the harness alone; no agent edits it`,
      denied: true,
    };
  }
  if (scope.files.includes(target.resolved)) {
    return { verdict: 'allowed', requested, resolved: target.resolved, reason: 'the write scope names this file' };
  }
  const root = scope.roots.find(candidate => isContained(candidate, target.resolved));
  if (root !== undefined) {
    return { verdict: 'allowed', requested, resolved: target.resolved, reason: `the write scope contains ${root}` };
  }
  return {
    verdict: 'blocked-scope',
    requested,
    resolved: target.resolved,
    reason: `${target.resolved} lies outside every location this assignment may write`,
  };
}

/**
 * What a blocked call tells the agent: the target, the scope, and what to do
 * instead. It never offers to widen the scope and never asks for approval.
 */
export function blockExplanation(decision: GuardDecisionRecord, scope: GuardedScope): string {
  const locations = [
    ...scope.roots.map(root => `${root}/ (and everything beneath it)`),
    ...scope.files.map(file => file),
  ];
  const where = locations.length === 0 ? '  (this assignment may write nothing)' : locations.map(line => `  ${line}`).join('\n');
  if (decision.denied === true) {
    return [
      `The target "${decision.requested}" resolves to ${decision.resolved ?? 'nothing'}, which only the harness writes. Nothing was written.`,
      '',
      'A feature file is rendered by the harness from the plan\'s scenarios: bind its steps with step definitions in a module\'s steps directory instead.',
      'The project\'s configuration for the harness, ramify-agent.json, is captured when the run starts and no agent changes it.',
      'Do not retry the same target, and do not write it another way: a change to it fails the gate as a guarded change.',
    ].join('\n');
  }
  const head = decision.verdict === 'blocked-unresolved'
    ? `The target "${decision.requested}" could not be resolved: ${decision.reason}. Nothing was written.`
    : `The target "${decision.requested}" resolves to ${decision.resolved ?? 'nothing'}, which is outside this iteration's write scope. Nothing was written.`;
  return [
    head,
    '',
    `Write scope (revision ${scope.revision}):`,
    where,
    '',
    'Report the need in your submission, or ask for it through the delegation mechanism.',
    'Do not retry the same target: a retry does not widen the scope, and only a recorded assignment changes what you may write.',
  ].join('\n');
}
