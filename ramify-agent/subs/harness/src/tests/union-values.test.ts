import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { openLedger } from '../../subs/ledger/src/ledger.js';
import { readCommitted } from '../jobs/commit.js';
import { runEventSchema, terminalRunEvents, type RunEvent } from '../run/log.js';
import { observationSchema } from '../run/observations.js';
import {
  capabilityStateSchema, decisionViewSchema, hypothesisStandingSchema, metricSchema, metricStateSchema,
  roleSchema, runEventRefKindSchema, runFailureReasonSchema, runNoticeSchema, runPhaseSchema, workItemStateSchema,
} from '../interfaces/protocol/runs.js';
import { errorCodeSchema, errorHttpStatus, errorResponseSchema } from '../interfaces/protocol/errors.js';
import { decisionsOf } from '../projections/analysis.js';
import { projectEvent } from '../projections/events.js';
import { runView } from '../projections/inputs.js';
import { constructedRun } from './helpers/constructed.js';
import {
  infrastructureRecoverySchema, invocationOutcomeSchema, measurementSnapshotSchema, readinessSteps,
  gateRuleSchema, runLayout, runSchemas, sessionModeSchema,
} from '../run/records.js';
import { defaultContextPolicies } from '../run/policy.js';
import { analysisLayout, analysisSchemas, hypothesisChangeSchema, hypothesisSchema, registryEntrySchema } from '../analysis/records.js';
import { contractAuthoritySchema, contractModeSchema, contractSchemas, contractsLayout, obligationId } from '../contracts/records.js';
import { contractSubmissionKinds, contractSubmissionSchema } from '../contracts/submission.js';
import { decompositionSchema, workLayout, workSchemas } from '../work/records.js';
import {
  architectureLayout, architectureSchemas, decisionAuthoritySchema,
  hypothesisStanceSchema, placementOutcomeSchema,
} from '../architecture/records.js';
import { forkSubmissionKinds, forkSubmissionSchema } from '../architecture/submission.js';
import { localArchitectSubmissionSchema, localArchitectSubmissionKinds } from '../work/submission.js';
import { engineerSubmissionSchema, engineerSubmissionKinds, unsuitableReasonSchema } from '../work/engineer.js';
import { assignableKindSchema, assignmentBodySchema } from '../work/assignment.js';
import {
  extraPurposeSchema, iterationAssignmentSchema, iterationKindSchema, iterationLayout,
  iterationResultSchema, iterationSchemas, moduleNoticeSchema,
} from '../work/iterations.js';
import { shellInputSchema, shellJsonSchema } from '../tools/shell.js';
import { temporaryDirectory } from './helpers/fixture.js';

/*
 * Every value of every union this iteration establishes is written and read
 * back. A value with no producer yet is named here rather than left silent:
 * the iteration that gives it one extends this file.
 *
 * Records go through the ledger and come back through the reader that
 * answers valid, unsupported version or invalid, never an absent record.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** A ledger of its own, for writing one record and reading it back. */
async function ledger() {
  const directory = await temporaryDirectory();
  cleanups.push(directory.remove);
  const log = await openLedger<RunEvent>({
    logPath: `${directory.path}/events.jsonl`,
    recordsRoot: directory.path,
    eventSchema: runEventSchema,
  });
  let sequence = 0;
  return {
    async roundTrip<T>(path: string, body: unknown, schema: { schema: string; body: { parse(value: unknown): T } }): Promise<T> {
      sequence += 1;
      await log.append({
        event: runEventSchema.parse({
          sequence, jobId: '20260920T101500Z-3f9a1c', at: new Date().toISOString(),
          type: 'job-failed', data: { reason: 'internal', message: 'a record written for its own sake', evidence: [] },
        }),
        records: [{ path, id: path, revision: 1, body }],
      });
      const read = await readCommitted(log, path, schema as never);
      if (read.kind !== 'valid') throw new Error(`${path}: ${read.kind}`);
      return read.value as T;
    },
    log,
  };
}

const settled = { confirmed: true, at: '2026-09-20T10:15:00.000Z', groupsKilled: 0, lateWrites: [] };

describe('the run log', () => {
  test('every event type is written and read back, and the terminal ones are named', () => {
    const types = runEventSchema.options.map(option => option.shape.type.value);
    expect(types).toEqual([
      'job-started', 'invocation-started', 'invocation-ended', 'analysis-accepted',
      'readiness-passed', 'readiness-failed',
      'work-item-started', 'hypotheses-delivered',
      'placement-requested', 'view-refreshed', 'fork-returned-partial', 'decision-accepted',
      'brief-appended', 'global-context-rebuilt', 'decision-delivered',
      'outline-revised',
      'iteration-assigned', 'iteration-closed',
      'contract-requested', 'contract-registered',
      'work-item-yielded', 'work-item-resumed',
      'provider-conformed', 'requirement-verified',
      'evidence-reopened', 'revision-needed', 'dependency-cycle-detected',
      'work-item-completed',
      'writer-acquired', 'writer-released',
      'gate-attempted', 'gate-committed', 'stop-requested',
      'job-completed', 'job-failed', 'job-stopped', 'job-interrupted',
    ]);
    for (const terminal of terminalRunEvents) expect(types).toContain(terminal);
  });

  test('an event of an unknown type is refused', () => {
    expect(runEventSchema.safeParse({
      sequence: 1, jobId: '20260920T101500Z-3f9a1c', at: '2026-09-20T10:15:00.000Z', type: 'map-validated', data: {},
    }).success).toBe(false);
  });
});

