import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { errorHttpStatus, errorResponseSchema } from '../interfaces/protocol/errors.js';
import { jobIdSchema, planIdSchema } from '../interfaces/protocol/ids.js';
import { acceptedCommandSchema, activitySchema, apiViewEvidenceSchema, receiptSchema, stopJobCommandSchema } from '../interfaces/protocol/jobs.js';
import { citationSchema, inputManifestSchema, modulePathSchema, moduleTreeResponseSchema, sha256Schema, viewIdentitySchema } from '../interfaces/protocol/evidence.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { planDecisionWaitSchema, planListResponseSchema, planResponseSchema, projectResponseSchema } from '../interfaces/protocol/queries.js';
import {
  analysisResponseSchema, capabilityProgressSchema, gateViewSchema, moduleCapabilityComparisonResponseSchema, projectedRunEventSchema, runDecisionRequestsSchema,
  runEventRefKindSchema, runQueryLimits, scenarioListResponseSchema, scenarioStatusSchema, trackedScenarioStateSchema,
} from '../interfaces/protocol/runs.js';
import {
  runSessionViewSchema, sessionBodyResponseSchema, sessionListEntrySchema, sessionQueryLimits, sessionRefSchema,
  sessionTranscriptResponseSchema, sessionUpdatesResponseSchema, standaloneSessionIdSchema,
} from '../interfaces/protocol/sessions.js';

describe('queries', () => {
  test('a plan list carries readable and unreadable entries', () => {
    const list = {
      plans: [
        { status: 'readable', id: 'a', title: 'A', path: 'plans/a/plan.md', waitingForDecision: [] },
        { status: 'unreadable', id: 'b', path: 'plans/b/plan.md', message: 'EISDIR', waitingForDecision: [] },
      ],
    };
    expect(planListResponseSchema.parse(list)).toEqual(list);
  });

  test('a readable entry rejects unknown fields', () => {
    const entry = { status: 'readable', id: 'a', title: 'A', path: 'plans/a/plan.md', waitingForDecision: [] };
    expect(planListResponseSchema.safeParse({ plans: [entry] }).success).toBe(true);
    expect(planListResponseSchema.safeParse({ plans: [{ ...entry, extra: 1 }] }).success).toBe(false);
    expect(planListResponseSchema.safeParse({ plans: [{ status: 'readable', id: 'a', path: 'plans/a/plan.md' }] }).success).toBe(false);
  });

  test('a plan names its runs that wait for a decision, each holding at least one work item and request', () => {
    const wait = { runId: '20260921T080000Z-c0ffee', requests: 1, workItems: ['wi-002'] };
    expect(planDecisionWaitSchema.parse(wait)).toEqual(wait);
    expect(planDecisionWaitSchema.safeParse({ ...wait, requests: 0 }).success).toBe(false);
    expect(planDecisionWaitSchema.safeParse({ ...wait, workItems: [] }).success).toBe(false);
    expect(planDecisionWaitSchema.safeParse({ ...wait, since: '2026-09-24T12:00:00.000Z' }).success).toBe(false);
  });

  test('a run\'s decision requests: none, or the work items they hold, each with a request', () => {
    expect(runDecisionRequestsSchema.safeParse({ open: 0, waiting: false, workItems: [] }).success).toBe(true);
    const held = { open: 2, waiting: true, workItems: [{ workItem: 'wi-002', requests: [{ checkFinding: 'cf-0006', request: 'cfd-0004' }] }] };
    expect(runDecisionRequestsSchema.parse(held)).toEqual(held);
    expect(runDecisionRequestsSchema.safeParse({ ...held, workItems: [{ workItem: 'wi-002', requests: [] }] }).success).toBe(false);
    expect(runDecisionRequestsSchema.safeParse({ ...held, deadline: '2026-09-25T12:00:00.000Z' }).success).toBe(false);
  });

  test('plan IDs are one non-hidden path segment', () => {
    for (const id of ['review-notes', 'Plan 2', 'v1.2']) expect(planIdSchema.safeParse(id).success).toBe(true);
    for (const id of ['', '.harness', '..', 'a/b', 'a\\b']) expect(planIdSchema.safeParse(id).success).toBe(false);
  });

  test('project and plan responses', () => {
    expect(projectResponseSchema.safeParse({
      protocolVersion: 1,
      project: { name: 'p', root: '/tmp/p', planPattern: 'plans/<plan-id>/plan.md' },
    }).success).toBe(true);
    expect(planResponseSchema.safeParse({
      plan: { id: 'a', title: 'A', path: 'plans/a/plan.md', markdown: '# A' },
    }).success).toBe(true);
  });
});

