import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Capture } from './capture.js';
import { AcquisitionError, freeze } from './data.js';
import { selectRoot, findConfiguration } from './selection.js';
import { readConfiguration } from './configuration.js';
import type { ProjectRequest, ProjectResolution } from './interfaces/project.js';

/** Shared selection within the caller's capture; no description contents read. */
export async function resolveCapturedRoot(capture: Capture, request: ProjectRequest): Promise<Extract<ProjectResolution, { status: 'resolved' }>> {
  const selected = await selectRoot(capture, request);
  capture.root = selected.root;
  const configuration = await findConfiguration(capture);
  return { status: 'resolved', ...selected, configuration };
}

export async function resolveProjectRoot(request: ProjectRequest, signal?: AbortSignal): Promise<ProjectResolution> {
  signal?.throwIfAborted();
  const limits = { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
    maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
    maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 };
  const capture = new Capture(resolve(request.cwd), limits, performance.now() + limits.deadlineMs, signal);
  try {
    const selected = await resolveCapturedRoot(capture, request);
    if (await capture.kind('module.ramify') === 'symlink') throw new AcquisitionError('symlink-description', 'module.ramify', 'Invalid module boundary: symlink-description');
    const config = await readConfiguration(capture, selected.configuration);
    if (config.references.length && !config.files.length) throw new AcquisitionError('references-only-configuration', selected.configuration,
      `Solution-style configurations are unavailable; referenced configurations: ${config.references.join(', ')}`);
    return freeze(selected);
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    const issue = error instanceof AcquisitionError ? error : new AcquisitionError('read-failure', capture.root, String(error));
    return freeze({ status: ['missing-root-description', 'symlink-root', 'symlink-description'].includes(issue.code) ? 'invalid' : 'unavailable',
      issues: [{ code: issue.code, path: capture.label(capture.path(issue.path)), message: issue.message }] });
  } finally { await capture.dispose(); }
}
