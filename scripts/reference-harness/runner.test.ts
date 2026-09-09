import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { plan1Instances } from './cases.js';
import { verificationCapabilities } from './instances.js';
import { readReviewedPlan } from './plan.js';
import { Assertions, verifyInstances } from './runner.js';
import type { HarnessRuntime, InstanceHandler } from './runner.js';
import { referenceRuntime } from './runtime.js';

// Deterministic stubs exercise the gate itself. They are never registered in
// the real runtime and establish no I1 source/model conformance.
const plan = readReviewedPlan();
const requiredId = 'I1-14:renamed-kinds';
const passingHandler: InstanceHandler = {
  kind: 'memory', run: ({ assertions }) => assertions.equal('independent stub assertion', 2 + 2, 4),
};
function runtime(iteration?: number): { capabilities: Set<(typeof verificationCapabilities)[number]>; handlers: Map<string, InstanceHandler> } {
  const records = iteration === 3 ? plan1Instances.filter((record) => record.iteration === 3) : plan1Instances;
  return {
    capabilities: new Set(iteration === 3 ? ['registry'] : verificationCapabilities),
    handlers: new Map(records.map((record) => [record.id, passingHandler])),
  };
}

let workRoot: string;
beforeEach(async () => { workRoot = await mkdtemp(join(tmpdir(), 'ramify-gate-')); });
afterEach(async () => { await rm(workRoot, { recursive: true, force: true }); });

function verify(iteration: number | undefined, providers: HarnessRuntime, records = plan1Instances) {
  return verifyInstances({ plan, records, runtime: providers, iteration, workRoot });
}

describe('required capability and assertion execution gates', () => {
  // The full provider gate and its subprocess control can run concurrently.
  // Keep their existing finite contention allowance as new providers activate.
  it('runs all implemented providers and retains unavailable later capabilities in the full gate', async () => {
    const report = await verify(undefined, referenceRuntime);
    expect(report.passed).toBe(false);
    expect(report.planComplete).toBe(false);
    expect(report.summary).toEqual({ required: 308, passed: 268, failed: 0, notExecuted: 40 });
    expect(report.availableCapabilities).toEqual(['acquire', 'catalog', 'coverage', 'lazy', 'link', 'metadata', 'namespace', 'parse', 'registry', 'resources', 'session', 'static-access', 'symbol-free', 'tags-origin']);
    expect(report.instances.filter((item) => item.status === 'not-executed' && item.reason === 'missing-handler').map(item => item.id)).toEqual(['I1-01:baseline']);
    expect(report.instances.filter((item) => item.status === 'not-executed' && item.id !== 'I1-01:baseline').every(item => item.reason === 'missing-capability')).toBe(true);
    expect(await readdir(workRoot)).toEqual([]);
  }, 1_200_000);

  it('permits an intermediate positive control while all future members remain pending', async () => {
    const report = await verify(3, runtime(3));
    expect(report.passed).toBe(true);
    expect(report.planComplete).toBe(false);
    expect(report.mode).toBe('iteration-verification');
    expect(report.summary).toEqual({ required: 14, passed: 14, failed: 0, notExecuted: 294 });
    expect(report.instances.filter((item) => !item.required).every((item) => item.status === 'not-executed' && item.reason === 'future-iteration')).toBe(true);
  });

  it('does not invoke future handlers even when available', async () => {
    const providers = runtime();
    providers.handlers.set('I1-01:baseline', { kind: 'memory', run: () => { throw new Error('Future handler must not run'); } });
    expect((await verify(3, providers)).passed).toBe(true);
  });

  it('requires future capabilities in the unfiltered gate', async () => {
    const report = await verify(undefined, runtime(3));
    expect(report.passed).toBe(false);
    expect(report.summary).toEqual({ required: 308, passed: 14, failed: 0, notExecuted: 294 });
  });

  for (const iteration of [3, undefined]) {
    describe(iteration === 3 ? 'intermediate verification' : 'full verification', () => {
      it('accepts the unsabotaged stub control', async () => {
        const report = await verify(iteration, runtime(iteration));
        expect(report.passed).toBe(true);
        expect(report.planComplete).toBe(iteration === undefined);
      });

      it('fails for a missing required capability even with its handler installed', async () => {
        const providers = runtime(iteration);
        providers.capabilities.delete('registry');
        const report = await verify(iteration, providers);
        expect(report.passed).toBe(false);
        expect(report.instances.find((item) => item.id === requiredId)).toMatchObject({ status: 'not-executed', reason: 'missing-capability', missingCapabilities: ['registry'] });
      });

      it('fails when a required record is removed despite its registered handler', async () => {
        const report = await verify(iteration, runtime(iteration), plan1Instances.filter((record) => record.id !== requiredId));
        expect(report.passed).toBe(false);
        expect(report.instances).toHaveLength(308);
        expect(report.instances.find((item) => item.id === requiredId)).toMatchObject({ required: true, status: 'not-executed', reason: 'missing-record' });
      });

      it('fails when a required handler is disabled', async () => {
        const providers = runtime(iteration);
        providers.handlers.delete(requiredId);
        const report = await verify(iteration, providers);
        expect(report.passed).toBe(false);
        expect(report.instances.find((item) => item.id === requiredId)?.reason).toBe('missing-handler');
      });

      it('fails when a handler returns without executing an assertion', async () => {
        const providers = runtime(iteration);
        providers.handlers.set(requiredId, { kind: 'memory', run: () => {} });
        const report = await verify(iteration, providers);
        expect(report.passed).toBe(false);
        expect(report.instances.find((item) => item.id === requiredId)).toMatchObject({ status: 'failed', reason: 'unrun-assertion', assertions: [] });
      });

      it('fails a real assertion even when the handler catches its exception', async () => {
        const providers = runtime(iteration);
        providers.handlers.set(requiredId, { kind: 'memory', run: ({ assertions }) => {
          try { assertions.equal('deliberate failure', 'denied', 'allowed'); } catch { /* recorded failure must survive */ }
        } });
        const report = await verify(iteration, providers);
        expect(report.passed).toBe(false);
        expect(report.instances.find((item) => item.id === requiredId)).toMatchObject({ status: 'failed', reason: 'assertion-failed', assertions: [{ name: 'deliberate failure', status: 'failed' }] });
      });
    });
  }

  it('closes assertion recording when a handler finishes', () => {
    const assertions = new Assertions();
    assertions.ok('first', true);
    const evidence = assertions.finish();
    expect(() => assertions.ok('late', true)).toThrow('after handler completion');
    expect(evidence).toEqual([{ name: 'first', status: 'passed' }]);
  });
});

