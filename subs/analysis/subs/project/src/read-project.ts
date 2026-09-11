import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Capture } from './capture.js';
import { AcquisitionError, Cancelled, byteOrder, freeze } from './data.js';
import { acquireConfiguration, ConfigurationChanged } from './configuration.js';
import { inventoryProject } from './inventory.js';
import { resolveCapturedRoot } from './resolve-root.js';
import type { ProjectInputView, ProjectInventory, ProjectIssue, ProjectRead, ProjectReadOptions } from './interfaces/project.js';

const invalidCodes = new Set<ProjectIssue['code']>(['missing-root-description', 'symlink-root', 'symlink-description', 'invalid-description']);
const unavailableCodes = new Set<ProjectIssue['code']>(['root-not-found', 'configuration-not-found', 'references-only-configuration']);
const issueOrder = (a: ProjectIssue, b: ProjectIssue): number => byteOrder(a.path, b.path) || byteOrder(a.code, b.code) || byteOrder(a.message, b.message);

export async function readProject(options: ProjectReadOptions): Promise<ProjectRead> {
  const { request, limits, signal } = options;
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value <= 0)
    || limits.attempts > 3 || request.scope !== 'whole-project' || request.configuration !== 'discover') {
    return { status: 'unavailable', inventory: null, sealedInputs: null, issues: [{ code: 'resource-limit', path: request.cwd, message: 'Invalid acquisition limits or unsupported scope/configuration policy' }] };
  }
  const deadline = performance.now() + limits.deadlineMs;
  let previousConfiguration = options.retained;
  for (let attempt = 0; attempt < limits.attempts; attempt++) {
    const capture = new Capture(resolve(request.cwd), limits, deadline, signal);
    let retained = false;
    let inventory: ProjectInventory | null = null;
    let issues: ProjectIssue[] = [];
    try {
      const { configuration, status: _status, ...selected } = await resolveCapturedRoot(capture, request);
      const acquiredConfiguration = await acquireConfiguration(capture, configuration, previousConfiguration);
      const config = acquiredConfiguration.data;
      if (config.references.length && !config.files.length) throw new AcquisitionError('references-only-configuration', configuration,
        `Solution-style configurations are unavailable; referenced configurations: ${config.references.join(', ')}`);
      const acquired = await inventoryProject(capture, { ...selected, configuration }, config, options.parse, options.retained?.product.metadata as Parameters<typeof inventoryProject>[4]);
      inventory = acquired.inventory;
      issues = acquired.issues;
      if (acquired.status === 'failed') throw acquired.error;
      const changed = await capture.validate();
      if (changed.length) throw new AcquisitionError('changed-input', selected.root, `Inputs changed during acquisition: ${changed.join(', ')}`);
      if (issues.length) {
        const seal = await capture.seal();
        if (seal.status === 'changed') throw new AcquisitionError('changed-input', selected.root, 'Inputs changed during acquisition');
        return freeze({ status: 'invalid', inventory, issues: issues.sort(issueOrder), sealedInputs: seal.inputs });
      }
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
      const product = { ...acquiredConfiguration.retained.product, metadata: acquired.metadata, metadataReused: acquired.metadataReused };
      const configurationProduct = freeze({ ...acquiredConfiguration.retained, product, bytes: Buffer.byteLength(JSON.stringify(product)) });
      return { status: 'acquired', view, configuration: configurationProduct, reusedConfiguration: acquiredConfiguration.reused };
    } catch (error) {
      if (error instanceof ConfigurationChanged) { previousConfiguration = null; attempt--; continue; }
      if (error instanceof Cancelled || signal?.aborted) return { status: 'cancelled' };
      const failure = error instanceof AcquisitionError ? error : new AcquisitionError('read-failure', capture.root,
        error instanceof Error ? error.message : String(error));
      if (failure.code === 'changed-input' && attempt + 1 < limits.attempts) continue;
      issues.push({ code: failure.code, path: capture.label(capture.path(failure.path)), message: failure.message });
      return freeze({ status: invalidCodes.has(failure.code) ? 'invalid' : unavailableCodes.has(failure.code) ? 'unavailable' : 'incomplete',
        inventory, issues: issues.sort(issueOrder), sealedInputs: null });
    } finally { if (!retained) await capture.dispose(); }
  }
  throw new Error('Unreachable acquisition retry state');
}
