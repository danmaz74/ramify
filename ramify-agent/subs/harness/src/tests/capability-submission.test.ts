import { afterEach, describe, expect, it } from 'vitest';
import { buildCapabilityPlanRevision, validateCapabilityAction, validateCapabilityPlanUpdate, type CapabilityActionBasis } from '../capability/submission.js';
import { copyCapabilityFixture, fixturePlan, openCapabilityRuns } from './helpers/capability.js';
import { capabilityPlanSchema } from '../capability/records.js';
import type { Script } from '../../subs/agent/src/scripted.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { analysis, entry } from './helpers/analysis.js';
import { assign, edit, installMiniRunner, outline, submit, treeInputs } from './helpers/iterations.js';
import { initRepository, runEventsOnDisk, startRun, until } from './helpers/runs.js';
import { capabilityContext, line, registered, reported, submissionHash } from './helpers/obligations.js';
import { validateEngineer } from '../work/engineer.js';
import { obligationEventsToRecord, unreportedObligations, unreportedText } from '../work/obligations.js';
import type { RunEvent } from '../run/log.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

const basis: CapabilityActionBasis = {
  task: 'cap-001', planRevision: 2, coordinatorInvocation: 'inv-0003', state: 'coordinating',
  openAssignment: null, openChild: null,
};

describe('capability submission', () => {
  it('CA16 returns structural field errors and keeps preview pure', () => {
    const malformed = { task: 'cap-001', planRevision: 2, invocation: 'inv-0003', kind: 'assign',
      owner: 'bad module', purpose: '', approach: 'Implement', requirementRefs: [], intendedEvidence: [],
    };
    const before = structuredClone(basis);
    const result = validateCapabilityAction(malformed, basis);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.every(issue => issue.kind === 'structure')).toBe(true);
      expect(result.issues.map(issue => issue.path.join('.'))).toContain('assignment');
    }
    expect(basis).toEqual(before);
  });

  it('CA16 final validation rejects a preview made before state and authority changed', () => {
    const action = { task: 'cap-001', planRevision: 2, invocation: 'inv-0003', kind: 'consult-consumer',
      question: 'What does the caller expect?', sections: ['useCases'], references: ['src/caller.ts'],
    };
    expect(validateCapabilityAction(action, basis).valid).toBe(true);
    const changed: CapabilityActionBasis = { ...basis, planRevision: 3, coordinatorInvocation: 'inv-0004' };
    const result = validateCapabilityAction(action, changed);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map(issue => issue.path)).toEqual([['planRevision'], ['invocation']]);
    expect(validateCapabilityAction(action, { ...basis, state: 'implementing', openAssignment: 'cap-001.i01' }).valid).toBe(false);
  });

  it('plan updates use the same basis check and do not judge semantic wording', () => {
    const update = { task: 'cap-001', basedOn: 2, invocation: 'inv-0003', reason: 'New evidence', changes: { proposedInterface: 'B exposes the field reader' } };
    expect(validateCapabilityPlanUpdate(update, basis).valid).toBe(true);
    expect(validateCapabilityPlanUpdate(update, { ...basis, planRevision: 3 }).valid).toBe(false);
    expect(validateCapabilityPlanUpdate({ ...update, reason: '' }, basis).valid).toBe(false);
  });

  it('CA11 PB3-D09 builds a revision with stable case identity, keeps the original examples, and refuses silent case deletion', () => {
    const previous = fixturePlan();
    const correction = { task: previous.task, basedOn: 1, invocation: 'inv-0002', reason: 'Independent test corrected the oracle',
      changes: { useCases: [{ ...previous.useCases[0]!, expectedBehavior: 'Corrected value' },
        { id: 'derived-retry', expectedBehavior: 'A retries once', derivedFrom: [previous.originalExamples[0]!] }] },
    };
    const next = buildCapabilityPlanRevision(previous, correction);
    expect(next.originalExamples).toEqual(previous.originalExamples);
    expect(next.useCases.map(item => item.id)).toEqual([previous.useCases[0]!.id, 'derived-retry']);
    expect(previous.useCases[0]).toEqual({ id: previous.originalExamples[0], expectedBehavior: 'A formats the fact', derivedFrom: previous.originalExamples });
    expect(() => buildCapabilityPlanRevision(previous, { ...correction, changes: { useCases: [] } })).toThrow();
    // An added case registers nothing: the delegated outcome is still the task's only obligation.
    expect([...capabilityContext().projection.obligations.values()].filter(obligation => obligation.responsible.id === 'cap-001').map(obligation => obligation.id)).toEqual(['cap-001']);
  });

  it('PB3-D08 a case carries no coverage and a handback cites no evidence: both old fields are refused by the schemas', () => {
    const previous = fixturePlan();
    const covered = { ...previous.useCases[0]!, coverage: { state: 'exercised', tests: ['subs/a/src/tests/use.test.ts'] } };
    const update = { task: basis.task, basedOn: basis.planRevision, invocation: basis.coordinatorInvocation,
      reason: 'Real consumer case executed', changes: { useCases: [covered] } };
    expect(validateCapabilityPlanUpdate(update, basis).valid).toBe(false);
    expect(capabilityPlanSchema.safeParse({ ...previous, useCases: [covered] }).success).toBe(false);
    const handback = { task: 'cap-001', planRevision: 2, invocation: 'inv-0003', kind: 'request-handback',
      summary: 'A renders the B fact; the original example holds as asked',
      interfaces: [{ path: 'subs/b/src/fact.ts', symbols: ['readFactWithSource'], use: 'A renders it' }], limitations: [] };
    expect(validateCapabilityAction(handback, basis).valid).toBe(true);
    const cited = validateCapabilityAction({ ...handback, coverage: [{ case: 'need-001.ex01', evidence: ['subs/a/src/tests/use.test.ts'] }] }, basis);
    expect(cited.valid).toBe(false);
    if (!cited.valid) expect(cited.issues.every(issue => issue.kind === 'structure')).toBe(true);
  });
});