describe('errors', () => {
  test('every code has an HTTP status and the shape is strict', () => {
    expect(errorHttpStatus['not-found']).toBe(404);
    expect(errorResponseSchema.safeParse({ error: { code: 'stale-version', message: 'm', currentVersion: 3 } }).success).toBe(true);
    expect(errorResponseSchema.safeParse({ error: { code: 'teapot', message: 'm' } }).success).toBe(false);
  });
});

describe('jobs', () => {
  const at = '2026-09-19T12:00:00.000Z';
  const receipt = { commandId: 'c1', jobId: 'j1', sequence: 1, acceptedAt: at };

  test('the stop command carries an ID, an expected version and a typed payload', () => {
    expect(stopJobCommandSchema.safeParse({ commandId: 'c2', expectedVersion: 4, type: 'stop-job', payload: { planId: 'a', jobId: 'j1' } }).success).toBe(true);
    expect(stopJobCommandSchema.safeParse({ commandId: 'c2', type: 'stop-job', payload: { planId: 'a', jobId: 'j1' } }).success).toBe(false);
    expect(stopJobCommandSchema.safeParse({ commandId: 'c2', expectedVersion: 4, type: 'stop-job', payload: { planId: 'a' } }).success).toBe(false);
  });

  test('a receipt and the accepted command that records it', () => {
    expect(receiptSchema.safeParse(receipt).success).toBe(true);
    expect(acceptedCommandSchema.safeParse({ commandId: 'c1', contentHash: 'x', receipt }).success).toBe(true);
    expect(acceptedCommandSchema.safeParse({ commandId: 'c1', receipt }).success).toBe(false);
  });

  test('observed activity is typed by its kind', () => {
    expect(activitySchema.safeParse({ kind: 'read', callId: 'c', path: 'module.ramify' }).success).toBe(true);
    expect(activitySchema.safeParse({ kind: 'message', text: 'hello', usage: null }).success).toBe(true);
    expect(activitySchema.safeParse({ kind: 'progress', text: 'x' }).success).toBe(false);
  });

  test('API-view evidence names one source area of one module', () => {
    const evidence = { module: 'shop/orders', views: [{ area: 'src', path: 'subs/orders/src/.ramify', revision: 'rev/1:x:1', coverage: null }] };
    expect(apiViewEvidenceSchema.parse(evidence)).toEqual(evidence);
    expect(apiViewEvidenceSchema.safeParse({ ...evidence, views: [{ ...evidence.views[0], area: 'lib' }] }).success).toBe(false);
  });

  test('job IDs', () => {
    expect(jobIdSchema.safeParse('20260919T120000Z-a1b2c3').success).toBe(true);
    for (const id of ['', '-x', 'a/b', 'a.b']) expect(jobIdSchema.safeParse(id).success).toBe(false);
  });
});

test('paths encode their IDs', () => {
  expect(protocolPaths.plan('a b')).toBe('/api/v1/plans/a%20b');
  expect(protocolPaths.plans).toBe('/api/v1/plans');
  expect(protocolPaths.modules).toBe('/api/v1/project/modules');
  expect(protocolPaths.commands).toBe('/api/v1/commands');
  expect(protocolPaths.runs('a b')).toBe('/api/v1/plans/a%20b/runs');
  expect(protocolPaths.runEvents('p', 'r/1', 7)).toBe('/api/v1/plans/p/runs/r%2F1/events?after=7');
  expect(protocolPaths.runWorkItem('p', 'r', 'wi-001')).toBe('/api/v1/plans/p/runs/r/work-items/wi-001');
  expect(protocolPaths.runGate('p', 'r', 'ga 1')).toBe('/api/v1/plans/p/runs/r/gates/ga%201');
  for (const path of [protocolPaths.runAnalysis('p', 'r'), protocolPaths.runDecisions('p', 'r'), protocolPaths.runWorkItems('p', 'r'), protocolPaths.runCapabilities('p', 'r'), protocolPaths.runMetrics('p', 'r')]) {
    expect(path.startsWith('/api/v1/plans/p/runs/r/')).toBe(true);
  }
});

