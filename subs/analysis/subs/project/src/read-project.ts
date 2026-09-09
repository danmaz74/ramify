import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Capture } from './capture.js';
import { AcquisitionError, Cancelled, byteOrder, freeze } from './data.js';
import { readConfiguration } from './configuration.js';
import { inventoryProject } from './inventory.js';
import { findConfiguration, selectRoot } from './selection.js';
import type { ProjectInputView, ProjectInventory, ProjectIssue, ProjectRead, ProjectReadOptions } from './interfaces/project.js';

const invalidCodes = new Set<ProjectIssue['code']>(['missing-root-description', 'symlink-root', 'symlink-description', 'invalid-description']);
const unavailableCodes = new Set<ProjectIssue['code']>(['root-not-found', 'configuration-not-found', 'references-only-configuration']);

export async function readProject(options: ProjectReadOptions): Promise<ProjectRead> {
  const { request, limits, signal } = options;
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value <= 0)
    || limits.attempts > 3 || request.scope !== 'whole-project' || request.configuration !== 'discover') {
    return { status: 'unavailable', inventory: null, issues: [{ code: 'resource-limit', path: request.cwd, message: 'Invalid acquisition limits or unsupported scope/configuration policy' }] };
  }
  const deadline = performance.now() + limits.deadlineMs;
  for (let attempt = 0; attempt < limits.attempts; attempt++) {
    const capture = new Capture(resolve(request.cwd), limits, deadline, signal);
    let retained = false;
    let inventory: ProjectInventory | null = null;
    try {
      const selected = await selectRoot(capture, request);
      capture.root = selected.root;
      const configuration = await findConfiguration(capture);
      const config = await readConfiguration(capture, configuration);
      if (config.references.length && !config.files.length) throw new AcquisitionError('references-only-configuration', configuration,
        `Solution-style configurations are unavailable; referenced configurations: ${config.references.join(', ')}`);
      const acquired = await inventoryProject(capture, { ...selected, configuration }, config, options.parse);
      inventory = acquired.inventory;
      const changed = await capture.validate();
      if (changed.length) throw new AcquisitionError('changed-input', selected.root, `Inputs changed during acquisition: ${changed.join(', ')}`);
      if (acquired.issues.length) return freeze({ status: 'invalid', inventory,
        issues: acquired.issues.sort((a, b) => byteOrder(a.path, b.path) || byteOrder(a.code, b.code) || byteOrder(a.message, b.message)) });
      const view: ProjectInputView = Object.freeze({ inventory,
        get inputs() { return capture.inputs; },
        readFile: (path: string) => capture.readFile(path),
        fileExists: (path: string) => capture.fileExists(path),
        directoryExists: (path: string) => capture.directoryExists(path),
        readDirectory: (path: string) => capture.readDirectory(path),
        realPath: (path: string) => capture.realPath(path),
        seal: () => capture.seal(), dispose: () => capture.dispose(),
      });
      capture.finishAcquisition();
      retained = true;
      return { status: 'acquired', view };
    } catch (error) {
      if (error instanceof Cancelled || signal?.aborted) return { status: 'cancelled' };
      const failure = error instanceof AcquisitionError ? error : new AcquisitionError('read-failure', capture.root,
        error instanceof Error ? error.message : String(error));
      if (failure.code === 'changed-input' && attempt + 1 < limits.attempts) continue;
      return freeze({ status: invalidCodes.has(failure.code) ? 'invalid' : unavailableCodes.has(failure.code) ? 'unavailable' : 'incomplete',
        inventory, issues: [{ code: failure.code, path: capture.label(capture.path(failure.path)), message: failure.message }] });
    } finally { if (!retained) await capture.dispose(); }
  }
  throw new Error('Unreachable acquisition retry state');
}