describe('project handler baseline, mutation and cleanup', () => {
  const id = 'I1-02:missing-root';
  function projectHandler(baseline: Extract<InstanceHandler, { kind: 'project' }>['baseline']): InstanceHandler {
    return {
      kind: 'project', fixture: { kind: 'create', create: async (root) => {
        await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture\n');
      } }, baseline,
      mutate: async ({ root }) => { await rm(join(root, 'module.ramify')); },
      run: async ({ root, request, assertions }) => {
        assertions.equal('explicit copied root', request.root, root);
        assertions.equal('one recorded deletion', await readdir(root), []);
      },
    };
  }
  function providers(handler: InstanceHandler): HarnessRuntime {
    return { capabilities: new Set(['parse', 'acquire']), handlers: new Map([[id, handler]]) };
  }

  it('checks the positive baseline, applies the edit and records the independent result', async () => {
    const handler = projectHandler(async ({ root, assertions }) => {
      assertions.equal('baseline header', await readFile(join(root, 'module.ramify'), 'utf8'), 'ramify 1\nmodule fixture\n');
    });
    const report = await verify(5, providers(handler));
    const result = report.instances.find((item) => item.id === id)!;
    expect(result.status).toBe('passed');
    expect(result.baselineAssertions).toHaveLength(1);
    expect(result.assertions).toHaveLength(2);
    expect(await readdir(workRoot)).toEqual([]);
  });

  it.each(['unrun', 'failed'] as const)('prevents mutation after an %s baseline and preserves only on request', async (mode) => {
    const handler = projectHandler(({ assertions }) => {
      if (mode === 'failed') assertions.equal('baseline', false, true);
    });
    const report = await verifyInstances({ plan, records: plan1Instances, runtime: providers(handler), iteration: 5, workRoot, preserveOnFailure: true });
    const result = report.instances.find((item) => item.id === id)!;
    expect(result.status).toBe('failed');
    expect(result.reason).toBe(mode === 'unrun' ? 'unrun-baseline' : 'baseline-failed');
    expect(result.assertions).toEqual([]);
    expect(await readFile(join(result.preservedDirectory!, id, 'project/module.ramify'), 'utf8')).toContain('module fixture');
    expect(await readdir(workRoot)).toHaveLength(1);
  });
});