describe('PB3-D01 PB3-D02 PB3-D04: capability registrations and reports', () => {
  const partial = { task: 'cap-001', planRevision: 2, invocation: 'inv-0003', kind: 'partial', progress: 'B is half done', unfinished: ['A integration'] };
  const judged = (extra: Record<string, unknown>, context = capabilityContext()) => {
    const result = validateCapabilityAction({ ...partial, ...extra }, { ...basis, obligations: context });
    return result.valid ? [] : result.issues.map(issue => [issue.path.join('.'), issue.message]);
  };

  it('tracks the delegated outcome by default and registers a case or test only on the architect\'s explicit choice', () => {
    expect(capabilityContext().projection.obligations.get('cap-001')).toMatchObject({ kind: 'outcome', status: 'pending', revision: 0,
      responsible: { kind: 'capability-task', id: 'cap-001' }, registeredBy: null });
    // Preserving original examples registers nothing on its own.
    expect([...capabilityContext().projection.obligations.keys()].filter(id => id.startsWith('cap-001'))).toEqual(['cap-001']);
    expect(judged({ registrations: [{ kind: 'scenario', case: 'need-001.ex01' }, { kind: 'test', description: 'B returns its source' }] })).toEqual([]);
    expect(judged({ registrations: [{ kind: 'scenario', case: 'need-009.ex01' }] })).toEqual([
      ['registrations.0.case', '"need-009.ex01" is no use case of cap-001\'s current plan revision; add it through a plan update first'],
    ]);
    const existing = registered({ id: 'cap-001.case.need-001.ex01', kind: 'scenario', responsible: { kind: 'capability-task', id: 'cap-001' },
      by: 'inv-0003', submission: submissionHash('c'), case: 'need-001.ex01' });
    expect(judged({ registrations: [{ kind: 'scenario', case: 'need-001.ex01' }] }, capabilityContext([existing]))).toEqual([
      ['registrations.0.case', 'cap-001.case.need-001.ex01 is already registered'],
    ]);
  });

  it('accepts the task architect\'s done report with or without where, during coordination, and refuses another owner\'s ID', () => {
    expect(judged({ reports: [{ id: 'cap-001', judgment: 'done', basedOnRevision: 0, where: 'subs/b/src/fact.ts — readFactWithSource' }] })).toEqual([]);
    expect(judged({ reports: [{ id: 'cap-001', judgment: 'done', basedOnRevision: 0 }] })).toEqual([]);
    expect(judged({ registrations: [{ kind: 'scenario', case: 'derived-retry' }],
      reports: [{ id: 'cap-001.case.derived-retry', judgment: 'done', basedOnRevision: 0 }] })).toEqual([]);
    expect(judged({ reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }, { id: 'cap-002', judgment: 'done', basedOnRevision: 0 }] })).toEqual([
      ['reports.0.id', 'sc-001 is reported by the local architect of wi-001, not by the capability architect of cap-001'],
      ['reports.1.id', '"cap-002" is no registered obligation of this run'],
    ]);
    // The basis check still applies: a stale invocation cannot report.
    const stale = validateCapabilityAction({ ...partial, invocation: 'inv-0009', reports: [{ id: 'cap-001', judgment: 'done', basedOnRevision: 0 }] },
      { ...basis, obligations: capabilityContext() });
    expect(stale.valid).toBe(false);
    if (!stale.valid) expect(stale.issues.map(issue => issue.path)).toEqual([['invocation']]);
  });

  it('an engineer reports work only: its completion proposal has no report field, and its declaration moves no obligation', () => {
    const engineer = validateEngineer({ kind: 'completion-proposed', summary: 'B returns its source', findings: [],
      reports: [{ id: 'cap-001', judgment: 'done', basedOnRevision: 0 }] });
    expect(engineer.ok).toBe(false);
    if (!engineer.ok) expect(engineer.errors.map(error => error.message).join(' ')).toContain('reports');
  });

  it('a replayed accepted submission records nothing twice; a resumed partial write records only what is missing', () => {
    const submission = {
      registrations: [{ kind: 'test' as const, description: 'B returns its source' }],
      reports: [{ id: 'cap-001', judgment: 'done' as const, basedOnRevision: 0, where: 'subs/b/src/fact.ts' }],
    };
    const identity = { by: 'inv-0003', submission: submissionHash('d') };
    const context = capabilityContext();
    const all = obligationEventsToRecord(submission, context.actor, identity, context.projection, []);
    expect(all.map(event => [event.type, event.data.id])).toEqual([['obligation-registered', 'test-001'], ['obligation-reported', 'cap-001']]);
    const first = registered(all[0]!.data as never);
    const resumed = capabilityContext([first]);
    expect(obligationEventsToRecord(submission, resumed.actor, identity, resumed.projection, [first]).map(event => event.data.id)).toEqual(['cap-001']);
    const both = [first, reported(all[1]!.data as never)];
    const replayed = capabilityContext(both);
    expect(obligationEventsToRecord(submission, replayed.actor, identity, replayed.projection, both)).toEqual([]);
    // The same report in a distinct accepted submission is a new judgment, which validation holds to the current revision.
    expect(obligationEventsToRecord(submission, replayed.actor, { ...identity, submission: submissionHash('e') }, replayed.projection, both)
      .map(event => event.data.id)).toEqual(['test-002', 'cap-001']);
    expect(replayed.projection.obligations.get('cap-001')).toMatchObject({ status: 'done', revision: 1, report: { where: 'subs/b/src/fact.ts', by: 'inv-0003' } });
  });

  it('PB3-D08 PB3-D09 a handback owes a done report for each registered obligation of its task, outcome-only or separately tracked, and none for an example', () => {
    const owed = (events: Parameters<typeof capabilityContext>[0]) =>
      unreportedObligations(capabilityContext(events).projection, { kind: 'capability-task', id: 'cap-001' }).map(unreportedText);
    // Outcome-only tracking: the delegated outcome is the one report owed.
    expect(owed([])).toEqual(['cap-001 is pending and not reported done: report it done in `reports` where it holds, or assign an iteration that binds it']);
    const doneOutcome = reported({ id: 'cap-001', judgment: 'done', basedOnRevision: 0, revision: 1, by: 'inv-0003', submission: submissionHash('a') });
    expect(owed([doneOutcome])).toEqual([]);
    // Separate tracking: a registered case and test are owed beside it; the consumer's sc-001 is not the task's to report.
    const separate = [
      registered({ id: 'cap-001.case.need-001.ex01', kind: 'scenario', responsible: { kind: 'capability-task', id: 'cap-001' },
        by: 'inv-0003', submission: submissionHash('b'), case: 'need-001.ex01' }),
      registered({ id: 'test-001', kind: 'test', responsible: { kind: 'capability-task', id: 'cap-001' },
        by: 'inv-0003', submission: submissionHash('b'), description: 'B keeps the old text for D' }),
      doneOutcome,
      line('obligation-bound', { id: 'test-001', fakes: ['FactSourceFake'], by: 'inv-0005', submission: submissionHash('c') }),
    ];
    expect(owed(separate).map(text => text.split(':')[0])).toEqual(['cap-001.case.need-001.ex01 is pending and not reported done', 'test-001 is bound and not reported done']);
    expect(owed([...separate,
      reported({ id: 'cap-001.case.need-001.ex01', judgment: 'done', basedOnRevision: 0, revision: 1, by: 'inv-0006', submission: submissionHash('d') }),
      reported({ id: 'test-001', judgment: 'done', basedOnRevision: 0, revision: 1, by: 'inv-0006', submission: submissionHash('d') }),
    ])).toEqual([]);
  });
});

