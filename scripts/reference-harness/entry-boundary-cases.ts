import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { batchBoundary, helpVersionBoundary } from '../../src/tests/entry-boundary-cases.js';
import { recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import { clean, sessionReport } from './session-expectations.js';
import type { InstanceHandler } from './runner.js';

const referenceRoot = join(repositoryRoot, 'examples/collection-review');
export const entryBoundaryHandlers: ReadonlyMap<string, InstanceHandler> = new Map([
  ['I2-19:help-version-unchanged', { kind: 'memory', run: async ({ assertions }) => {
    recordObservation('entry-boundary-process', await helpVersionBoundary(assertions));
  } }],
  ['I2-19:batch-no-daemon', { kind: 'project', fixture: { kind: 'copy', sourceRoot: referenceRoot },
    prepare: async ({ root }) => { await symlink(join(referenceRoot, 'node_modules'), join(root, 'node_modules')); },
    baseline: async ({ root, assertions }) => {
      const report = await sessionReport(root);
      clean(report, assertions);
      assertions.equal('independent reference owner count', report.summary.owners, 15);
    },
    mutate: async () => {},
    run: async ({ root, assertions }) => {
      recordObservation('entry-boundary-process', await batchBoundary(root, assertions));
    },
  }],
]);