describe('the evidence a run works from', () => {
  test('a module path is a declared-name path from the root', () => {
    for (const path of ['app', 'app/orders', 'ramify-agent/harness/agent']) expect(modulePathSchema.safeParse(path).success).toBe(true);
    for (const path of ['', '/app', 'app/', 'app orders']) expect(modulePathSchema.safeParse(path).success).toBe(false);
  });

  test('a digest is lowercase hexadecimal of the right length', () => {
    expect(sha256Schema.safeParse('a'.repeat(64)).success).toBe(true);
    expect(sha256Schema.safeParse('A'.repeat(64)).success).toBe(false);
    expect(sha256Schema.safeParse('a'.repeat(63)).success).toBe(false);
  });

  test('a citation names a module, and may narrow it to a file and a symbol', () => {
    expect(citationSchema.safeParse({ module: 'app/orders' }).success).toBe(true);
    expect(citationSchema.safeParse({ module: 'app/orders', file: 'subs/orders/src/x.ts', symbol: 'price', note: 'why' }).success).toBe(true);
    expect(citationSchema.safeParse({ module: 'app/orders', extra: 1 }).success).toBe(false);
    expect(citationSchema.safeParse({ file: 'x.ts' }).success).toBe(false);
  });

  test('a view identity is a placeholder or a materialization', () => {
    expect(viewIdentitySchema.safeParse({ status: 'placeholder' }).success).toBe(true);
    expect(viewIdentitySchema.safeParse({ status: 'materialized', revision: 'r', input: 'i', coverageLimits: [] }).success).toBe(true);
    expect(viewIdentitySchema.safeParse({ status: 'materialized', revision: 'r' }).success).toBe(false);
  });

  test('an input manifest carries the plan hash, the checkout and the view', () => {
    const manifest = {
      planHash: 'a'.repeat(64),
      source: { commit: 'abc', dirty: false },
      versions: { architectPrompt: '1', procedure: '1', skill: '1', ramify: '1' },
      architectView: { status: 'placeholder' },
    };
    expect(inputManifestSchema.parse(manifest)).toEqual(manifest);
    expect(inputManifestSchema.safeParse({ ...manifest, planHash: 'short' }).success).toBe(false);
    expect(inputManifestSchema.safeParse({ ...manifest, source: null }).success).toBe(true);
  });

  test('the module tree is available with the view\'s identity, or unavailable with a reason', () => {
    expect(moduleTreeResponseSchema.safeParse({ tree: { status: 'available', revision: 'r', input: 'i', modules: [{ module: 'app', dir: '', parent: null }] } }).success).toBe(true);
    expect(moduleTreeResponseSchema.safeParse({ tree: { status: 'unavailable', message: 'not materialized' } }).success).toBe(true);
    expect(moduleTreeResponseSchema.safeParse({ tree: { status: 'available', modules: [] } }).success).toBe(false);
  });
});