describe('the record unions', () => {
  test('every way an invocation can end, with every disposition and interruption', async () => {
    const store = await ledger();
    const ends = invocationOutcomeSchema.shape.ended.options;
    expect(ends).toEqual(['submitted', 'ended', 'failed', 'stopped', 'context-budget-reached', 'invalid-submission']);
    const dispositions = invocationOutcomeSchema.shape.disposition.options;
    expect(dispositions).toEqual(['applied', 'superseded', 'incomplete']);
    const interruptions = ['idle-timeout', 'absolute-timeout', 'provider-error', 'session-lost', 'adapter-fault'] as const;

    let index = 0;
    for (const ended of ends) {
      for (const disposition of dispositions) {
        index += 1;
        const read = await store.roundTrip(runLayout.outcome(`inv-${String(index).padStart(4, '0')}`), {
          schema: 'ramify-agent.invocation-outcome/1',
          invocation: `inv-${String(index).padStart(4, '0')}`,
          ended, disposition, rejectedSubmissions: 0, submission: null,
          settled, outsideScope: [], usage: { unavailable: 'none reported' }, elapsedMs: 1,
        }, runSchemas.outcome);
        expect(read).toMatchObject({ ended, disposition });
      }
    }
    for (const interruption of interruptions) {
      index += 1;
      const id = `inv-${String(index).padStart(4, '0')}`;
      const read = await store.roundTrip(runLayout.outcome(id), {
        schema: 'ramify-agent.invocation-outcome/1',
        invocation: id, ended: 'failed', interruption, disposition: 'incomplete',
        rejectedSubmissions: 0, submission: null, settled, outsideScope: [],
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 }, elapsedMs: 1,
      }, runSchemas.outcome);
      expect(read.interruption).toBe(interruption);
    }
  });

  test('every readiness step, outcome and verdict', async () => {
    const store = await ledger();
    for (const [index, outcome] of (['passed', 'failed', 'not-verified'] as const).entries()) {
      const read = await store.roundTrip(runLayout.readiness(index + 1), {
        schema: 'ramify-agent.readiness-attempt/1',
        attempt: index + 1,
        head: 'abc',
        steps: readinessSteps.map(step => ({ step, outcome, detail: `${step} was ${outcome}` })),
        nested: [{ directory: 'tools', manifest: 'tools/package.json', installed: outcome === 'passed', testScript: outcome === 'passed' ? 'vitest run' : null }],
        verdict: outcome === 'passed' ? 'passed' : 'failed',
        recovery: outcome === 'failed' ? 'rec-0001' : null,
      }, runSchemas.readiness);
      expect(read.steps.map(step => step.step)).toEqual([...readinessSteps]);
    }
  });

  test('every recovery cause, action and outcome', async () => {
    const store = await ledger();
    const causes = infrastructureRecoverySchema.shape.cause.options;
    const actions = infrastructureRecoverySchema.shape.action.options;
    let index = 0;
    for (const cause of causes) {
      for (const action of actions) {
        for (const outcome of ['recovered', 'failed'] as const) {
          index += 1;
          const id = `rec-${String(index).padStart(4, '0')}`;
          const read = await store.roundTrip(runLayout.recovery(id), {
            schema: 'ramify-agent.infrastructure-recovery/1',
            id, subject: { readiness: 1 }, cause, action, attempt: 1, outcome, evidence: ['01-tests.log'],
          }, runSchemas.recovery);
          expect(read).toMatchObject({ cause, action, outcome });
        }
      }
    }
    // Which of them a run of this iteration produces, and which do not yet.
    expect(actions).toEqual(['restart-daemon', 'reinstall-nested', 'rerun-command', 'reconstruct-session', 'none']);
  });

  test('a measurement snapshot, available and unavailable', async () => {
    const store = await ledger();
    const available = await store.roundTrip(runLayout.measurement('ms-0001'), {
      schema: 'ramify-agent.measurement-snapshot/1',
      id: 'ms-0001', policy: 'scope-size/1', head: 'abc',
      measure: { revision: 'rev/1:x:1', document: { schema: 'ramify.measure/1' }, hash: 'a'.repeat(64) },
      view: { status: 'materialized', revision: 'rev/1:x:1', input: 'input/1:abc', coverageLimits: [] },
      supplementary: [{ path: 'plans/p/plan.md', bytes: 12 }],
    }, runSchemas.measurement);
    expect('unavailable' in available.measure).toBe(false);

    const unavailable = await store.roundTrip(runLayout.measurement('ms-0002'), {
      schema: 'ramify-agent.measurement-snapshot/1',
      id: 'ms-0002', policy: 'scope-size/1', head: 'abc',
      measure: { unavailable: 'the producer could not be run' },
      view: { status: 'placeholder' },
      supplementary: [],
    }, runSchemas.measurement);
    expect('unavailable' in unavailable.measure).toBe(true);
  });

  test('a record of an unsupported version is a failure with evidence, never an absent record', async () => {
    const store = await ledger();
    await store.roundTrip(runLayout.measurement('ms-0003'), {
      schema: 'ramify-agent.measurement-snapshot/1',
      id: 'ms-0003', policy: 'scope-size/1', head: '', measure: { unavailable: 'x' }, view: null, supplementary: [],
    }, runSchemas.measurement);
    const read = await readCommitted(store.log, runLayout.measurement('ms-0003'), runSchemas.readiness);
    expect(read.kind).toBe('unsupported-version');
    if (read.kind !== 'unsupported-version') return;
    expect(read.schema).toBe('ramify-agent.measurement-snapshot/1');

    const absent = await readCommitted(store.log, runLayout.measurement('ms-9999'), runSchemas.measurement);
    expect(absent.kind).toBe('invalid');
  });
});

describe('the observation log', () => {
  test('every observation type is a valid line, and every coverage-gap kind is named', () => {
    const types = observationSchema.options.map(option => option.shape.type.value);
    expect(types).toEqual([
      'activity', 'rejection', 'guard', 'mutation', 'hook-check', 'excursion', 'scope-tests',
      'context', 'compaction', 'coverage-gap',
    ]);
    const kinds = [
      'unguarded-shell', 'changed-paths-unknown', 'usage-unavailable', 'context-unavailable',
      'observation-truncated', 'unsupported-runner',
    ];
    for (const kind of kinds) {
      expect(observationSchema.safeParse({ n: 1, at: '2026-09-20T10:15:00.000Z', type: 'coverage-gap', data: { kind, detail: 'why' } }).success).toBe(true);
    }
    expect(observationSchema.safeParse({ n: 1, at: '2026-09-20T10:15:00.000Z', type: 'coverage-gap', data: { kind: 'other', detail: 'why' } }).success).toBe(false);
  });

  test('every guard verdict, mutation observer and compaction trigger', () => {
    for (const verdict of ['allowed', 'blocked-scope', 'blocked-unresolved']) {
      expect(observationSchema.safeParse({
        n: 1, at: '2026-09-20T10:15:00.000Z', type: 'guard',
        data: { callId: 'c1', tool: 'edit', requested: 'a.ts', resolved: null, owner: null, scopeRevision: null, verdict, reason: '' },
      }).success).toBe(true);
    }
    for (const observedBy of ['tool', 'snapshot']) {
      expect(observationSchema.safeParse({
        n: 1, at: '2026-09-20T10:15:00.000Z', type: 'mutation',
        data: { callId: null, paths: [], added: null, deleted: null, observedBy, toolFailed: false, attributable: true },
      }).success).toBe(true);
    }
    for (const trigger of ['threshold', 'overflow', 'explicit']) {
      expect(observationSchema.safeParse({
        n: 1, at: '2026-09-20T10:15:00.000Z', type: 'compaction',
        data: { trigger, succeeded: true, before: 10, after: 5 },
      }).success).toBe(true);
    }
  });

  test('every hook-check mode and outcome, and the excursion an outside read is', () => {
    for (const mode of ['changed', 'complete']) {
      for (const outcome of ['passed', 'findings', 'not-checked']) {
        expect(observationSchema.safeParse({
          n: 1, at: '2026-09-20T10:15:00.000Z', type: 'hook-check',
          data: { paths: ['a.ts'], mode, outcome, reason: null, newFindings: 0, log: null },
        }).success).toBe(true);
      }
    }
    expect(observationSchema.safeParse({
      n: 1, at: '2026-09-20T10:15:00.000Z', type: 'hook-check',
      data: { paths: [], mode: 'partial', outcome: 'passed', reason: null, newFindings: 0, log: null },
    }).success).toBe(false);
    expect(observationSchema.safeParse({
      n: 1, at: '2026-09-20T10:15:00.000Z', type: 'excursion',
      data: { callId: 'c1', module: 'shop/orders', firstEntry: true },
    }).success).toBe(true);
  });

  test('a tool activity carries the command text where the tool ran one', () => {
    expect(observationSchema.safeParse({
      n: 1, at: '2026-09-20T10:15:00.000Z', type: 'activity',
      data: { activity: { kind: 'tool', callId: 'c1', tool: 'shell', command: 'ls -la' } },
    }).success).toBe(true);
    // A tool that runs no command carries none, and nothing else is added.
    expect(observationSchema.safeParse({
      n: 1, at: '2026-09-20T10:15:00.000Z', type: 'activity',
      data: { activity: { kind: 'tool', callId: 'c1', tool: 'run_scope_tests' } },
    }).success).toBe(true);
    expect(observationSchema.safeParse({
      n: 1, at: '2026-09-20T10:15:00.000Z', type: 'activity',
      data: { activity: { kind: 'tool', callId: 'c1', tool: 'shell', argv: ['ls'] } },
    }).success).toBe(false);
  });
});