const a = 'capability-coordination/a';
const b = 'capability-coordination/b';

/** One delegation whose capability architect registers and reports while it keeps coordinating. */
function reportingScript(prompts: string[]): Script {
  let engineerTurns = 0;
  let capabilityTurns = 0;
  return spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('richer-a-fact', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, { goal: 'Render the richer B fact in A.' }, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact and A owns integration', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') {
      engineerTurns += 1;
      if (engineerTurns > 1) return [];
      return [
        edit('caller.ts', "return `Fact: ${value}`;", "return `Fresh fact: ${value}`;"),
        ...submit({ kind: 'capability-needed', summary: 'A has a provisional caller', request: {
          need: 'Read B fact with its source for A',
          usage: [{ path: 'subs/a/src/caller.ts', symbol: 'renderA', use: 'Render the richer result', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'A shows source', code: "expect(renderA(readFactWithSource())).toBe('Fresh fact: old from B')", designation: 'pseudocode' }],
        } }),
      ];
    }
    if (spec.role === 'capability-architect') {
      capabilityTurns += 1;
      prompts.push(spec.prompt);
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      const basis = { task: ids[1], planRevision: Number(ids[2]), invocation: ids[3] };
      if (capabilityTurns === 1) {
        const progress = { kind: 'partial', ...basis, progress: 'Read A and B', unfinished: ['Assign B'] };
        return [
          // Another owner's scenario and a case the plan does not have: refused, nothing recorded.
          { kind: 'submit', input: { ...progress, registrations: [{ kind: 'scenario', case: 'need-001.ex09' }],
            reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }] } },
          { kind: 'submit', input: { ...progress,
            registrations: [{ kind: 'scenario', case: 'need-001.ex01' }, { kind: 'test', description: 'B keeps the old text for D' }],
            reports: [{ id: basis.task, judgment: 'done', basedOnRevision: 0, where: 'subs/b/src/never-written.ts — readFactWithSource' }] } },
        ];
      }
      if (capabilityTurns === 2) {
        // An explicit revision while coordination continues with an assignment.
        return submit({ kind: 'assign', ...basis, reports: [{ id: basis.task, judgment: 'bound', basedOnRevision: 1 }],
          assignment: assign(b, { goal: 'Provide richer fact', approach: 'Extend B fact API', completionEvidence: 'A consumes the new B fact' }).assignment });
      }
    }
    return [];
  };
}