describe('the module-capability comparison', () => {
  const tree = { status: 'available' as const, revision: 'rev/1', input: 'input/1', modules: [{ module: 'app', dir: '', parent: null }, { module: 'app/notes', dir: 'subs/notes', parent: 'app' }] };
  const valid = {
    identityPolicy: 'exact-capability-slug/1',
    runVersion: 12,
    initialView: { status: 'placeholder' },
    tree,
    modules: [
      { module: 'app', placement: 'declared', proposedAtStart: null, capabilities: [] },
      {
        module: 'app/notes', placement: 'declared', proposedAtStart: null, capabilities: [
          { capability: 'review-note', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: { reason: 'wi-001 passed its work-item gate ga-0002', evidence: ['ga-0002'] } },
          { capability: 'note-search', initial: [{ role: 'suggested-owner', hypothesis: 'note-search' }, { role: 'involved', hypothesis: 'note-search' }], implementedHere: null },
        ],
      },
      {
        module: 'app/notes/drafts', placement: 'proposed', proposedAtStart: { parent: 'app/notes', purpose: 'Drafts.', tags: [] }, capabilities: [
          { capability: 'note-drafts', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: null },
        ],
      },
    ],
    coverage: { state: 'complete', capabilities: 3, implemented: 1 },
  };
  type Response = typeof valid & Record<string, unknown>;
  const with_ = (change: (response: Response) => void): unknown => {
    const copy = structuredClone(valid) as Response;
    change(copy);
    return copy;
  };
  const accepts = (body: unknown) => moduleCapabilityComparisonResponseSchema.safeParse(body).success;
  const partial = (gaps: string[], extra: Record<string, unknown> = {}) => ({ state: 'partial', knownCapabilities: 3, knownImplemented: 1, totalCapabilities: null, gaps, ...extra });

  test('the path and the bounds', () => {
    expect(protocolPaths.runModuleCapabilities('p', 'r 1')).toBe('/api/v1/plans/p/runs/r%201/module-capabilities');
    expect(runQueryLimits.capabilities).toBe(500);
    expect(runQueryLimits.moduleCapabilityRows).toBe(2000);
  });

  test('a complete comparison', () => {
    expect(moduleCapabilityComparisonResponseSchema.parse(valid)).toEqual(valid);
    // Its counts are of what it returns.
    expect(accepts(with_(response => { response.coverage.implemented = 0; }))).toBe(false);
    expect(accepts(with_(response => { response.coverage.capabilities = 5; }))).toBe(false);
  });

  test('a pending or unreadable analysis is unavailable, with no initial view and no modules', () => {
    const unavailable = { ...valid, initialView: null, modules: [], coverage: { state: 'unavailable', reason: 'The initial analysis is pending.' } };
    expect(accepts(unavailable)).toBe(true);
    expect(accepts({ ...unavailable, initialView: { status: 'placeholder' } })).toBe(false);
    expect(accepts({ ...unavailable, modules: valid.modules })).toBe(false);
    // Only an unavailable comparison lacks the view.
    expect(accepts({ ...valid, initialView: null })).toBe(false);
  });

  test('an unavailable tree is partial, with every module unplaced', () => {
    const unplaced = with_(response => {
      (response as Record<string, unknown>)['tree'] = { status: 'unavailable', message: 'not materialized' };
      for (const entry of response.modules) entry.placement = 'unplaced';
    }) as Response;
    expect(accepts(unplaced)).toBe(false);
    expect(accepts({ ...unplaced, coverage: partial(['The current module tree is unavailable: not materialized']) })).toBe(true);
    const placed = structuredClone(unplaced);
    placed.modules[0]!.placement = 'declared';
    expect(accepts({ ...placed, coverage: partial(['The current module tree is unavailable: not materialized']) })).toBe(false);
  });

  test('recorded coverage limits of the initial view are never complete', () => {
    expect(accepts({ ...valid, initialView: { status: 'materialized', revision: 'r', input: 'i', coverageLimits: ['dependencies unavailable'] } })).toBe(false);
    expect(accepts({ ...valid, initialView: { status: 'materialized', revision: 'r', input: 'i', coverageLimits: ['dependencies unavailable'] }, coverage: partial(['The architect view reports: dependencies unavailable']) })).toBe(true);
  });

  test('an unplaced module and a conflicting proposal are never complete', () => {
    const unplaced = with_(response => { response.modules[2]!.placement = 'unplaced'; response.modules[2]!.proposedAtStart = null as never; });
    expect(accepts(unplaced)).toBe(false);
    expect(accepts({ ...(unplaced as object), coverage: partial(['Module app/notes/drafts: the entries that propose it disagree.']) })).toBe(true);
    // A proposed module is placed from its recorded proposal.
    expect(accepts(with_(response => { response.modules[2]!.proposedAtStart = null as never; }))).toBe(false);
  });

  test('a partial comparison names its gaps and gives a total only when a bound dropped capabilities', () => {
    expect(accepts({ ...valid, coverage: partial([]) })).toBe(false);
    expect(accepts({ ...valid, coverage: partial(['The capabilities (500) bound returned 3 of 4 capabilities'], { totalCapabilities: 4 }) })).toBe(true);
    expect(accepts({ ...valid, coverage: partial(['a gap'], { totalCapabilities: 3 }) })).toBe(false);
    expect(accepts({ ...valid, coverage: partial(['a gap'], { knownImplemented: 0 }) })).toBe(false);
  });

  test('a row is an association or an implementation, a capability is implemented in one module, and a module is listed once', () => {
    expect(accepts(with_(response => { response.modules[1]!.capabilities[1]!.initial = []; }))).toBe(false);
    expect(accepts(with_(response => {
      response.modules[2]!.capabilities[0]!.capability = 'review-note';
      response.modules[2]!.capabilities[0]!.implementedHere = { reason: 'again', evidence: [] } as never;
      response.coverage.capabilities = 2;
    }))).toBe(false);
    expect(accepts(with_(response => { response.modules[0]!.module = 'app/notes'; }))).toBe(false);
  });

  test('CM09: the response carries no activity, commit, change, line or deployment field', () => {
    const keys = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node === null || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'properties' && value !== null && typeof value === 'object') for (const name of Object.keys(value)) keys.add(name);
        walk(value);
      }
    };
    walk(z.toJSONSchema(moduleCapabilityComparisonResponseSchema, { io: 'input' }));
    expect(keys.size).toBeGreaterThan(10);
    expect([...keys].filter(key => /activity|commit|change|lines|deploy|percent/i.test(key))).toEqual([]);
    // And the schema refuses such a field where a client might look for it.
    expect(accepts({ ...valid, deployed: true })).toBe(false);
    expect(accepts(with_(response => { (response.modules[1]!.capabilities[0]! as Record<string, unknown>)['commit'] = 'abc'; }))).toBe(false);
  });
});