describe('the harness tools an engineer is given', () => {
  test('the shell takes a command and an optional timeout, and nothing else', () => {
    expect(shellInputSchema.safeParse({ command: 'npm run build' }).success).toBe(true);
    expect(shellInputSchema.safeParse({ command: 'npm run build', timeoutMs: 1_000 }).success).toBe(true);
    expect(shellInputSchema.safeParse({ command: '' }).success).toBe(false);
    expect(shellInputSchema.safeParse({ command: 'true', timeoutMs: 0 }).success).toBe(false);
    expect(shellInputSchema.safeParse({ command: 'true', cwd: '/elsewhere' }).success).toBe(false);
    // No field for anything the harness already knows: not the invocation,
    // not the working directory, not the scope.
    const properties = (shellJsonSchema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(properties).sort()).toEqual(['command', 'timeoutMs']);
  });
});

describe('the records this iteration establishes', () => {
  const citation = { module: 'shop/orders' };

  test('every hypothesis change, standing and confidence is written and read back', async () => {
    const store = await ledger();
    expect(hypothesisChangeSchema.options).toEqual(['reuse', 'extend', 'create', 'create-by-extraction']);
    expect(hypothesisSchema.shape.standing.options).toEqual(['tentative', 'confirmed', 'superseded']);

    let index = 0;
    for (const change of hypothesisChangeSchema.options) {
      for (const standing of hypothesisSchema.shape.standing.options) {
        for (const confidence of hypothesisSchema.shape.confidence.options) {
          index += 1;
          const id = `h-${index}`;
          const read = await store.roundTrip(analysisLayout.hypothesis(id, 1), {
            schema: 'ramify-agent.hypothesis/1', id, revision: 1, standing, capability: id, change,
            suggestedOwner: 'shop/orders', anticipatedConsumers: [], involvedModules: ['shop'],
            dependsOn: [], confidence, rationale: 'r', assumptions: [], uncertainties: [],
            citations: [citation], cause: { initial: 'inv-0001' },
          }, analysisSchemas.hypothesis);
          expect(read).toMatchObject({ change, standing, confidence });
        }
      }
    }

    // The other arm of `cause`: a revision one global decision caused,
    // which a placement fork produces.
    const fromDecision = await store.roundTrip(analysisLayout.hypothesis('h-decided', 2), {
      schema: 'ramify-agent.hypothesis/1', id: 'h-decided', revision: 2, standing: 'confirmed', capability: 'h-decided',
      change: 'create', suggestedOwner: 'shop/orders', anticipatedConsumers: [], involvedModules: [],
      dependsOn: [], confidence: 'high', rationale: 'r', assumptions: [], uncertainties: [],
      citations: [], cause: { decision: 'gd-001', reason: 'the fork decided otherwise' }, confirmedBy: 'gd-001',
    }, analysisSchemas.hypothesis);
    expect(fromDecision.cause).toEqual({ decision: 'gd-001', reason: 'the fork decided otherwise' });
  });

  test('every registry origin is written and read back', async () => {
    const store = await ledger();
    const origins = registryEntrySchema.shape.origin.options;
    expect(origins).toEqual(['entry', 'global-decision', 'local-decision']);
    for (const origin of origins) {
      const capability = `c-${origin}`;
      const read = await store.roundTrip(analysisLayout.registry(capability, 1), {
        schema: 'ramify-agent.capability/1', capability, revision: 1, behavior: 'b',
        owner: 'shop/orders', origin, decision: origin === 'entry' ? null : 'gd-001',
        consumers: origin === 'entry' ? [] : [{ capability: 'other', workItem: 'wi-001' }],
        ...(origin === 'entry' ? {} : { previousOwner: 'shop' }),
      }, analysisSchemas.registry);
      expect(read).toMatchObject({ origin });
    }
  });

  test('every work-item origin and every decomposition kind is written and read back', async () => {
    const store = await ledger();
    const origins = [
      { entry: 'send-email' },
      { obligation: { id: 'ob-send-email', revision: 1, hash: 'a'.repeat(64) } },
      { verification: { id: 'cr-wi-001-send-email', revision: 1, hash: 'b'.repeat(64) } },
    ];
    let index = 0;
    for (const origin of origins) {
      index += 1;
      const id = `wi-${String(index).padStart(3, '0')}`;
      const read = await store.roundTrip(workLayout.item(id), {
        schema: 'ramify-agent.work-item/1', id, module: 'shop/orders', origin,
        goal: 'g', requirementRefs: [], acceptanceRefs: [], startedFor: index === 1 ? null : 'wi-001',
        ...(index === 3 ? { follows: 'wi-001' } : {}),
      }, workSchemas.item);
      expect(read.origin).toEqual(origin);
    }

    expect(decompositionSchema.shape.kind.options).toEqual(['single-iteration', 'staged']);
    for (const kind of decompositionSchema.shape.kind.options) {
      const read = await store.roundTrip(workLayout.outline('wi-001', kind === 'staged' ? 2 : 1), {
        schema: 'ramify-agent.work-item-outline/1', workItem: 'wi-001', revision: kind === 'staged' ? 2 : 1,
        invocation: 'inv-0002', changes: 'c', decomposition: { kind, rationale: 'r' },
        reuse: [{ capability: 'send-email', owner: 'shop/orders', role: 'provider' }],
        breakingChanges: kind === 'staged'
          ? [{ guarantee: 'g', reason: 'r', affectedConsumers: ['shop'], citations: [citation] }]
          : [],
        stages: kind === 'staged'
          ? [
            { title: 'One', approach: 'non-breaking' as const, dependsOn: [], note: '' },
            { title: 'Two', approach: 'breaking' as const, dependsOn: [0], note: '' },
          ]
          : [],
        hypothesesSeen: [{ id: 'h-1', revision: 1, hash: 'c'.repeat(64) }],
        revisionReason: kind === 'staged' ? 'the gate failed' : '',
      }, workSchemas.outline);
      expect(read.decomposition.kind).toBe(kind);
    }
  });

  test('every member of the local architect submission this iteration offers', () => {
    const kinds = localArchitectSubmissionSchema.options.map(option => option.shape.kind.value);
    expect(kinds).toEqual(['assign', 'request-placement', 'request-completion', 'yield-for-providers', 'unresolved']);
    // The package offers exactly the members a run of this iteration produces.
    expect([...localArchitectSubmissionKinds]).toEqual(kinds);
  });

  test('every member of the engineer submission, and the two unsuitable reasons offered', () => {
    const kinds = engineerSubmissionSchema.options.map(option => option.shape.kind.value);
    expect(kinds).toEqual(['completion-proposed', 'partial', 'unsuitable', 'contract-needed']);
    expect([...engineerSubmissionKinds]).toEqual(kinds);
    // `obligation-change` and `unplaced-need` have no iteration that can act
    // on them yet, so the role never sees them and no run can produce one.
    // `provider-cannot-conform` gained its producer with the
    // contract-revision path and `break-discovered` with the breaking one;
    // each carries the rule the schema cannot hold beside it.
    expect(unsuitableReasonSchema.options).toEqual(['scope', 'break-discovered', 'provider-cannot-conform']);
    expect(engineerSubmissionSchema.safeParse({ kind: 'unsuitable', reason: 'obligation-change', detail: 'x' }).success).toBe(false);
    expect(engineerSubmissionSchema.safeParse({ kind: 'unsuitable', reason: 'break-discovered', detail: 'x' }).success).toBe(true);
    expect(engineerSubmissionSchema.safeParse({ kind: 'unsuitable', reason: 'provider-cannot-conform', detail: 'x' }).success).toBe(true);
    // A need is written as behavior. Naming the design would decide for the
    // other side, so a submission that names one is refused by the schema.
    expect(engineerSubmissionSchema.safeParse({ kind: 'contract-needed', capability: 'x', behavior: {} }).success).toBe(false);
  });

  test('every iteration kind, extra purpose and result outcome is written and read back', async () => {
    const store = await ledger();
    expect(iterationKindSchema.options).toEqual(['ordinary', 'breaking', 'contract', 'verification', 'repair', 'integration']);
    expect(extraPurposeSchema.options).toEqual(['contract', 'conformance', 'fake', 'exposure-declaration', 'consumer']);

    const outlineRef = { id: 'wi-001', revision: 1, hash: 'd'.repeat(64) };
    for (const [index, kind] of iterationKindSchema.options.entries()) {
      const id = `wi-001.i${String(index + 1).padStart(2, '0')}`;
      const read = await store.roundTrip(iterationLayout.assignment('wi-001', index + 1), {
        schema: 'ramify-agent.iteration-assignment/1',
        id, workItem: 'wi-001', outline: outlineRef, stage: 0, kind,
        goal: 'g', approach: 'a',
        scope: {
          revision: index + 1,
          // Both arms of the base: the named module with its included
          // children, and the explicitly broad scope a breaking iteration
          // takes. The broad arm has no producer until that iteration.
          base: kind === 'breaking'
            ? { modules: ['shop', 'shop/orders'], rationale: 'the guarantee changes in both' }
            : { module: 'shop/orders', includedChildren: ['shop/orders/pricing'] },
          extra: extraPurposeSchema.options.map(purpose => ({ path: `subs/orders/src/${purpose}.ts`, purpose })),
          read: ['shop'],
          bootstrap: kind === 'ordinary' ? [{ capability: outlineRef, directory: 'subs/orders/subs/pricing' }] : [],
          rationale: 'r',
          resolved: { roots: ['/p/subs/orders/src'], files: ['/p/subs/orders/module.ramify'], view: { status: 'placeholder' } },
        },
        requirementRefs: [{ anchor: 'Request' }],
        externalCapabilities: [{ capability: 'send-email', owner: 'shop', role: 'use' }],
        completionEvidence: 'e',
        evidenceObligations: [{ suite: ['subs/orders/src/tests/conformance.test.ts'], against: 'fake' }],
        gate: kind === 'breaking'
          ? { checkpoint: 'breaking-iteration', tests: { policy: 'all-project', exactOwners: [], subtrees: [], extraSuites: [] } }
          : { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: ['shop/orders'], subtrees: [], extraSuites: [] } },
        guarded: [{ path: 'package.json', hash: 'e'.repeat(64) }],
        // An authorization names a guarded path, the reason, and the record
        // that authorized it. Both states are representable: none, and one.
        authorizations: kind === 'breaking'
          ? [{ path: 'package.json', rationale: 'the request supersedes the manifest\'s own entry', by: outlineRef }]
          : [],
      }, iterationSchemas.assignment);
      expect(read.kind).toBe(kind);
      expect(read.gate.checkpoint).toBe(kind === 'breaking' ? 'breaking-iteration' : 'iteration');
    }

    const outcomes = iterationResultSchema.shape.outcome.options;
    expect(outcomes).toEqual(['accepted', 'partial', 'unsuitable', 'exhausted', 'superseded']);
    for (const [index, outcome] of outcomes.entries()) {
      const read = await store.roundTrip(iterationLayout.result('wi-002', index + 1), {
        schema: 'ramify-agent.iteration-result/1',
        iteration: `wi-002.i${String(index + 1).padStart(2, '0')}`,
        outcome,
        invocations: ['inv-0003'],
        gate: outcome === 'accepted' ? 'ga-0004' : null,
        commit: outcome === 'accepted' ? 'abc123' : null,
        findings: ['f'], changedAssumptions: [], artifacts: [],
        ...(outcome === 'accepted' ? { recommendation: 'consider extracting the formatter' } : {}),
      }, iterationSchemas.result);
      expect(read.outcome).toBe(outcome);
    }
  });

  test('every contract, obligation and requirement value is written and read back', async () => {
    const store = await ledger();
    expect(contractModeSchema.options).toEqual(['fake-backed', 'access-only']);
    expect(contractAuthoritySchema.shape.kind.options).toEqual(['provider', 'consumer', 'independent']);

    const capability = { id: 'note-limit', revision: 1, hash: 'a'.repeat(64) };
    // Both modes, and all three authorities the contract-authority rule
    // distinguishes. `fake-backed` and `provider` have producers in a run;
    // `access-only`, `consumer` and `independent` have none yet.
    for (const [index, authority] of contractAuthoritySchema.shape.kind.options.entries()) {
      const mode = index === 0 ? 'fake-backed' : 'access-only';
      const id = `ct-00${index + 1}`;
      const read = await store.roundTrip(contractsLayout.contract(id, 1), {
        schema: 'ramify-agent.contract/1',
        id, revision: 1, capability,
        // Null where the initial analysis placed the capability and no
        // decision was taken, which is what an entry capability leaves.
        decision: index === 0 ? null : 'gd-001',
        authority: { kind: authority, owner: 'shop/orders', rationale: 'the rule that places it' },
        provider: 'shop/orders',
        behavior: 'a note of at most 500 characters is within the limit',
        mode,
        artifacts: {
          interface: [{ path: 'subs/orders/src/interfaces/note-limit.ts', exports: ['NoteLimit'], hash: 'b'.repeat(64) }],
          conformance: mode === 'fake-backed' ? [{ path: 'subs/orders/src/tests/note-limit.conformance.test.ts', hash: 'c'.repeat(64) }] : [],
          fake: mode === 'fake-backed' ? [{ path: 'subs/orders/src/fakes/note-limit.fake.ts', exports: ['createNoteLimitFake'], hash: 'd'.repeat(64) }] : [],
          exposure: [{ path: 'subs/orders/module.ramify', declaration: 'expose-src NoteLimit from "interfaces/note-limit.ts" to parent' }],
        },
        establishedBy: { iteration: 'wi-001.i02', gate: 'ga-0003' },
      }, contractSchemas.contract);
      expect(read.mode).toBe(mode);
      expect(read.authority.kind).toBe(authority);
    }

    // One obligation per contract, keyed by it, and its evidence is run
    // against the real provider and against nothing else.
    const obligation = await store.roundTrip(contractsLayout.obligation('ob-ct-001', 1), {
      schema: 'ramify-agent.provider-obligation/1',
      id: 'ob-ct-001', revision: 1,
      contract: { id: 'ct-001', revision: 1, hash: 'e'.repeat(64) },
      capability: 'note-limit', provider: 'shop/orders',
      behavior: 'a note of at most 500 characters is within the limit',
      evidence: { conformance: ['subs/orders/src/tests/note-limit.conformance.test.ts'], against: 'real' },
    }, contractSchemas.obligation);
    expect(obligation.evidence.against).toBe('real');
    expect(obligationId('ct-001')).toBe('ob-ct-001');

    const requirement = await store.roundTrip(contractsLayout.requirement('rq-001', 1), {
      schema: 'ramify-agent.consumer-requirement/1',
      id: 'rq-001', revision: 1, workItem: 'wi-001', consumer: 'shop/notes',
      forCapability: 'review-notes', obligation: 'ob-ct-001', contractRevision: 1,
      behavior: 'a note of at most 500 characters is within the limit',
      evidence: {
        tests: { policy: 'owned-by-scope', exactOwners: ['shop/notes'], subtrees: [], extraSuites: [] },
        fakeInjections: ['subs/notes/src/notes.ts'],
      },
    }, contractSchemas.requirement);
    expect(requirement.contractRevision).toBe(1);
  });

  test('every member of the contract submission this iteration offers', () => {
    const kinds = contractSubmissionSchema.options.map(option => option.shape.kind.value);
    expect(kinds).toEqual(['established', 'incomplete']);
    expect([...contractSubmissionKinds]).toEqual(kinds);
  });

  test('both outcomes of a harness-verified gate rule are representable', () => {
    for (const outcome of ['passed', 'failed'] as const) {
      const rule = { rule: 'fake-naming' as const, outcome, violations: outcome === 'failed' ? [{ rule: 'file-suffix', path: 'a.ts', detail: 'd' }] : [] };
      expect(gateRuleSchema.safeParse(rule).success).toBe(true);
    }
  });

  test('both module notices are representable, with and without a decision', () => {
    for (const kind of ['module-created', 'module-removed'] as const) {
      expect(moduleNoticeSchema.safeParse({
        kind, module: 'shop/orders/pricing', declaration: 'subs/orders/subs/pricing/module.ramify',
        commit: 'abc', iteration: 'wi-001.i01',
        // An entry assignment proposed its own owner and names no decision,
        // which is what null says.
        decision: null,
      }).success).toBe(true);
    }
    expect(moduleNoticeSchema.safeParse({
      kind: 'module-created', module: 'shop/orders/pricing', declaration: 'subs/orders/subs/pricing/module.ramify',
      commit: 'abc', iteration: 'wi-001.i01', decision: { id: 'gd-001', revision: 1, hash: 'f'.repeat(64) },
    }).success).toBe(true);
  });

  test('every placement outcome and authority is written and read back', async () => {
    const store = await ledger();
    expect(placementOutcomeSchema.options).toEqual(['reuse', 'extend', 'create', 'extract', 'external']);
    expect(decisionAuthoritySchema.options).toEqual(['global', 'local']);

    let index = 0;
    for (const outcome of placementOutcomeSchema.options) {
      for (const authority of decisionAuthoritySchema.options) {
        index += 1;
        const id = authority === 'global' ? `gd-${String(index).padStart(3, '0')}` : `ld-wi-001-${String(index).padStart(2, '0')}`;
        const read = await store.roundTrip(architectureLayout.decision(id), {
          schema: 'ramify-agent.placement-decision/1',
          id, authority,
          request: authority === 'global' ? 'pr-001' : null,
          workItem: 'wi-001', invocation: 'inv-0003',
          question: 'Where does it belong?',
          outcome,
          capability: 'send-email',
          // Null only for `external`, which no module owns.
          owner: outcome === 'external' ? null : 'shop/orders',
          ...(outcome === 'create' || outcome === 'extract'
            ? { proposed: { parent: 'shop', directory: 'subs/mail', purpose: 'Sends mail.', tags: [] } }
            : {}),
          rationale: 'r', constraints: ['c'], uncertainties: ['u'],
          evidence: { view: { status: 'placeholder' }, citations: [citation], gaps: ['no dependency facts'] },
          ...(outcome === 'extract'
            ? { revises: { decision: 'gd-001', affected: [{ workItem: 'wi-002', contract: 'send-email', consequence: 'its consumer moves' }] } }
            : {}),
          registry: [{ id: 'send-email', revision: 2, hash: 'a'.repeat(64) }],
          hypothesisRevisions: [{ id: 'email-delivery', revision: 2, hash: 'b'.repeat(64) }],
          ...(authority === 'global' ? { brief: 'what a later fork needs to know' } : {}),
        }, architectureSchemas.decision);
        expect(read).toMatchObject({ outcome, authority });
      }
    }
  });

  test('every stance a request can take on a hypothesis is written and read back', async () => {
    const store = await ledger();
    expect(hypothesisStanceSchema.options).toEqual(['supports', 'contradicts', 'departs']);
    for (const [index, stance] of hypothesisStanceSchema.options.entries()) {
      const id = `pr-${String(index + 1).padStart(3, '0')}`;
      const read = await store.roundTrip(architectureLayout.request(id), {
        schema: 'ramify-agent.placement-request/1',
        id, workItem: 'wi-001', requester: 'shop/orders', forCapability: 'send-email',
        question: 'Where does it belong?', requiredBehavior: 'one message per order',
        findings: [{ text: 'orders already sends one', citations: [citation] }],
        candidates: [{ capability: 'send-email', owner: 'shop/orders', note: 'it is here today' }, { note: 'or nowhere yet' }],
        unresolved: ['whether billing needs the same'],
        hypotheses: [{ ref: { id: 'email-delivery', revision: 1, hash: 'c'.repeat(64) }, stance, evidence: 'e' }],
        localDecisions: ['ld-wi-001-01'],
      }, architectureSchemas.request);
      expect(read.hypotheses[0]!.stance).toBe(stance);
    }
  });

  test('every member of the fork submission this iteration offers', () => {
    const kinds = forkSubmissionSchema.options.map(option => option.shape.kind.value);
    expect(kinds).toEqual(['decision', 'partial']);
    // The package offers exactly the members a run of this iteration
    // produces, and both have one.
    expect([...forkSubmissionKinds]).toEqual(kinds);
  });

  test('the two events a contract revision writes carry every binding it scheduled', () => {
    const at = '2026-09-21T10:15:00.000Z';
    const jobId = '20260920T101500Z-3f9a1c';
    const reopened = runEventSchema.parse({
      sequence: 1, jobId, at, type: 'evidence-reopened',
      data: {
        cause: 'wi-004.i02 revised ct-001 from revision 1 to 2',
        contract: 'ct-001', revision: 2, iteration: 'wi-004.i02', obligation: 'ob-ct-001',
        requirements: ['rq-001', 'rq-002', 'rq-003'],
        bindings: [
          { subject: { id: 'ob-ct-001', revision: 2, hash: 'a'.repeat(64) }, workItem: 'wi-005' },
          { subject: { id: 'rq-001', revision: 2, hash: 'b'.repeat(64) }, workItem: 'wi-006' },
          { subject: { id: 'rq-003', revision: 2, hash: 'c'.repeat(64) }, workItem: 'wi-004' },
        ],
        followUps: [{ workItem: 'wi-005', follows: 'wi-002' }, { workItem: 'wi-006', follows: 'wi-001' }],
        superseded: ['wi-002.i01'],
      },
    });
    expect(reopened.type).toBe('evidence-reopened');
    if (reopened.type === 'evidence-reopened') {
      // A reused item is bound without a follow-up; a completed one is
      // followed, and the prior item keeps its own completion.
      expect(reopened.data.bindings).toHaveLength(3);
      expect(reopened.data.followUps.map(entry => entry.follows)).toEqual(['wi-002', 'wi-001']);
    }

    const needed = runEventSchema.parse({
      sequence: 2, jobId, at, type: 'revision-needed',
      data: { obligation: { id: 'ob-ct-001', revision: 1, hash: 'd'.repeat(64) }, iteration: 'wi-002.i01', consumerWorkItem: 'wi-001' },
    });
    expect(needed.type).toBe('revision-needed');
    // Neither event carries a status or a verdict: what the run did is the
    // log, and nothing here is rewritten.
    expect(runEventSchema.safeParse({
      sequence: 3, jobId, at, type: 'revision-needed',
      data: { obligation: { id: 'ob-ct-001', revision: 1, hash: 'd'.repeat(64) }, iteration: 'wi-002.i01', consumerWorkItem: 'wi-001', resolved: false },
    }).success).toBe(false);
  });

  test('every kind a local architect may assign, and the revision only a contract iteration carries', () => {
    expect(assignableKindSchema.options).toEqual(['ordinary', 'breaking', 'verification', 'repair', 'contract']);
    const base = {
      stage: 0,
      goal: 'g',
      approach: 'a',
      scope: { base: { module: 'shop/orders', includedChildren: [] }, extra: [], read: [], rationale: 'r' },
      requirementRefs: [],
      externalCapabilities: [],
      completionEvidence: 'e',
    };
    for (const kind of assignableKindSchema.options) {
      expect(assignmentBodySchema.safeParse({ ...base, kind }).success).toBe(true);
    }
    // The agreement is named; the revision number is not, because the
    // harness fills it and no submission chooses one.
    const revising = assignmentBodySchema.parse({ ...base, kind: 'contract', revisesContract: 'ct-001' });
    expect(revising.revisesContract).toBe('ct-001');
    expect(assignmentBodySchema.safeParse({ ...base, kind: 'contract', revisesContract: 'ct-001', revision: 2 }).success).toBe(false);
    expect(assignmentBodySchema.safeParse({ ...base, kind: 'integration' }).success).toBe(false);

    // Both arms of the base a submission may state. The broad one carries
    // its rationale; the schema accepts a blank one so the rule beside it can
    // say what is missing, and a base with neither shape is refused.
    const broad = { base: { modules: ['shop', 'shop/orders'], rationale: 'the guarantee changes in both' }, extra: [], read: [], rationale: 'r' };
    expect(assignmentBodySchema.safeParse({ ...base, kind: 'breaking', scope: broad }).success).toBe(true);
    expect(assignmentBodySchema.safeParse({ ...base, kind: 'breaking', scope: { ...broad, base: { modules: ['shop'], rationale: '' } } }).success).toBe(true);
    expect(assignmentBodySchema.safeParse({ ...base, kind: 'breaking', scope: { ...broad, base: { modules: [] as string[], rationale: 'r' } } }).success).toBe(false);
    expect(assignmentBodySchema.safeParse({ ...base, kind: 'breaking', scope: { ...broad, base: { module: 'shop', modules: ['shop'], rationale: 'r' } } }).success).toBe(false);

    // An authorization is a path and a reason. The record that authorizes it
    // is the harness's, so the submission has no field for one.
    expect(assignmentBodySchema.safeParse({ ...base, kind: 'ordinary', authorizations: [{ path: 'vitest.config.ts', rationale: 'r' }] }).success).toBe(true);
    expect(assignmentBodySchema.safeParse({
      ...base, kind: 'ordinary',
      authorizations: [{ path: 'vitest.config.ts', rationale: 'r', by: { id: 'wi-001', revision: 1, hash: 'd'.repeat(64) } }],
    }).success).toBe(false);
  });

  test('the iteration assignment carries no field for what the harness decides itself', () => {
    const shape = (z.toJSONSchema(iterationAssignmentSchema) as { properties?: Record<string, unknown> }).properties ?? {};
    for (const field of ['gate', 'guarded', 'id', 'workItem', 'scope']) expect(shape).toHaveProperty(field);
    // What the architect submits, which is the same record without them.
    const body = (assignmentBodySchema.shape as Record<string, unknown>);
    for (const field of ['gate', 'guarded', 'id', 'workItem', 'outline', 'evidenceObligations']) {
      expect(body).not.toHaveProperty(field);
    }
  });
});

