import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { instanceFromSeed } from './instances.js';
import type { ReferenceInstance, VerificationCapability } from './instances.js';
import { runIsolatedProject } from './mutation.js';
import type { IsolatedProject, ProjectFixture } from './mutation.js';
import { requiredIterations, validateInstanceRecords } from './plan.js';
import type { ReviewedPlan } from './plan.js';
import { captureObservations } from './observations.js';
import type { Observation } from './observations.js';

export interface AssertionEvidence {
  readonly name: string;
  readonly status: 'passed' | 'failed';
  readonly error?: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Outcomes come from assertions executed here, never a handler's return value. */
export class Assertions {
  readonly #evidence: AssertionEvidence[] = [];
  #closed = false;

  equal(name: string, actual: unknown, expected: unknown): void {
    this.#record(name, () => assert.deepStrictEqual(actual, expected));
  }

  ok(name: string, actual: unknown): void {
    this.#record(name, () => assert.ok(actual));
  }

  #record(name: string, check: () => void): void {
    if (this.#closed) throw new Error('Assertion attempted after handler completion');
    try {
      assert.ok(name.trim(), 'Assertions need a name');
      assert.ok(!this.#evidence.some((item) => item.name === name), `Duplicate assertion: ${name}`);
      check();
      this.#evidence.push({ name, status: 'passed' });
    } catch (error) {
      this.#evidence.push({ name, status: 'failed', error: messageOf(error) });
      throw error;
    }
  }

  finish(): readonly AssertionEvidence[] {
    this.#closed = true;
    return this.#evidence.map((item) => ({ ...item }));
  }
}

interface InstanceContext {
  readonly instance: ReferenceInstance;
  readonly assertions: Assertions;
}

export interface ProjectContext extends InstanceContext, IsolatedProject {}

export type InstanceHandler =
  | { readonly kind: 'memory'; readonly run: (context: InstanceContext) => void | Promise<void> }
  | {
    readonly kind: 'project';
    readonly fixture: ProjectFixture;
    /** Relocation evidence must run outside the enclosing checkout. */
    readonly workRoot?: string;
    /** Establish the documented positive baseline before its independent check. */
    readonly prepare?: (context: IsolatedProject) => Promise<void>;
    readonly baseline: (context: ProjectContext) => void | Promise<void>;
    /** One recorded cause, possibly involving several coordinated source edits. */
    readonly mutate: (context: IsolatedProject & { readonly instance: ReferenceInstance }) => Promise<void>;
    readonly run: (context: ProjectContext) => void | Promise<void>;
  };

export interface HarnessRuntime {
  readonly capabilities: ReadonlySet<VerificationCapability>;
  readonly handlers: ReadonlyMap<string, InstanceHandler>;
}

const capabilityPrerequisites: Readonly<Record<VerificationCapability, readonly VerificationCapability[]>> = {
  registry: [], parse: [], acquire: ['parse'], metadata: ['acquire'],
  catalog: ['registry', 'acquire'], link: ['registry', 'parse', 'acquire', 'catalog'],
  'static-access': ['link'], 'tags-origin': ['static-access'],
  namespace: ['static-access'], lazy: ['static-access'], 'symbol-free': ['static-access'],
  resources: ['catalog', 'static-access'], coverage: [],
  session: ['registry', 'parse', 'acquire', 'metadata', 'catalog', 'link', 'static-access',
    'tags-origin', 'namespace', 'lazy', 'symbol-free', 'resources', 'coverage'],
  cli: ['session'], 'build-selection': ['registry', 'parse', 'acquire', 'metadata'],
  regression: [], 'harness-gate': [],
};

export function requiredCapabilities(instance: ReferenceInstance): VerificationCapability[] {
  const needed = new Set<VerificationCapability>();
  function visit(capability: VerificationCapability): void {
    if (needed.has(capability)) return;
    needed.add(capability);
    capabilityPrerequisites[capability].forEach(visit);
  }
  instance.requiredCapabilities.forEach(visit);
  return [...needed].sort();
}

export interface InstanceExecution {
  readonly id: string;
  readonly iteration: number;
  readonly required: boolean;
  readonly status: 'passed' | 'failed' | 'not-executed';
  readonly reason?: 'future-iteration' | 'missing-record' | 'missing-capability' | 'missing-handler'
    | 'unrun-assertion' | 'unrun-baseline' | 'assertion-failed' | 'baseline-failed' | 'handler-failed';
  readonly missingCapabilities?: readonly VerificationCapability[];
  readonly baselineAssertions: readonly AssertionEvidence[];
  readonly assertions: readonly AssertionEvidence[];
  readonly durationMs: number;
  readonly error?: string;
  readonly preservedDirectory?: string;
  readonly observations?: readonly Observation[];
}

export interface VerificationReport {
  readonly schemaVersion: 1;
  readonly plan: 1;
  readonly mode: 'plan-verification' | 'iteration-verification';
  readonly iteration: number | null;
  readonly requiredIterations: readonly number[];
  readonly availableCapabilities: readonly VerificationCapability[];
  readonly passed: boolean;
  readonly planComplete: boolean;
  readonly inventoryIssues: readonly string[];
  readonly instances: readonly InstanceExecution[];
  readonly summary: { readonly required: number; readonly passed: number; readonly failed: number; readonly notExecuted: number };
}

async function executeInstance(instance: ReferenceInstance, handler: InstanceHandler, options: {
  readonly workRoot: string;
  readonly preserveOnFailure?: boolean;
}): Promise<InstanceExecution> {
  const started = performance.now();
  const assertions = new Assertions();
  const baseline = new Assertions();
  let baselineAssertions: readonly AssertionEvidence[] = [];
  let reason: InstanceExecution['reason'];
  let error: string | undefined;
  let preservedDirectory: string | undefined;
  try {
    if (handler.kind === 'memory') {
      await handler.run({ instance, assertions });
    } else {
      const result = await runIsolatedProject({ ...options, workRoot: handler.workRoot ?? options.workRoot, instanceId: instance.id, fixture: handler.fixture }, async (project) => {
        await handler.prepare?.(project);
        try {
          await handler.baseline({ ...project, instance, assertions: baseline });
        } catch (cause) {
          reason = 'baseline-failed';
          throw cause;
        } finally {
          baselineAssertions = baseline.finish();
        }
        if (baselineAssertions.length === 0 || baselineAssertions.some((item) => item.status === 'failed')) {
          reason = baselineAssertions.length === 0 ? 'unrun-baseline' : 'baseline-failed';
          throw new Error('Mutation requires a checked, passing baseline');
        }
        await handler.mutate({ ...project, instance });
        await handler.run({ ...project, instance, assertions });
        const evidence = assertions.finish();
        if (evidence.length === 0 || evidence.some((item) => item.status === 'failed')) {
          reason = evidence.length === 0 ? 'unrun-assertion' : 'assertion-failed';
          throw new Error('Instance did not complete its assertions');
        }
      });
      if (!result.ok) {
        preservedDirectory = result.preservedDirectory;
        throw result.error;
      }
    }
  } catch (cause) {
    error = messageOf(cause);
    reason ??= 'handler-failed';
  }
  const evidence = assertions.finish();
  baseline.finish();
  if (evidence.some((item) => item.status === 'failed') && reason !== 'baseline-failed') reason = 'assertion-failed';
  if (!reason && evidence.length === 0) reason = 'unrun-assertion';
  return {
    id: instance.id, iteration: instance.iteration, required: true,
    status: reason ? 'failed' : 'passed', ...(reason ? { reason } : {}),
    baselineAssertions, assertions: evidence,
    durationMs: Math.round((performance.now() - started) * 1000) / 1000,
    ...(error ? { error } : {}), ...(preservedDirectory ? { preservedDirectory } : {}),
  };
}

export async function verifyInstances(options: {
  readonly plan: ReviewedPlan;
  readonly records: readonly ReferenceInstance[];
  readonly runtime: HarnessRuntime;
  readonly iteration?: number;
  readonly workRoot: string;
  readonly preserveOnFailure?: boolean;
}): Promise<VerificationReport> {
  const iterations = requiredIterations(options.plan, options.iteration);
  const inventoryIssues = validateInstanceRecords(options.records, options.plan);
  const records = new Map(options.records.map((record) => [record.id, record]));
  const instances: InstanceExecution[] = [];
  for (const seed of options.plan.members) {
    // Even a deleted record retains its independently required execution slot.
    const member = instanceFromSeed(seed);
    const required = iterations.includes(member.iteration);
    const empty = { id: seed[0], iteration: member.iteration, required,
      baselineAssertions: [], assertions: [], durationMs: 0 } as const;
    if (!required) {
      instances.push({ ...empty, status: 'not-executed', reason: 'future-iteration' });
      continue;
    }
    const record = records.get(seed[0]);
    if (!record) {
      instances.push({ ...empty, status: 'not-executed', reason: 'missing-record' });
      continue;
    }
    const missingCapabilities = requiredCapabilities(member).filter((capability) => !options.runtime.capabilities.has(capability));
    if (missingCapabilities.length) {
      instances.push({ ...empty, status: 'not-executed', reason: 'missing-capability', missingCapabilities });
      continue;
    }
    const handler = options.runtime.handlers.get(record.id);
    if (!handler) {
      instances.push({ ...empty, status: 'not-executed', reason: 'missing-handler' });
      continue;
    }
    const execution = await captureObservations(() => executeInstance(member, handler, options));
    instances.push({ ...execution.value, observations: execution.observations });
  }
  const passed = inventoryIssues.length === 0 && instances.every((item) => !item.required || item.status === 'passed');
  return {
    schemaVersion: 1, plan: 1,
    mode: options.iteration === undefined ? 'plan-verification' : 'iteration-verification',
    iteration: options.iteration ?? null, requiredIterations: iterations,
    availableCapabilities: [...options.runtime.capabilities].sort(),
    passed, planComplete: options.iteration === undefined && passed, inventoryIssues, instances,
    summary: {
      required: instances.filter((item) => item.required).length,
      passed: instances.filter((item) => item.status === 'passed').length,
      failed: instances.filter((item) => item.status === 'failed').length,
      notExecuted: instances.filter((item) => item.status === 'not-executed').length,
    },
  };
}
