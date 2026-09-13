import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Capture } from './capture.js';
import { AcquisitionError, freeze } from './data.js';
import { selectRoot, findConfiguration } from './selection.js';
import { readConfiguration } from './configuration.js';
import type { AcquisitionLimits, ProjectRequest, ProjectResolution } from './interfaces/project.js';

type Resolved = Extract<ProjectResolution, { status: 'resolved' }>;

/**
 * What one resolution queried and what the filesystem answered. Replaying
 * the queries and obtaining the same answers makes the same selection, finds
 * the same configuration and reaches the same configuration outcome.
 */
interface ResolutionEvidence {
  readonly request: string;
  readonly observations: ReturnType<Capture['observations']>;
  readonly answers: string;
}
/** Keyed by the frozen resolution object: evidence leaves with the resolution it describes. */
const evidence = new WeakMap<Resolved, ResolutionEvidence>();
const limits: AcquisitionLimits = { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
  maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
  maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 };
/** Requests that resolve alike: the same raw fields, before any path is canonicalized. */
const requestKey = (request: ProjectRequest): string =>
  JSON.stringify([request.cwd, request.root ?? null, request.scope, request.configuration]);

/** Shared selection within the caller's capture; no description contents read. */
export async function resolveCapturedRoot(capture: Capture, request: ProjectRequest): Promise<Resolved> {
  const selected = await selectRoot(capture, request);
  capture.root = selected.root;
  const configuration = await findConfiguration(capture);
  return { status: 'resolved', ...selected, configuration };
}

/**
 * Record a successful resolution made within `capture`, whose observations are
 * exactly the selection and configuration queries. Returns the frozen resolution.
 */
export function recordResolution(capture: Capture, request: ProjectRequest, resolution: Resolved): Resolved {
  const frozen = freeze(resolution);
  evidence.set(frozen, { request: requestKey(request), observations: capture.observations(), answers: capture.answers });
  return frozen;
}

/** Concurrent replays of one validation. Answers are compared by path, so order is immaterial. */
const replayWidth = 16;

/** Replay the recorded queries on a fresh capture; any failure counts as a change. */
async function unchanged(recorded: ResolutionEvidence, request: ProjectRequest, signal?: AbortSignal): Promise<boolean> {
  const capture = new Capture(resolve(request.cwd), limits, performance.now() + limits.deadlineMs, signal);
  const { observations } = recorded;
  let next = 0;
  const replay = async (): Promise<void> => { while (next < observations.length) await capture.replay([observations[next++]!]); };
  try {
    await Promise.all(Array.from({ length: Math.min(replayWidth, observations.length) }, replay));
    return capture.answers === recorded.answers;
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return false;
  } finally { await capture.dispose(); }
}

/**
 * Resolve the project root and its compiler configuration. `known` holds
 * earlier resolutions, most recent first: the first recorded for an equal
 * request is returned unchanged, with no configuration helper, when every
 * query it made still answers the same on disk. Otherwise it resolves again.
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
    const selected = await resolveCapturedRoot(capture, request);
    if (await capture.kind('module.ramify') === 'symlink') throw new AcquisitionError('symlink-description', 'module.ramify', 'Invalid module boundary: symlink-description');
    const config = await readConfiguration(capture, selected.configuration);
    if (config.references.length && !config.files.length) throw new AcquisitionError('references-only-configuration', selected.configuration,
      `Solution-style configurations are unavailable; referenced configurations: ${config.references.join(', ')}`);
    return recordResolution(capture, request, selected);
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    const issue = error instanceof AcquisitionError ? error : new AcquisitionError('read-failure', capture.root, String(error));
    return freeze({ status: ['missing-root-description', 'symlink-root', 'symlink-description'].includes(issue.code) ? 'invalid' : 'unavailable',
      issues: [{ code: issue.code, path: capture.label(capture.path(issue.path)), message: issue.message }] });
  } finally { await capture.dispose(); }
}