describe('the protocol vocabulary', () => {
  test('every role has a context policy, and none of them has a default', () => {
    for (const role of roleSchema.options) {
      const policy = defaultContextPolicies[role];
      expect(policy).toBeDefined();
      expect(['forbidden', 'allowed']).toContain(policy.compaction);
      expect(policy.reportReserveTokens).toBeGreaterThan(0);
    }
    expect(roleSchema.options).toEqual(['initial-architect', 'global-fork', 'local-architect', 'engineer', 'contract-engineer']);
  });

  test('every failure reason and every phase is named', () => {
    expect(runFailureReasonSchema.options).toEqual([
      'analysis-invalid', 'readiness-failed', 'agent-failed', 'invalid-submission', 'inputs-changed',
      'dependency-cycle', 'unresolvable-requirement', 'repair-exhausted', 'recovery-exhausted',
      'writer-unsettled', 'limit-exceeded', 'internal',
    ]);
    expect(runPhaseSchema.options).toEqual(['analysis', 'readiness', 'working', 'final-verification', 'ended']);
    expect(sessionModeSchema.options).toEqual(['fresh', 'continued', 'fork']);
  });

  test('every measurement snapshot and scope component state is representable', () => {
    expect(measurementSnapshotSchema.shape.policy.value).toBe('scope-size/1');
  });
});

