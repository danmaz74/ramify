import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Capture } from './capture.js';
import { AcquisitionError, freeze } from './data.js';
import { selectRoot, findConfiguration } from './selection.js';
import type { MarkerAnswer } from './selection.js';
import { descriptionMarker } from './marker.js';
import { readConfiguration } from './configuration.js';
import type { RootMarkerReader } from '../../descriptions/src/interfaces/syntax.js';
import type { AcquisitionLimits, ProjectRequest, ProjectResolution } from './interfaces/project.js';

type Resolved = Extract<ProjectResolution, { status: 'resolved' }>;

/**
 * Queries to replay, the digest of what they answered and the marker
 * determination of every description selection read. The digest leaves out
 * those descriptions' bytes: only their determinations are compared.
 */
export interface AnsweredQueries {
  readonly observations: ReturnType<Capture['observations']>;
  readonly answers: string;
  readonly markers: readonly MarkerAnswer[];
}
/**
 * What one resolution queried and what the filesystem answered. `replay` is
 * normally the discovery snapshot: the selection and configuration-discovery
 * probes, the marker of every description the climb read and the root
 * description's symlink probe. Their kinds, canonical paths, exact-name
 * memberships and marker determinations answering the same make the same
 * selection and find the same configuration. Directory listings and other
 * file bytes are not part of it: acquisition reads the configuration again
 * and verifies its content and the readability of what it enumerates, and
 * checks the marker of the root description it parses. A configuration with
 * references keeps every query, including the configuration's own.
 */
interface ResolutionEvidence {
  readonly request: string;
  readonly replay: AnsweredQueries;
}
/** Keyed by the frozen resolution object: evidence leaves with the resolution it describes. */
const evidence = new WeakMap<Resolved, ResolutionEvidence>();
const limits: AcquisitionLimits = { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
  maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
  maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 };
/** Requests that resolve alike: the same raw fields, before any path is canonicalized. */
const requestKey = (request: ProjectRequest): string =>
  JSON.stringify([request.cwd, request.root ?? null, request.scope, request.configuration]);

/** The capture's queries as replayable evidence; the bytes of the read descriptions count only through their markers. */
function answered(capture: Capture, markers: readonly MarkerAnswer[]): AnsweredQueries {
  const described = new Set(markers.map(marker => marker.path));
  return { observations: capture.observations().map(entry => described.has(entry.path) ? { ...entry, read: false } : entry),
    answers: capture.answers(described), markers };
}

/**
 * Shared selection within the caller's capture. Selection reads the
 * descriptions on its climb only to decide their markers. `discovery` is
 * taken after the root description's symlink probe and before any
 * configuration query, so both call sites record the same query set.
 */
export async function resolveCapturedRoot(capture: Capture, request: ProjectRequest, read: RootMarkerReader): Promise<{ resolution: Resolved; discovery: AnsweredQueries }> {
  const { markers, ...selected } = await selectRoot(capture, request, read);
  capture.root = selected.root;
  const configuration = await findConfiguration(capture);
  // Selection has already observed the root description; the probe adds no path.
  await capture.kind('module.ramify');
  return { resolution: { status: 'resolved', ...selected, configuration }, discovery: answered(capture, markers) };
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
  evidence.set(frozen, { request: requestKey(request),
    replay: references ? answered(capture, discovery.markers) : discovery });
  return frozen;
}

/** Concurrent replays of one validation. Answers are compared by path, so order is immaterial. */
const replayWidth = 16;

/**
 * Replay the recorded queries on a fresh capture and decide each recorded
 * description's marker again; any failure counts as a change.
 */
async function unchanged(recorded: ResolutionEvidence, request: ProjectRequest, read: RootMarkerReader, signal?: AbortSignal): Promise<boolean> {
  const capture = new Capture(resolve(request.cwd), limits, performance.now() + limits.deadlineMs, signal);
  const { observations, answers, markers } = recorded.replay;
  let next = 0;
  const replay = async (): Promise<void> => { while (next < observations.length) await capture.replay([observations[next++]!]); };
  try {
    await Promise.all(Array.from({ length: Math.min(replayWidth, observations.length) }, replay));
    for (const { path, marked } of markers) {
      if (await capture.kind(path) !== 'file') return false;
      const bytes = await capture.bytes(path, 'description');
      if (bytes === undefined || (descriptionMarker(path, bytes, read) !== null) !== marked) return false;
    }
    return capture.answers(new Set(markers.map(marker => marker.path))) === answers;
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return false;
  } finally { await capture.dispose(); }
}

/**
 * Resolve the project root and its compiler configuration. `read` decides a
 * description's root marker; the caller supplies the Descriptions owner's
 * reader, as acquisition receives its parser. `known` holds earlier
 * resolutions, most recent first: the first recorded for an equal request is
 * returned unchanged, with no configuration helper, when its discovery
 * queries and marker determinations still answer the same on disk, or every
 * query when its configuration has references. Otherwise it resolves again.
 * A reused resolution does not re-read the configuration: a solution-style
 * rewrite or an unreadable enumerated directory is refused by acquisition,
 * with the same code.
 */
export async function resolveProjectRoot(request: ProjectRequest, read: RootMarkerReader, signal?: AbortSignal,
  known: readonly ProjectResolution[] = []): Promise<ProjectResolution> {
  signal?.throwIfAborted();
  const key = requestKey(request);
  for (const candidate of known) {
    const recorded = candidate.status === 'resolved' ? evidence.get(candidate) : undefined;
    if (recorded?.request !== key) continue;
    if (await unchanged(recorded, request, read, signal)) return candidate;
    break;
  }
  const capture = new Capture(resolve(request.cwd), limits, performance.now() + limits.deadlineMs, signal);
  try {
    const { resolution: selected, discovery } = await resolveCapturedRoot(capture, request, read);
    if (await capture.kind('module.ramify') === 'symlink') throw new AcquisitionError('symlink-description', 'module.ramify', 'Invalid module boundary: symlink-description');
    const config = await readConfiguration(capture, selected.configuration);
    if (config.references.length && !config.files.length) throw new AcquisitionError('references-only-configuration', selected.configuration,
      `Solution-style configurations are unavailable; referenced configurations: ${config.references.join(', ')}`);
    return recordResolution(capture, request, selected, discovery, config.references.length > 0);
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    const issue = error instanceof AcquisitionError ? error : new AcquisitionError('read-failure', capture.root, String(error));
    return freeze({ status: ['missing-root-description', 'unmarked-root-description', 'symlink-root', 'symlink-description'].includes(issue.code) ? 'invalid' : 'unavailable',
      issues: [{ code: issue.code, path: capture.label(capture.path(issue.path)), message: issue.message }] });
  } finally { await capture.dispose(); }
}
