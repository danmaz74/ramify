import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Capture } from './capture.js';
import { AcquisitionError, freeze } from './data.js';
import { selectRoot, findConfiguration } from './selection.js';
import { readConfiguration, solutionStyle } from './configuration.js';
import type { AcquisitionLimits, ProjectRequest, ProjectResolution } from './interfaces/project.js';

type Resolved = Extract<ProjectResolution, { status: 'resolved' }>;

/** Queries to replay and the digest of what they answered. */
export interface AnsweredQueries {
  readonly observations: ReturnType<Capture['observations']>;
  readonly answers: string;
}
/**
 * What one resolution queried and what the filesystem answered. `replay` is
 * normally the discovery snapshot: the selection and configuration-discovery
 * probes and the root description's symlink probe. Their kinds, canonical
 * paths and exact-name memberships answering the same make the same selection
 * and find the same configuration. Directory listings and file bytes are not
 * part of it: acquisition reads the configuration again and verifies its
 * content and the readability of what it enumerates. A configuration with
 * references keeps every query, including the configuration's own.
 */
interface ResolutionEvidence {
  readonly request: string;
  readonly replay: AnsweredQueries;
  /** The replay holds every query, including the configuration's content. */
  readonly full: boolean;
}
/** Keyed by the frozen resolution object: evidence leaves with the resolution it describes. */
const evidence = new WeakMap<Resolved, ResolutionEvidence>();
const limits: AcquisitionLimits = { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
  maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
  maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 };
/** Requests that resolve alike: the same raw fields, before any path is canonicalized. */
const requestKey = (request: ProjectRequest): string =>
  JSON.stringify([request.cwd, request.root ?? null, request.scope, request.configuration]);

/**
 * Shared selection within the caller's capture; no description contents read.
 * `discovery` is taken after the root description's symlink probe and before
 * any configuration query, so both call sites record the same query set.
 */
export async function resolveCapturedRoot(capture: Capture, request: ProjectRequest): Promise<{ resolution: Resolved; discovery: AnsweredQueries }> {
  const selected = await selectRoot(capture, request);
  capture.root = selected.root;
  const configuration = await findConfiguration(capture);
  // Selection has already observed the root marker; the probe adds no path.
  await capture.kind('module.ramify');
  return { resolution: { status: 'resolved', ...selected, configuration }, discovery: { observations: capture.observations(), answers: capture.answers } };
}

/**
 * Record a successful resolution made within `capture`, after its configuration
 * was read. `discovery` is the snapshot `resolveCapturedRoot` took; when the
 * configuration has references, the capture's current queries are kept instead.
 * Returns the frozen resolution.
 */
export function recordResolution(capture: Capture, request: ProjectRequest, resolution: Resolved,
  discovery: AnsweredQueries, references: boolean): Resolved {
  const frozen = freeze(resolution);
  evidence.set(frozen, { request: requestKey(request), full: references,
    replay: references ? { observations: capture.observations(), answers: capture.answers } : discovery });
  return frozen;
}

/**
 * A resolution to keep after its configuration was read again with the same
 * requests and an equal selection projection. Discovery evidence holds no
 * configuration content and is returned unchanged. Evidence that holds every
 * query is replayed on a fresh capture, and an equal resolution is recorded with
 * what the queries answer now; a failed replay keeps the resolution, which then
 * no longer validates and resolves again.
 */
export async function refreshResolution(request: ProjectRequest, resolution: Resolved, signal?: AbortSignal): Promise<Resolved> {
  const recorded = evidence.get(resolution);
  if (!recorded?.full || recorded.request !== requestKey(request)) return resolution;
  const capture = new Capture(resolution.root, limits, performance.now() + limits.deadlineMs, signal);
  try {
    await capture.replay(recorded.replay.observations);
    const frozen = freeze({ ...resolution });
    evidence.set(frozen, { ...recorded, replay: { observations: recorded.replay.observations, answers: capture.answers } });
    return frozen;
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return resolution;
  } finally { await capture.dispose(); }
}

/** Concurrent replays of one validation. Answers are compared by path, so order is immaterial. */
const replayWidth = 16;

/** Replay the recorded queries on a fresh capture; any failure counts as a change. */
async function unchanged(recorded: ResolutionEvidence, request: ProjectRequest, signal?: AbortSignal): Promise<boolean> {
  const capture = new Capture(resolve(request.cwd), limits, performance.now() + limits.deadlineMs, signal);
  const { observations, answers } = recorded.replay;
  let next = 0;
  const replay = async (): Promise<void> => { while (next < observations.length) await capture.replay([observations[next++]!]); };
  try {
    await Promise.all(Array.from({ length: Math.min(replayWidth, observations.length) }, replay));
    return capture.answers === answers;
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return false;
  } finally { await capture.dispose(); }
}

/**
 * Resolve the project root and its compiler configuration. `known` holds
 * earlier resolutions, most recent first: the first recorded for an equal
 * request is returned unchanged, with no configuration helper, when its
 * discovery queries still answer the same on disk, or every query when its
 * configuration has references. Otherwise it resolves again. A reused
 * resolution does not re-read the configuration: a solution-style rewrite or
 * an unreadable enumerated directory is refused by acquisition, with the same code.
 */
export async function resolveProjectRoot(request: ProjectRequest, signal?: AbortSignal,
  known: readonly ProjectResolution[] = []): Promise<ProjectResolution> {
  signal?.throwIfAborted();
  const key = requestKey(request);
  for (const candidate of known) {
    const recorded = candidate.status === 'resolved' ? evidence.get(candidate) : undefined;
    if (recorded?.request !== key) continue;
    if (await unchanged(recorded, request, signal)) return candidate;
    break;
  }
  const capture = new Capture(resolve(request.cwd), limits, performance.now() + limits.deadlineMs, signal);
  try {
    const { resolution: selected, discovery } = await resolveCapturedRoot(capture, request);
    if (await capture.kind('module.ramify') === 'symlink') throw new AcquisitionError('symlink-description', 'module.ramify', 'Invalid module boundary: symlink-description');
    const { data: config } = await readConfiguration(capture, selected.configuration);
    const refusal = solutionStyle(selected.configuration, config);
    if (refusal) throw refusal;
    return recordResolution(capture, request, selected, discovery, config.references.length > 0);
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    const issue = error instanceof AcquisitionError ? error : new AcquisitionError('read-failure', capture.root, String(error));
    return freeze({ status: ['missing-root-description', 'symlink-root', 'symlink-description'].includes(issue.code) ? 'invalid' : 'unavailable',
      issues: [{ code: issue.code, path: capture.label(capture.path(issue.path)), message: issue.message }] });
  } finally { await capture.dispose(); }
}