describe('the run protocol a client reads', () => {
  const hash64 = 'a'.repeat(64);

  test('every error code has a status, and a record of an unsupported version is its own code', () => {
    expect(errorCodeSchema.options).toEqual([
      'invalid-request', 'not-found', 'unreadable', 'conflict', 'stale-version', 'busy', 'unavailable', 'inputs-changed', 'internal',
      'unsupported-version',
    ]);
    for (const code of errorCodeSchema.options) expect(errorHttpStatus[code]).toBeGreaterThanOrEqual(400);
    expect(errorHttpStatus['unsupported-version']).toBe(422);
    expect(errorResponseSchema.safeParse({ error: { code: 'unsupported-version', message: 'm', evidence: ['plans/p/.harness/jobs/j/job.json'] } }).success).toBe(true);
  });

  test('every notice kind is representable; module-removed has no producer in a run yet', () => {
    expect(runNoticeSchema.options.map(option => option.shape.kind.value)).toEqual(['module-created', 'module-removed', 'dependency-cycle']);
    const common = { at: '2026-09-21T08:00:00.000Z', sequence: 3, summary: 's' };
    for (const kind of ['module-created', 'module-removed'] as const) {
      expect(runNoticeSchema.safeParse({ kind, ...common, module: 'm', declaration: 'subs/m/module.ramify', commit: 'abc', iteration: 'wi-001.i01', decision: null }).success).toBe(true);
    }
    expect(runNoticeSchema.safeParse({ kind: 'dependency-cycle', ...common, cycle: ['a', 'b'], closedBy: 'wi-001', resolved: false }).success).toBe(true);
    expect(runNoticeSchema.safeParse({ kind: 'dependency-cycle', ...common, cycle: [], closedBy: 'wi-001', resolved: false }).success).toBe(false);
  });

  test('every metric state is representable, and only a measured metric has a value', () => {
    expect(metricStateSchema.options).toEqual(['measured', 'partial', 'unavailable', 'not-applicable']);
    const base = { id: 'm', unit: 'u', policyVersion: 'kpi/1', measurementPolicy: null, numerator: null, denominator: null, subtotal: null, coverage: null, evidence: [], note: null };
    for (const state of metricStateSchema.options) {
      expect(metricSchema.safeParse({ ...base, state, value: state === 'measured' ? 1 : null }).success).toBe(true);
      expect(metricSchema.safeParse({ ...base, state, value: state === 'measured' ? null : 0 }).success).toBe(false);
    }
  });

  test('every state a work item and a capability can be read in is named', () => {
    expect(workItemStateSchema.options).toEqual(['todo', 'working', 'yielded', 'completed']);
    expect(capabilityStateSchema.options).toEqual(['todo', 'working', 'completed']);
    expect(hypothesisStandingSchema.options).toEqual(['tentative', 'confirmed', 'superseded']);
  });

  test('every reference kind of a projected event has a producer among the run log\'s events', () => {
    const r = { id: 'x', revision: 1, hash: hash64 };
    const events: Array<[RunEvent['type'], unknown]> = [
      ['placement-requested', { request: 'pr-001', workItem: 'wi-001', requester: 'm', capability: 'c' }],
      ['decision-accepted', { request: 'pr-001', decision: 'gd-001', workItem: 'wi-001', invocation: 'inv-0002', registry: 0, hypotheses: 0 }],
      ['iteration-closed', { workItem: 'wi-001', iteration: 'wi-001.i01', outcome: 'accepted', gate: 'ga-0001', commit: 'abc', notices: [] }],
      ['contract-registered', { contract: 'ct-001', revision: 1, mode: 'fake-backed', iteration: 'wi-001.i02', obligation: 'ob-ct-001', requirements: ['rq-001'], providerWorkItem: 'wi-002' }],
      ['invocation-started', { invocation: 'inv-0001', role: 'engineer' }],
      ['revision-needed', { obligation: r, iteration: 'wi-002.i01', consumerWorkItem: 'wi-001' }],
    ];
    const kinds = new Set(events.flatMap(([type, data], index) =>
      projectEvent(runEventSchema.parse({ sequence: index + 1, jobId: '20260920T101500Z-3f9a1c', at: '2026-09-20T10:15:00.000Z', type, data })).refs.map(ref => ref.kind)));
    expect([...kinds].sort()).toEqual([...runEventRefKindSchema.options].sort());
  });

  test('every event type of the run log has a projection that names its transition', () => {
    for (const option of runEventSchema.options) {
      const type = option.shape.type.value;
      expect(() => projectEvent({ sequence: 1, jobId: 'j', at: '2026-09-20T10:15:00.000Z', type, data: sampleData(type) } as RunEvent)).not.toThrow();
    }
  });

  test('every kind of decision is produced from the record that holds it, and no choice is copied', () => {
    const outlineRef = { id: 'wi-001', revision: 1, hash: hash64 };
    const run = constructedRun([
      { type: 'job-started', data: {} },
      {
        type: 'outline-revised', data: {},
        records: [{ path: 'work-items/wi-001/outline/1.json', body: {
          schema: 'ramify-agent.work-item-outline/1', workItem: 'wi-001', revision: 1, invocation: 'inv-0002', changes: 'c',
          decomposition: { kind: 'staged', rationale: 'r' }, reuse: [],
          breakingChanges: [{ guarantee: 'g', reason: 'why', affectedConsumers: ['shop/web'], citations: [] }],
          stages: [{ title: 't', approach: 'breaking', dependsOn: [], note: '' }], hypothesesSeen: [], revisionReason: '',
        } }],
      },
      {
        type: 'iteration-assigned', data: {},
        records: [{ path: 'work-items/wi-001/iterations/01/assignment.json', body: {
          schema: 'ramify-agent.iteration-assignment/1', id: 'wi-001.i01', workItem: 'wi-001', outline: outlineRef, stage: 0, kind: 'breaking',
          goal: 'g', approach: 'a',
          scope: {
            revision: 1, base: { modules: ['shop', 'shop/web'], rationale: 'the guarantee changes in both' }, extra: [], read: [], bootstrap: [], rationale: 'r',
            resolved: { roots: ['/p/src'], files: [], view: { status: 'placeholder' } },
          },
          requirementRefs: [], externalCapabilities: [], completionEvidence: 'e', evidenceObligations: [],
          gate: { checkpoint: 'breaking-iteration', tests: { policy: 'all-project', exactOwners: [], subtrees: [], extraSuites: [] } },
          guarded: [], authorizations: [{ path: 'package.json', rationale: 'the request supersedes it', by: outlineRef }],
        } }],
      },
      {
        type: 'decision-accepted', data: {},
        records: [{ path: 'decisions/gd-001.json', body: {
          schema: 'ramify-agent.placement-decision/1', id: 'gd-001', authority: 'global', request: 'pr-001', workItem: 'wi-001', invocation: 'inv-0003',
          question: 'Where?', outcome: 'reuse', capability: 'send-email', owner: 'shop', rationale: 'r', constraints: [], uncertainties: [],
          evidence: { view: { status: 'placeholder' }, citations: [], gaps: [] },
          registry: [{ id: 'send-email', revision: 1, hash: hash64 }], hypothesisRevisions: [{ id: 'mail', revision: 2, hash: hash64 }], brief: 'b',
        } }],
      },
      {
        type: 'contract-registered', data: {},
        records: [{ path: 'contracts/ct-001/1.json', body: {
          schema: 'ramify-agent.contract/1', id: 'ct-001', revision: 1, capability: { id: 'send-email', revision: 1, hash: hash64 }, decision: 'gd-001',
          authority: { kind: 'provider', owner: 'shop', rationale: 'r' }, provider: 'shop', behavior: 'b', mode: 'fake-backed',
          artifacts: { interface: [], conformance: [], fake: [], exposure: [] }, establishedBy: { iteration: 'wi-001.i01', gate: 'ga-0002' },
        } }],
      },
    ]);
    const decisions = decisionsOf(runView(run));
    for (const decision of decisions) decisionViewSchema.parse(decision);
    expect(decisions.map(decision => decision.kind)).toEqual(['plan-revision', 'breaking', 'scope', 'placement', 'contract']);
    expect([...new Set(decisions.map(decision => decision.kind))].sort()).toEqual([...decisionViewSchema.options.map(option => option.shape.kind.value)].sort());
    expect(decisions.find(decision => decision.kind === 'scope')).toMatchObject({ broad: true, modules: ['shop', 'shop/web'], authorizations: [{ path: 'package.json', by: 'wi-001@1' }] });
    expect(decisions.find(decision => decision.kind === 'placement')).toMatchObject({ hypotheses: [{ id: 'mail', revision: 2 }], registry: ['send-email'] });
  });
});