describe('the acceptance scenarios a client reads', () => {
  const plan = { kind: 'plan', planScenario: 'ps-01', lines: [12, 16] };
  const gateResult = {
    gate: 'ga-0004', checkpoint: 'iteration', subject: { workItem: 'wi-003', iteration: 'wi-003.i01' }, verdict: 'failed',
    mode: 'quick', dryRun: false, status: 'failed', failure: { step: 'Then it is shown', message: 'expected one' }, undefined: [],
  };
  const scenario = {
    id: 'sc-003', kind: 'integration', name: 'A note is shown with its tag', state: 'declared', origin: plan,
    entry: null, partOf: null, subScenarios: ['sc-001', 'sc-002'], workItem: 'wi-003', owner: 'app/reviews',
    file: 'subs/reviews/src/tests/features/p/integration.feature', implementedBy: null, gates: [gateResult],
  };

  test('the path, the bound and every state and status', () => {
    expect(protocolPaths.runScenarios('p', 'r 1')).toBe('/api/v1/plans/p/runs/r%201/scenarios');
    expect(runQueryLimits.scenarios).toBe(500);
    expect(trackedScenarioStateSchema.options).toEqual(['pending', 'bound', 'declared', 'implemented']);
    expect(scenarioStatusSchema.options).toEqual(['passed', 'failed', 'undefined', 'pending', 'ambiguous', 'skipped']);
  });

  test('the scenario list: a scenario with its origin, work item and gates, strictly', () => {
    const list = { scenarios: [scenario], total: 1, obligations: [] };
    expect(scenarioListResponseSchema.parse(list)).toEqual(list);
    const architect = { ...scenario, kind: 'entry', entry: 'show-note', partOf: 'sc-005', subScenarios: [], origin: { kind: 'architect', refs: ['fr-002', 'fr-003'] } };
    expect(scenarioListResponseSchema.safeParse({ scenarios: [architect], total: 1, obligations: [] }).success).toBe(true);
    expect(scenarioListResponseSchema.safeParse({ scenarios: [{ ...scenario, state: 'failed' }], total: 1, obligations: [] }).success).toBe(false);
    expect(scenarioListResponseSchema.safeParse({ scenarios: [{ ...scenario, extra: 1 }], total: 1, obligations: [] }).success).toBe(false);
    expect(scenarioListResponseSchema.safeParse({ scenarios: [{ ...scenario, gates: [{ ...gateResult, binding: [] }] }], total: 1, obligations: [] }).success).toBe(false);
    expect(scenarioListResponseSchema.safeParse({ scenarios: Array.from({ length: 501 }, () => scenario), total: 501, obligations: [] }).success).toBe(false);
  });

  test('PB3-D04: an obligation carries its architect report and optional where text apart from any gate result', () => {
    const hash = 'b'.repeat(64);
    const reported = {
      id: 'sc-003', kind: 'scenario', responsible: { kind: 'work-item', id: 'wi-003' }, status: 'done', revision: 1,
      case: null, description: null, registeredBy: null,
      report: { judgment: 'done', revision: 1, basedOnRevision: 0, where: 'subs/missing/src/nowhere.ts — notAFunction', invocation: 'inv-0007', submission: hash, sequence: 41, at: '2026-10-07T12:00:00.000Z' },
    };
    const test = { ...reported, id: 'test-001', kind: 'test', status: 'pending', revision: 0, description: 'The duplicate send regression test',
      registeredBy: { invocation: 'inv-0007', submission: hash }, report: null };
    const list = { scenarios: [scenario], total: 1, obligations: [reported, test, { ...reported, id: 'cap-001', kind: 'outcome', responsible: { kind: 'capability-task', id: 'cap-001' }, report: { ...reported.report, where: null } }] };
    expect(scenarioListResponseSchema.parse(list)).toEqual(list);
    // The declaration is its own fact: no gate, verdict or audit field rides on it.
    expect(scenarioListResponseSchema.safeParse({ ...list, obligations: [{ ...reported, verdict: 'passed' }] }).success).toBe(false);
    expect(scenarioListResponseSchema.safeParse({ ...list, obligations: [{ ...reported, status: 'implemented' }] }).success).toBe(false);
    expect(scenarioListResponseSchema.safeParse({ ...list, obligations: [{ ...reported, report: { ...reported.report, judgment: 'passed' } }] }).success).toBe(false);
  });

  test('the review: the accepted analysis carries each scenario\'s text and the warnings, and counts the scenarios', () => {
    const text = {
      id: 'sc-003', kind: 'integration', entry: null, owner: 'app/reviews', origin: plan, partOf: null, subScenarios: ['sc-001'],
      name: 'A note is shown', source: ['Scenario: A note is shown', '  Then it is shown'], file: 'subs/reviews/src/tests/features/p/integration.feature',
    };
    const warning = { kind: 'sub-scenario-shares-no-step', scenarios: ['sc-001'], message: 'sc-001 picks no step of sc-003' };
    const accepted = {
      plan: { markdown: '# P', hash: 'a'.repeat(64) },
      analysis: { status: 'accepted', view: { status: 'placeholder' }, entries: [], hypotheses: [], scenarios: [text], warnings: [warning], total: { entries: 0, hypotheses: 0, scenarios: 1 } },
    };
    expect(analysisResponseSchema.parse(accepted)).toEqual(accepted);
    expect(analysisResponseSchema.safeParse({ ...accepted, analysis: { ...accepted.analysis, warnings: [{ ...warning, kind: 'loud' }] } }).success).toBe(false);
    expect(analysisResponseSchema.safeParse({ ...accepted, analysis: { ...accepted.analysis, total: { entries: 0, hypotheses: 0 } } }).success).toBe(false);
  });

  test('an entry counts its scenarios; any other capability has no count', () => {
    const progress = { capability: 'show-note', owner: 'app', entry: true, tentative: false, state: 'working', reason: 'r', dependsOn: [], workItems: [], evidence: [] };
    expect(capabilityProgressSchema.safeParse({ ...progress, scenarios: { implemented: 1, total: 2 } }).success).toBe(true);
    expect(capabilityProgressSchema.safeParse({ ...progress, entry: false, scenarios: null }).success).toBe(true);
    expect(capabilityProgressSchema.safeParse(progress).success).toBe(false);
  });

  test('a gate\'s scenario command carries its compact summary; the others carry none', () => {
    const command = {
      name: null, argv: ['npm', 'run', 'acceptance'], cwd: '/p', startedAt: '2026-09-23T08:00:00.000Z', elapsedMs: 5, exitCode: 1, outcome: 'failed',
      notVerified: null, runnerError: null, selection: null, stopped: null, outputIncomplete: false, output: { path: 'gates/ga-0004/scenarios.log', bytes: 10, truncated: false, tail: 'failed' },
    };
    const summary = {
      mode: 'quick', selection: { kind: 'identity', scenarios: ['sc-003'] }, dryRun: false, excluded: 2,
      runs: [{ module: 'app/reviews', exit: 1 }],
      scenarios: [{ id: 'sc-003', run: 'app/reviews', status: 'undefined', file: 'f.feature', line: 3, failure: { step: 'Then it is shown', message: 'undefined' }, undefined: ['Then it is shown'] }],
      untracked: { passed: 0, skipped: 0, failed: 0 },
      failures: ['sc-003 undefined'],
    };
    const gate = {
      id: 'ga-0004', checkpoint: 'iteration', subject: {}, repairRound: 0, infrastructureAttempt: 0, head: 'a', commit: null, audited: null,
      evidence: null, verdict: 'failed', cause: 'in-scope', next: 'repair', guardedChanges: [], rules: [],
      commands: [{ kind: 'scenarios', ...command, scenarios: summary }, { kind: 'tests', ...command, scenarios: null }],
    };
    expect(gateViewSchema.parse(gate)).toEqual(gate);
    expect(gateViewSchema.safeParse({ ...gate, commands: [{ kind: 'tests', ...command }] }).success).toBe(false);
    const withBinding = { ...summary, scenarios: [{ ...summary.scenarios[0], binding: [] }] };
    expect(gateViewSchema.safeParse({ ...gate, commands: [{ kind: 'scenarios', ...command, scenarios: withBinding }] }).success).toBe(false);
    expect(gateViewSchema.safeParse({ ...gate, commands: [{ kind: 'scenarios', ...command, scenarios: { ...summary, mode: 'slow' } }] }).success).toBe(false);
    // A setup command carries its declared name; a command a failed setup kept from running says so.
    const setup = { ...gate, commands: [
      { kind: 'setup', ...command, name: 'build', argv: ['npm', 'run', 'build'], exitCode: 2, scenarios: null },
      { kind: 'tests', ...command, exitCode: null, outcome: 'not-verified', notVerified: 'setup-failed', scenarios: null },
    ] };
    expect(gateViewSchema.parse(setup)).toEqual(setup);
    expect(gateViewSchema.safeParse({ ...gate, commands: [{ kind: 'setup', ...command, name: '', scenarios: null }] }).success).toBe(false);
  });

  test('a projected event may refer to a scenario', () => {
    const event = { sequence: 4, at: '2026-09-23T08:00:00.000Z', transition: 'scenario-implemented', summary: 'Scenario sc-001 is implemented', refs: [{ kind: 'scenario', id: 'sc-001' }, { kind: 'gate', id: 'ga-0003' }] };
    expect(projectedRunEventSchema.parse(event)).toEqual(event);
  });
});

