import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const budgets = Object.freeze({
  coldSamples: 5, sampleIntervalMs: 50, warmups: 5, cycles: 25, settledCycles: 20,
  reference: { medianColdMs: 5000, peakRssBytes: 512 * 1024 ** 2 },
  'hundred-owners': { medianColdMs: 15000, peakRssBytes: 768 * 1024 ** 2 },
  heapGrowthBeyondReportBytes: 16 * 1024 ** 2, rssGrowthBytes: 64 * 1024 ** 2,
  disposalMs: 5000,
});
export const capabilities = ['registry', 'layout', 'metadata', 'descriptions',
  'source-catalog', 'exposure-linking', 'static-access', 'tags-origin',
  'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'];

/** Explicit caller-supplied limits reproduce the reviewed CLI defaults. */
export async function sessionInputs(root) {
  const { createDefaultTagRegistry } = await import('ramify.ts/model');
  return {
    project: { cwd: root, root, configuration: 'discover', scope: 'whole-project' },
    registry: createDefaultTagRegistry(), capabilities,
    limits: {
      acquisition: { attempts: 3, maxFiles: 50000, maxApplicationFiles: 20000,
        maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2,
        maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30000 },
      source: { maxExports: 250000, maxAccesses: 250000, maxSelections: 1000000,
        maxForwardingDepth: 256, deadlineMs: 90000 },
      maxExposurePairs: 1000000, maxDiagnostics: 100000, maxReportBytes: 32 * 1024 ** 2,
      disposeTimeoutMs: 5000, deadlineMs: 120000,
    },
  };
}

export function checkedReport(run, owners) {
  assert.equal(run.status, 'reported');
  const report = run.report;
  assert.deepEqual(report.outcome, { execution: 'completed', check: 'passed', coverage: 'complete' });
  assert.equal(report.summary.owners, owners);
  assert.equal(report.summary.denied, 0);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.coverage.length, 0);
  assert.equal(report.stages.length, 8);
  assert.ok(report.stages.every(stage => stage.status === 'completed'));
  assert.ok(report.capabilities.filter(capability => capability.requested).every(capability => capability.executed));
  return report;
}

/** Inspect descriptors as well as JSON so hidden compiler/session state cannot pass. */
export function plainReport(report) {
  const seen = new Set();
  function visit(item) {
    if (item === null || typeof item !== 'object') {
      assert.ok(item === null || ['string', 'number', 'boolean'].includes(typeof item));
      return;
    }
    if (seen.has(item)) return;
    seen.add(item);
    assert.ok([Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(item)));
    assert.ok(Object.isFrozen(item));
    for (const key of Reflect.ownKeys(item)) {
      assert.equal(typeof key, 'string');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      assert.ok('value' in descriptor);
      assert.ok(descriptor.enumerable || (Array.isArray(item) && key === 'length'));
      visit(descriptor.value);
    }
  }
  visit(report);
  return { objects: seen.size, bytes: Buffer.byteLength(JSON.stringify(report)) };
}

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const fingerprint = path => ({ path, sha256: sha256(readFileSync(path)) });
export const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