/** The smallest data each event type's schema accepts, for the projection's exhaustiveness. */
function sampleData(type: RunEvent['type']): unknown {
  const r = { id: 'x', revision: 1, hash: 'a'.repeat(64) };
  const samples: Partial<Record<RunEvent['type'], unknown>> = {
    'invocation-started': { invocation: 'inv-0001', role: 'engineer' },
    'invocation-ended': { invocation: 'inv-0001', ended: 'submitted', submission: null },
    'analysis-accepted': { invocation: 'inv-0001', entries: 0, hypotheses: 0, registry: 0, workItems: 0 },
    'readiness-passed': { attempt: 1, gate: 'ga-0001' },
    'readiness-failed': { attempt: 1, step: 'git-clean', detail: '', recovery: null, final: true },
    'work-item-started': { workItem: 'wi-001', module: 'm' },
    'hypotheses-delivered': { workItem: 'wi-001', refs: [r] },
    'placement-requested': { request: 'pr-001', workItem: 'wi-001', requester: 'm', capability: 'c' },
    'view-refreshed': { request: 'pr-001', attempt: 1, view: { status: 'placeholder' }, unavailable: null },
    'fork-returned-partial': { request: 'pr-001', invocation: 'inv-0002', retry: 1 },
    'decision-accepted': { request: 'pr-001', decision: 'gd-001', workItem: 'wi-001', invocation: 'inv-0002', registry: 0, hypotheses: 0 },
    'brief-appended': { decision: 'gd-001', generation: 1, session: 's', outcome: 'appended' },
    'global-context-rebuilt': { generation: 2, reason: 'lost' },
    'decision-delivered': { decision: 'gd-001', workItem: 'wi-001' },
    'outline-revised': { workItem: 'wi-001', revision: 1, invocation: 'inv-0002' },
    'iteration-assigned': { workItem: 'wi-001', iteration: 'wi-001.i01', kind: 'ordinary', scopeRevision: 1, invocation: 'inv-0002', decisions: [] },
    'iteration-closed': { workItem: 'wi-001', iteration: 'wi-001.i01', outcome: 'partial', gate: null, commit: null, notices: [] },
    'contract-requested': { workItem: 'wi-001', iteration: 'wi-001.i02', scopeRevision: 1, invocation: 'inv-0003', capability: 'c', consumer: 'm', provider: 'p', requestedBy: null, revises: null },
    'contract-registered': { contract: 'ct-001', revision: 1, mode: 'access-only', iteration: 'wi-001.i02', obligation: null, requirements: [], providerWorkItem: null },
    'work-item-yielded': { workItem: 'wi-001', requirements: ['rq-001'], invocation: 'inv-0003' },
    'work-item-resumed': { workItem: 'wi-001', requirements: ['rq-001'] },
    'provider-conformed': { obligation: 'ob-ct-001', revision: 1, workItem: 'wi-002', iteration: 'wi-002.i01', gate: 'ga-0002' },
    'requirement-verified': { requirement: 'rq-001', revision: 1, workItem: 'wi-001', iteration: 'wi-001.i03', gate: 'ga-0003' },
    'evidence-reopened': { cause: 'contract-revision', contract: 'ct-001', revision: 2, iteration: 'wi-001.i04', obligation: null, requirements: [], bindings: [], followUps: [], superseded: [] },
    'revision-needed': { obligation: r, iteration: 'wi-002.i01', consumerWorkItem: 'wi-001' },
    'dependency-cycle-detected': { members: ['a', 'b'], requirements: [], workItems: [], closedBy: 'wi-001', detection: 1 },
    'work-item-completed': { workItem: 'wi-001', gate: 'ga-0004' },
    'writer-acquired': { invocation: 'inv-0003', scopeRevision: 1 },
    'writer-released': { invocation: 'inv-0003', confirmed: false, groupsKilled: 0 },
    'gate-attempted': { gate: 'ga-0001', checkpoint: 'final', verdict: 'passed', next: 'accept', committing: true },
    'gate-committed': { gate: 'ga-0001', commit: null },
    'job-completed': { gate: 'ga-0001', commit: null, workItems: 0 },
    'job-failed': { reason: 'internal', message: '', evidence: [] },
    'job-stopped': { settled: false },
    'job-interrupted': { message: 'm' },
  };
  return samples[type] ?? { command: { commandId: 'c', contentHash: 'h', receipt: { commandId: 'c', jobId: 'j', sequence: 1, acceptedAt: '2026-09-20T10:15:00.000Z' } } };
}