describe('sessions', () => {
  const at = '2026-09-23T10:00:00.000Z';
  const run = { source: 'run', planId: 'review-notes', runId: '20260923T100000Z-a1b2c3', session: 'ses-0001' } as const;
  const standalone = { source: 'standalone', session: '20260923T101500Z-d4e5f6' } as const;
  const entry = {
    ref: run, state: 'live', finished: null, role: 'engineer', work: { workItem: 'wi-001', iteration: 'wi-001.i01' },
    executor: 'scripted', model: null, invocations: 1, degradedStarts: 0,
    reaches: { kind: 'work-item', workItem: 'wi-001', capability: 'review-note', module: 'app/notes' },
    startedAt: at, changedAt: at,
  };
  const page = { file: 'present', entries: [], cursor: 3, more: false, partial: false, unreadable: [] };

  test('the paths encode their IDs and carry the cursors', () => {
    expect(protocolPaths.sessions()).toBe('/api/v1/sessions?offset=0');
    expect(protocolPaths.sessions(200)).toBe('/api/v1/sessions?offset=200');
    expect(protocolPaths.runSessions('p', 'r 1')).toBe('/api/v1/plans/p/runs/r%201/sessions');
    expect(protocolPaths.runSessionTranscript('p', 'r', 'ses-0002', 7)).toBe('/api/v1/plans/p/runs/r/sessions/ses-0002/transcript?after=7');
    expect(protocolPaths.runSessionUpdates('p', 'r', 12, [{ session: 'ses-0001', after: 5 }, { session: 'ses-0002', after: 0 }]))
      .toBe('/api/v1/plans/p/runs/r/sessions/updates?version=12&cursors=ses-0001%3A5%2Cses-0002%3A0');
    expect(protocolPaths.runBody('p', 'r', 'a'.repeat(64))).toBe(`/api/v1/plans/p/runs/r/bodies/${'a'.repeat(64)}`);
    expect(protocolPaths.runSessionFile('p', 'r', 'ses-0001', 'invocations/inv-0003/shell/001.log'))
      .toBe('/api/v1/plans/p/runs/r/sessions/ses-0001/files?path=invocations%2Finv-0003%2Fshell%2F001.log');
    expect(protocolPaths.standaloneSession('s 1')).toBe('/api/v1/sessions/standalone/s%201');
    expect(protocolPaths.standaloneTranscript('s', 0)).toBe('/api/v1/sessions/standalone/s/transcript?after=0');
    expect(protocolPaths.standaloneFile('s', 'shell/001.log')).toBe('/api/v1/sessions/standalone/s/files?path=shell%2F001.log');
  });

  test('the bounds', () => {
    expect(sessionQueryLimits).toEqual({ sessions: 200, runSessions: 500, entries: 200, pageBytes: 512 * 1024, pollSessions: 50, bodyBytes: 1024 * 1024 });
  });

  test('a session is a run\'s, by plan, run and ses- number, or a standalone one, by its own ID', () => {
    expect(sessionRefSchema.parse(run)).toEqual(run);
    expect(sessionRefSchema.parse(standalone)).toEqual(standalone);
    expect(sessionRefSchema.safeParse({ ...run, session: 'ses-1' }).success).toBe(false);
    expect(sessionRefSchema.safeParse({ ...run, session: '../ses-0001' }).success).toBe(false);
    for (const id of ['', '../x', 'a/b', '.hidden']) expect(standaloneSessionIdSchema.safeParse(id).success).toBe(false);
    expect(sessionRefSchema.safeParse({ source: 'standalone', session: 'ses-0001', planId: 'p' }).success).toBe(false);
  });

  test('a list entry shows interrupted as a state, names its executor and reaches its elements', () => {
    expect(sessionListEntrySchema.parse(entry)).toEqual(entry);
    for (const state of ['live', 'suspended', 'finished', 'interrupted']) expect(sessionListEntrySchema.safeParse({ ...entry, state }).success).toBe(true);
    expect(sessionListEntrySchema.safeParse({ ...entry, state: 'running' }).success).toBe(false);
    expect(sessionListEntrySchema.safeParse({ ...entry, agent: 'scripted' }).success).toBe(false);
    for (const reaches of [{ kind: 'run' }, { kind: 'request', request: 'pr-001', workItem: 'wi-001', capability: null }, { kind: 'module', module: 'app/notes' }]) {
      expect(sessionListEntrySchema.safeParse({ ...entry, reaches }).success).toBe(true);
    }
    expect(sessionListEntrySchema.safeParse({ ...entry, reaches: { kind: 'run', module: 'app' } }).success).toBe(false);
  });

  test('a missing transcript has no entries; a page names its cursor, never a body outside its entries', () => {
    expect(sessionTranscriptResponseSchema.safeParse({ session: run, page }).success).toBe(true);
    expect(sessionTranscriptResponseSchema.safeParse({ session: standalone, page: { ...page, file: 'missing' } }).success).toBe(true);
    const started = {
      n: 1, at, type: 'started', invocation: 'inv-0001', role: 'engineer', work: {}, start: 'opened', requested: 'fresh',
      continues: null, fork: null, replaces: null, requestedBy: null, executor: 'scripted', model: null,
      systemPrompt: { stored: 'blob', hash: 'a'.repeat(64), bytes: 20_000, preview: 'You are the engineer.' },
      prompt: { stored: 'inline', text: 'Raise the limit.', bytes: 16 },
    };
    expect(sessionTranscriptResponseSchema.safeParse({ session: run, page: { ...page, entries: [started], cursor: 1 } }).success).toBe(true);
    expect(sessionTranscriptResponseSchema.safeParse({ session: run, page: { ...page, file: 'missing', entries: [started] } }).success).toBe(false);
    expect(sessionTranscriptResponseSchema.safeParse({ session: run, page: { ...page, file: 'missing', more: true } }).success).toBe(false);
    expect(sessionTranscriptResponseSchema.safeParse({ session: run, page: { ...page, cursor: -1 } }).success).toBe(false);
  });

  test('a run session\'s invocations carry their moments, points and evaluation; the poll answers views and pages', () => {
    const view = {
      session: 'ses-0002', state: 'suspended', finished: null, role: 'local-architect', work: { workItem: 'wi-001' },
      executor: 'scripted', model: 'provider/model-7',
      reaches: { kind: 'work-item', workItem: 'wi-001', capability: 'review-note', module: 'app/notes' },
      opened: { sequence: 9, at }, changed: { sequence: 12, at }, awaiting: null,
      point: { session: 'ses-0002', invocation: 'inv-0002' },
      invocations: [{
        invocation: 'inv-0002', start: 'opened', started: { sequence: 10, at }, ended: { sequence: 12, at }, outcome: 'submitted', kept: true,
        continues: null, degraded: { requested: 'fork', actual: 'fresh', reason: 'no history' },
        point: { session: 'ses-0002', invocation: 'inv-0002' }, evaluation: null,
      }],
      appends: [],
      suspended: [{ from: { sequence: 12, at }, until: null }],
      lineage: { fork: null, replaces: null, replacedBy: null, requestedBy: null, requested: [], forks: ['ses-0003'] },
    };
    expect(runSessionViewSchema.parse(view)).toEqual(view);
    expect(runSessionViewSchema.safeParse({ ...view, invocations: [{ ...view.invocations[0], started: { sequence: 0, at } }] }).success).toBe(false);
    const poll = { version: 12, sessions: [view], transcripts: [{ session: 'ses-0002', page }] };
    expect(sessionUpdatesResponseSchema.parse(poll)).toEqual(poll);
    expect(sessionUpdatesResponseSchema.safeParse({ ...poll, transcripts: Array.from({ length: 51 }, () => ({ session: 'ses-0002', page })) }).success).toBe(false);
  });

  test('a body is at most 1 MiB, with its whole size', () => {
    expect(sessionBodyResponseSchema.safeParse({ content: 'x'.repeat(1024 * 1024), bytes: 3_000_000, truncated: true }).success).toBe(true);
    expect(sessionBodyResponseSchema.safeParse({ content: 'x'.repeat(1024 * 1024 + 1), bytes: 3_000_000, truncated: true }).success).toBe(false);
    expect(sessionBodyResponseSchema.safeParse({ content: 'é'.repeat(600 * 1024), bytes: 1_228_800, truncated: false }).success).toBe(false);
  });

  test('a projected event refers to the sessions it names', () => {
    expect(runEventRefKindSchema.options).toContain('session');
  });
});