it('PB3-D01 PB3-D02 PB3-D04: a capability architect registers a case and a test and reports during coordination; the run records exactly that', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  const prompts: string[] = [];
  const opened = await openCapabilityRuns(fixture.root, { git: gitService, script: reportingScript(prompts), inputs: treeInputs() });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  const events = () => opened.service.events('need', receipt.jobId) ?? [];
  await until(() => events().some(event => event.type === 'capability-assigned'
    || event.type === 'job-failed' || event.type === 'job-completed'));
  const logged = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const recorded = logged.filter((event): event is Extract<RunEvent, { type: 'obligation-registered' | 'obligation-reported' }> =>
    event.type === 'obligation-registered' || event.type === 'obligation-reported');
  const starts = logged.filter(event => event.type === 'invocation-started' && event.data.role === 'capability-architect')
    .map(event => (event.data as { invocation: string }).invocation);
  expect(starts.length).toBeGreaterThanOrEqual(2);
  const hashOf = (invocation: string) => (logged.find(event => event.type === 'invocation-ended' && event.data.invocation === invocation)!.data as { submission: string }).submission;
  const [first, second] = starts as [string, string];
  expect(recorded.map(event => [event.type, event.data])).toEqual([
    ['obligation-registered', { id: 'cap-001.case.need-001.ex01', kind: 'scenario', responsible: { kind: 'capability-task', id: 'cap-001' },
      by: first, submission: hashOf(first), case: 'need-001.ex01' }],
    ['obligation-registered', { id: 'test-001', kind: 'test', responsible: { kind: 'capability-task', id: 'cap-001' },
      by: first, submission: hashOf(first), description: 'B keeps the old text for D' }],
    ['obligation-reported', { id: 'cap-001', judgment: 'done', basedOnRevision: 0, revision: 1,
      where: 'subs/b/src/never-written.ts — readFactWithSource', by: first, submission: hashOf(first) }],
    ['obligation-reported', { id: 'cap-001', judgment: 'bound', basedOnRevision: 1, revision: 2, by: second, submission: hashOf(second) }],
  ]);
  // The revision rode on an assignment that proceeded; the consumer's own scenario was never reported.
  expect(logged.some(event => event.type === 'capability-assigned')).toBe(true);
  expect(recorded.some(event => event.data.id === 'sc-001')).toBe(false);
  // The next turn's briefing forwards the earlier judgment and its where text as written.
  expect(prompts[0]).toContain('- cap-001 (delegated outcome): pending, revision 0; not bound; no report yet');
  expect(prompts[1]).toContain(`- cap-001 (delegated outcome): done, revision 1; not bound; last report done by ${first}, where: subs/b/src/never-written.ts — readFactWithSource`);
  expect(prompts[1]).toContain('- test-001 (registered test: B keeps the old text for D): pending, revision 0; not bound; no report yet');
}, 300_000);
