import { z } from 'zod';
import type { ScenarioRecord } from '../../subs/scenarios/src/records.js';
import { boundState, reportedState } from '../../subs/scenarios/src/states.js';
import { carriesFakeDesignation } from '../contracts/naming.js';
import type { SubmissionError } from '../run/submissions.js';
import { integrationScenarioOf, type WorkItem } from './records.js';

/*
 * Registered obligations and the responsible architect's reports on them,
 * as Plan 21's iteration 0 contract freezes them.
 *
 * An obligation is something a responsible architect reports on: an
 * accepted initial-analysis scenario (`sc-NNN`), a delegated capability
 * task's default outcome (`cap-NNN`), a capability-plan use case its task's
 * architect explicitly registered (`<task>.case.<case>`), or a required test
 * an architect explicitly registered (`test-NNN`). Ordinary tests never
 * register themselves, and registration never removes a requirement.
 *
 * Each obligation is `pending`, `bound` or `done`, and each state is
 * entered by one accepted submission: registration, an engineer's binding
 * that names the fakes it relies on, or the responsible architect's report.
 * A report is the architect's judgment: `done` means correctly implemented
 * and passing in its judgment, and `bound` is only an explicit revision of
 * an earlier `done`. A binding of a `done` obligation records its fakes and
 * leaves it `done`. The harness checks the IDs, the actor's authority, the
 * report revision and the structure, then records and trusts the judgment.
 * It never reads the optional `where` text, resolves a path, matches a test
 * result or treats an audit outcome as corroboration or retraction.
 *
 * There is no second registry: the one read projection folds the existing
 * scenario records, capability delegations and the three accepted-submission
 * events below.
 */

const text = z.string().min(1).refine(value => value.trim().length > 0, 'Must contain non-whitespace text');

/** The optional navigation hint: one short line, stored and shown, never resolved. */
export const whereSchema = text.max(300);

/** An explicit registration. A scenario registration names a use case of the task's current plan. */
export const obligationRegistrationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scenario'), case: text }).strict(),
  z.object({ kind: z.literal('test'), description: text }).strict(),
]);
export type ObligationRegistration = z.infer<typeof obligationRegistrationSchema>;

/** One architect report. `basedOnRevision` names the obligation's current report revision. */
export const obligationReportSchema = z.object({
  id: text,
  judgment: z.enum(['done', 'bound']),
  basedOnRevision: z.int().nonnegative(),
  where: whereSchema.optional(),
}).strict();
export type ObligationReport = z.infer<typeof obligationReportSchema>;

/** The two optional arrays an architect submission carries; both default to empty. */
export const obligationSubmissionFields = {
  /** Obligations this architect chooses to track independently. */
  registrations: z.array(obligationRegistrationSchema).default([]),
  /** This architect's judgments on obligations it is responsible for. */
  reports: z.array(obligationReportSchema).default([]),
};

const responsibleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('work-item'), id: text }).strict(),
  z.object({ kind: z.literal('capability-task'), id: text }).strict(),
]);

/** `obligation-registered`: one accepted registration, with its declaring invocation and submission. */
export const obligationRegisteredDataSchema = z.object({
  id: text,
  kind: z.enum(['scenario', 'test']),
  responsible: responsibleSchema,
  /** The invocation whose accepted submission registered it. */
  by: text,
  /** The SHA-256 of that accepted submission. */
  submission: z.string().regex(/^[0-9a-f]{64}$/),
  case: text.optional(),
  description: text.optional(),
}).strict().superRefine((data, context) => {
  if (data.kind === 'scenario' && (data.case === undefined || data.description !== undefined)) {
    context.addIssue({ code: 'custom', path: ['case'], message: 'A scenario registration names its case and no description' });
  }
  if (data.kind === 'test' && (data.description === undefined || data.case !== undefined)) {
    context.addIssue({ code: 'custom', path: ['description'], message: 'A test registration names its description and no case' });
  }
});
export type ObligationRegisteredData = z.infer<typeof obligationRegisteredDataSchema>;

/** `obligation-reported`: one accepted architect report, at the revision it records. */
export const obligationReportedDataSchema = z.object({
  id: text,
  judgment: z.enum(['done', 'bound']),
  basedOnRevision: z.int().nonnegative(),
  revision: z.int().positive(),
  where: whereSchema.optional(),
  by: text,
  submission: z.string().regex(/^[0-9a-f]{64}$/),
}).strict().refine(data => data.revision === data.basedOnRevision + 1, {
  path: ['revision'], message: 'A report records the revision after the one it is based on',
});
export type ObligationReportedData = z.infer<typeof obligationReportedDataSchema>;

/** A fake class or export name an engineer's binding relies on: it carries the fake-naming rule's `Fake` designation. */
export const fakeNameSchema = text.max(200).refine(carriesFakeDesignation, 'A fake\'s name carries "Fake", as the fake-naming rule requires');

/** One binding of an engineer's completion proposal: an assigned obligation and the fakes it relies on, none by default. */
export const obligationBindingSchema = z.object({
  id: text,
  fakes: z.array(fakeNameSchema).max(100).default([]),
}).strict();
export type ObligationBinding = z.infer<typeof obligationBindingSchema>;

/**
 * `obligation-bound`: one accepted engineer binding, with the fakes it names
 * and its proposing invocation and submission. The harness never reads the
 * source to confirm either.
 */
export const obligationBoundDataSchema = z.object({
  id: text,
  fakes: z.array(fakeNameSchema),
  by: text,
  submission: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type ObligationBoundData = z.infer<typeof obligationBoundDataSchema>;

export type ObligationStatus = 'pending' | 'bound' | 'done';
export type ObligationKind = 'scenario' | 'outcome' | 'test';

/**
 * Who reports on an obligation. An integration scenario whose work item
 * does not exist yet is held by its stable key, and no invocation may
 * report on it until that work item's local architect does.
 */
export type ObligationResponsible =
  | { readonly kind: 'work-item'; readonly id: string }
  | { readonly kind: 'capability-task'; readonly id: string }
  | { readonly kind: 'integration-scenario'; readonly id: string };

/** An accepted engineer binding, as the projection keeps the latest one. */
export interface RecordedBinding {
  readonly fakes: readonly string[];
  readonly by: string;
  readonly submission: string;
  readonly sequence: number;
  readonly at: string;
}

/** An accepted report, as the projection keeps the latest one. */
export interface RecordedReport {
  readonly judgment: 'done' | 'bound';
  readonly basedOnRevision: number;
  readonly revision: number;
  readonly where: string | null;
  readonly by: string;
  readonly submission: string;
  readonly sequence: number;
  readonly at: string;
}

export interface Obligation {
  readonly id: string;
  readonly kind: ObligationKind;
  readonly responsible: ObligationResponsible;
  readonly status: ObligationStatus;
  /** The report revision: 0 on registration, incremented by each accepted report. */
  readonly revision: number;
  /** The registered capability-plan case, for a case registration. */
  readonly case: string | null;
  /** The registered test's description. */
  readonly description: string | null;
  /** The explicit registration; null for an analysis scenario or a delegated outcome, which need none. */
  readonly registeredBy: { readonly by: string; readonly submission: string } | null;
  /** The latest accepted engineer binding and its fakes; null while none was made. */
  readonly binding: RecordedBinding | null;
  /** The latest accepted architect report; null while none was made. */
  readonly report: RecordedReport | null;
}

/**
 * An event line as the run log carries it. The projection reads
 * `capability-delegated`, `obligation-registered`, `obligation-bound` and
 * `obligation-reported` and passes over every other type.
 */
export interface ObligationEventLine {
  readonly type: string;
  readonly sequence: number;
  readonly at: string;
  readonly data: unknown;
}

export interface ObligationSources {
  /** The tracked scenario records, in committed order. */
  readonly scenarios: readonly ScenarioRecord[];
  /** The committed work items, which hold entry and integration scenarios. */
  readonly workItems: readonly WorkItem[];
  /** The run's events in log order. */
  readonly events: readonly ObligationEventLine[];
}

export interface ObligationProjection {
  /** Every obligation, in registration order. */
  readonly obligations: ReadonlyMap<string, Obligation>;
  /** Accepted test registrations, which number the next `test-NNN`. */
  readonly tests: number;
}

/** `test-001`, `test-002`, … numbered by accepted test registrations in the run. */
export function testObligationId(count: number): string {
  return `test-${String(count).padStart(3, '0')}`;
}

/** The stable ID of a registered capability-plan case. */
export function caseObligationId(task: string, useCase: string): string {
  return `${task}.case.${useCase}`;
}

/**
 * The scenario's responsible architect, or null when its entry has no
 * committed work item. The harness commits entry work items with their
 * scenarios in one `analysis-accepted`, so that happens only in records the
 * harness did not write; such a scenario has no responsible architect and is
 * therefore no obligation, and the read projection does not fail on it.
 */
function scenarioResponsible(record: ScenarioRecord, workItems: readonly WorkItem[]): ObligationResponsible | null {
  if (record.kind === 'integration') {
    const item = workItems.find(candidate => integrationScenarioOf(candidate) === record.id);
    return item === undefined ? { kind: 'integration-scenario', id: record.id } : { kind: 'work-item', id: item.id };
  }
  const item = workItems.find(candidate => 'entry' in candidate.origin && candidate.origin.entry === record.entry);
  return item === undefined ? null : { kind: 'work-item', id: item.id };
}

/**
 * The one read projection: analysis scenarios and delegated outcomes are
 * `pending` from their own records, explicit registrations from their
 * events; each accepted binding makes one `bound` unless it is `done`, and
 * records its fakes; each accepted report sets the status and revision.
 * Nothing else moves a status: no gate, audit, source change, repair exit
 * or engineer report.
 */
export function obligationsOf(sources: ObligationSources): ObligationProjection {
  const obligations = new Map<string, Obligation>();
  let tests = 0;
  const base = { status: 'pending' as const, revision: 0, case: null, description: null, registeredBy: null, binding: null, report: null };
  for (const record of sources.scenarios) {
    const responsible = scenarioResponsible(record, sources.workItems);
    if (responsible !== null) obligations.set(record.id, { ...base, id: record.id, kind: 'scenario', responsible });
  }
  for (const line of sources.events) {
    if (line.type === 'capability-delegated') {
      const task = (line.data as { task: string }).task;
      if (!obligations.has(task)) obligations.set(task, { ...base, id: task, kind: 'outcome', responsible: { kind: 'capability-task', id: task } });
      continue;
    }
    if (line.type === 'obligation-registered') {
      const data = line.data as ObligationRegisteredData;
      if (data.kind === 'test') tests += 1;
      obligations.set(data.id, {
        ...base, id: data.id, kind: data.kind, responsible: data.responsible,
        case: data.case ?? null, description: data.description ?? null,
        registeredBy: { by: data.by, submission: data.submission },
      });
      continue;
    }
    if (line.type === 'obligation-bound') {
      const data = line.data as ObligationBoundData;
      const current = obligations.get(data.id);
      if (current === undefined) continue;
      obligations.set(data.id, {
        ...current, status: boundState(current.status),
        binding: { fakes: [...data.fakes], by: data.by, submission: data.submission, sequence: line.sequence, at: line.at },
      });
      continue;
    }
    if (line.type === 'obligation-reported') {
      const data = line.data as ObligationReportedData;
      const current = obligations.get(data.id);
      if (current === undefined) continue;
      obligations.set(data.id, {
        ...current, status: reportedState(data.judgment), revision: data.revision,
        report: {
          judgment: data.judgment, basedOnRevision: data.basedOnRevision, revision: data.revision,
          where: data.where ?? null, by: data.by, submission: data.submission, sequence: line.sequence, at: line.at,
        },
      });
    }
  }
  return { obligations, tests };
}

/** The architect a submission comes from, as its own validated authority establishes it. */
export type ObligationActor =
  | { readonly kind: 'work-item'; readonly id: string }
  | {
      readonly kind: 'capability-task'; readonly id: string;
      /** The use case IDs of the task's current accepted plan revision. */
      readonly useCases: ReadonlySet<string>;
    };

/** What a submission's registrations and reports are judged against. */
export interface ObligationContext {
  readonly actor: ObligationActor;
  readonly projection: ObligationProjection;
}

function describeResponsible(responsible: ObligationResponsible): string {
  switch (responsible.kind) {
    case 'work-item': return `the local architect of ${responsible.id}`;
    case 'capability-task': return `the capability architect of ${responsible.id}`;
    case 'integration-scenario': return `the local architect of ${responsible.id}'s integration work item, which does not exist yet`;
  }
}

function describeActor(actor: ObligationActor): string {
  return actor.kind === 'work-item' ? `the local architect of ${actor.id}` : `the capability architect of ${actor.id}`;
}

/** Whether this actor is the obligation's responsible architect. A module path never establishes it. */
export function isResponsible(actor: ObligationActor, obligation: Obligation): boolean {
  return obligation.responsible.kind === actor.kind && obligation.responsible.id === actor.id;
}

/** One registration as it would be recorded, with the ID the harness gives it. */
export interface PlannedRegistration {
  readonly id: string;
  readonly kind: 'scenario' | 'test';
  readonly responsible: { readonly kind: 'work-item' | 'capability-task'; readonly id: string };
  readonly case?: string;
  readonly description?: string;
}

/**
 * The registrations as they would be recorded, in submission order. Test
 * IDs follow the run's accepted test registrations; a case ID is the task's
 * own key for the case.
 */
export function plannedRegistrations(
  registrations: readonly ObligationRegistration[], actor: ObligationActor, tests: number,
): PlannedRegistration[] {
  const responsible = { kind: actor.kind, id: actor.id };
  let count = tests;
  return registrations.map(registration => {
    if (registration.kind === 'test') {
      count += 1;
      return { id: testObligationId(count), kind: 'test', responsible, description: registration.description };
    }
    return { id: caseObligationId(actor.id, registration.case), kind: 'scenario', responsible, case: registration.case };
  });
}

/**
 * Every reason the registrations and reports cannot be accepted, each at its
 * path. Registrations are judged first; the reports are then judged against
 * the projection with those registrations applied, so a submission may
 * register a case and report it at once. Nothing is judged about whether the
 * reported work is correct, and `where` is never read.
 */
export function obligationSubmissionErrors(
  submission: { readonly registrations: readonly ObligationRegistration[]; readonly reports: readonly ObligationReport[] },
  context: ObligationContext,
  path = '',
): SubmissionError[] {
  const at = (rest: string) => `${path}${rest}`;
  const { actor, projection } = context;
  const errors: SubmissionError[] = [];
  const planned = plannedRegistrations(submission.registrations, actor, projection.tests);
  const known = new Map(projection.obligations);
  const seenCases = new Set<string>();
  const seenTests = new Set<string>();
  submission.registrations.forEach((registration, index) => {
    const entry = planned[index]!;
    if (registration.kind === 'scenario') {
      if (actor.kind !== 'capability-task') {
        errors.push({
          path: at(`registrations.${index}.kind`),
          message: 'A case registration is accepted only from its capability task\'s current architect; a local architect may register a required test',
          expected: '"test"',
        });
        return;
      }
      if (!actor.useCases.has(registration.case)) {
        errors.push({
          path: at(`registrations.${index}.case`),
          message: `"${registration.case}" is no use case of ${actor.id}'s current plan revision; add it through a plan update first`,
          expected: actor.useCases.size === 0 ? 'a use case of the current plan' : `one of ${[...actor.useCases].join(', ')}`,
        });
        return;
      }
      if (known.has(entry.id) || seenCases.has(entry.id)) {
        errors.push({ path: at(`registrations.${index}.case`), message: `${entry.id} is already registered`, expected: 'a case not yet registered' });
        return;
      }
      seenCases.add(entry.id);
    } else {
      const description = registration.description.trim();
      const existing = [...known.values()].find(obligation => obligation.kind === 'test'
        && obligation.responsible.kind === actor.kind && obligation.responsible.id === actor.id
        && obligation.description?.trim() === description);
      if (existing !== undefined || seenTests.has(description)) {
        errors.push({
          path: at(`registrations.${index}.description`),
          message: existing === undefined ? 'This submission registers the same test twice' : `This test is already registered as ${existing.id}`,
          expected: 'a test not yet registered by this architect',
        });
        return;
      }
      seenTests.add(description);
    }
    known.set(entry.id, {
      id: entry.id, kind: entry.kind, responsible: entry.responsible, status: 'pending', revision: 0,
      case: entry.case ?? null, description: entry.description ?? null, registeredBy: null, binding: null, report: null,
    });
  });

  const reported = new Set<string>();
  submission.reports.forEach((report, index) => {
    const obligation = known.get(report.id);
    if (obligation === undefined) {
      errors.push({
        path: at(`reports.${index}.id`),
        message: `"${report.id}" is no registered obligation of this run`,
        expected: 'an ID this architect is responsible for',
      });
      return;
    }
    if (!isResponsible(actor, obligation)) {
      errors.push({
        path: at(`reports.${index}.id`),
        message: `${report.id} is reported by ${describeResponsible(obligation.responsible)}, not by ${describeActor(actor)}`,
        expected: 'an ID this architect is responsible for',
      });
      return;
    }
    if (reported.has(report.id)) {
      errors.push({ path: at(`reports.${index}.id`), message: `${report.id} is reported twice in this submission`, expected: 'one report per obligation' });
      return;
    }
    reported.add(report.id);
    if (report.basedOnRevision !== obligation.revision) {
      errors.push({
        path: at(`reports.${index}.basedOnRevision`),
        message: `${report.id} is at report revision ${obligation.revision}; a report based on ${report.basedOnRevision} is stale`,
        expected: String(obligation.revision),
      });
      return;
    }
    if (report.judgment === 'bound' && obligation.status !== 'done') {
      errors.push({
        path: at(`reports.${index}.judgment`),
        message: `${report.id} is ${obligation.status}; "bound" only revises an earlier "done" report`,
        expected: '"done"',
      });
    }
  });
  return errors;
}

/**
 * Every reason an assignment's `obligations` cannot name these IDs. Each is
 * a registered obligation this architect reports on, the registrations of
 * the same submission included, named once. The list is the architect's
 * choice of what this engineer binds; nothing about the work is judged.
 */
export function assignedObligationErrors(
  ids: readonly string[],
  context: ObligationContext & { readonly registrations?: readonly ObligationRegistration[] | undefined },
  path = 'assignment.obligations',
): SubmissionError[] {
  const { actor, projection } = context;
  const planned = new Set(plannedRegistrations(context.registrations ?? [], actor, projection.tests).map(entry => entry.id));
  const owned = [...obligationsOwnedBy(projection, actor).map(obligation => obligation.id), ...planned];
  const expected = owned.length === 0 ? 'an obligation this architect reports on' : `IDs among ${owned.join(', ')}`;
  const errors: SubmissionError[] = [];
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    const at = `${path}.${index}`;
    if (seen.has(id)) {
      errors.push({ path: at, message: `${id} is named twice`, expected: 'each assigned obligation once' });
      return;
    }
    seen.add(id);
    if (planned.has(id)) return;
    const obligation = projection.obligations.get(id);
    if (obligation === undefined) {
      errors.push({ path: at, message: `"${id}" is no registered obligation of this run`, expected });
      return;
    }
    if (!isResponsible(actor, obligation)) {
      errors.push({
        path: at,
        message: `${id} is reported by ${describeResponsible(obligation.responsible)}, so ${describeActor(actor)} cannot assign its binding`,
        expected,
      });
    }
  });
  return errors;
}

/**
 * Every reason an engineer's `bindings` cannot be accepted: an ID the
 * assignment does not name, one named twice, a fake named twice, and every
 * assigned obligation the proposal leaves out, named together. The check is
 * structural; whether a declared binding or fake is right is the gate's
 * audit and the architect's to find, never the harness's.
 */
export function bindingErrors(bindings: readonly ObligationBinding[], assigned: readonly string[], path = 'bindings'): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const expected = assigned.length === 0 ? 'an empty list: this assignment names no obligation' : `each of ${assigned.join(', ')} once`;
  const seen = new Set<string>();
  bindings.forEach((binding, index) => {
    const at = `${path}.${index}`;
    if (!assigned.includes(binding.id)) {
      errors.push({ path: `${at}.id`, message: `${binding.id} is not assigned to this iteration, so this engineer cannot bind it`, expected });
      return;
    }
    if (seen.has(binding.id)) {
      errors.push({ path: `${at}.id`, message: `${binding.id} is bound twice`, expected });
      return;
    }
    seen.add(binding.id);
    const fakes = new Set<string>();
    binding.fakes.forEach((fake, position) => {
      if (fakes.has(fake)) errors.push({ path: `${at}.fakes.${position}`, message: `${fake} is named twice`, expected: 'each fake once' });
      fakes.add(fake);
    });
  });
  const missing = assigned.filter(id => !seen.has(id));
  if (missing.length > 0) {
    errors.push({
      path,
      message: `The assignment names ${missing.join(', ')}, which this proposal does not bind. Bind every assigned obligation, `
        + 'with the fakes its binding relies on, or report "partial" with what is unfinished',
      expected,
    });
  }
  return errors;
}

/**
 * The `obligation-bound` events an accepted proposal still needs, in its
 * order. A binding this same accepted submission already recorded is not
 * recorded again, so a replay applies each once.
 */
export function bindingEventsToRecord(
  bindings: readonly ObligationBinding[],
  identity: { readonly by: string; readonly submission: string },
  events: readonly ObligationEventLine[],
): Array<{ readonly type: 'obligation-bound'; readonly data: ObligationBoundData }> {
  const recorded = new Set(events.filter(line => line.type === 'obligation-bound')
    .map(line => line.data as ObligationBoundData)
    .filter(data => data.by === identity.by && data.submission === identity.submission)
    .map(data => data.id));
  return bindings.filter(binding => !recorded.has(binding.id)).map(binding => ({
    type: 'obligation-bound', data: { id: binding.id, fakes: [...binding.fakes], by: identity.by, submission: identity.submission },
  }));
}

/** One run-log write that records part of an accepted submission. */
export type ObligationEventInput =
  | { readonly type: 'obligation-registered'; readonly data: ObligationRegisteredData }
  | { readonly type: 'obligation-reported'; readonly data: ObligationReportedData };

/**
 * The events an accepted submission still needs, in order: its
 * registrations, then its reports. The submission's identity, its invocation
 * and hash, is checked first: what this same accepted submission already
 * recorded is not recorded again, so a replay or a resumed partial write
 * applies each effect once and raises no stale-revision error. Validation
 * judged the submission against the ledger before it was accepted.
 */
export function obligationEventsToRecord(
  submission: { readonly registrations: readonly ObligationRegistration[]; readonly reports: readonly ObligationReport[] },
  actor: ObligationActor,
  identity: { readonly by: string; readonly submission: string },
  projection: ObligationProjection,
  events: readonly ObligationEventLine[],
): ObligationEventInput[] {
  const own = (line: ObligationEventLine): boolean => {
    const data = line.data as { by?: unknown; submission?: unknown };
    return data.by === identity.by && data.submission === identity.submission;
  };
  const registered = events.filter(line => line.type === 'obligation-registered' && own(line))
    .map(line => line.data as ObligationRegisteredData);
  const reported = events.filter(line => line.type === 'obligation-reported' && own(line)).length;
  const testsBefore = projection.tests - registered.filter(data => data.kind === 'test').length;
  const registrations: ObligationEventInput[] = plannedRegistrations(submission.registrations, actor, testsBefore)
    .slice(registered.length)
    .map(entry => ({ type: 'obligation-registered', data: {
      id: entry.id, kind: entry.kind, responsible: { ...entry.responsible }, by: identity.by, submission: identity.submission,
      ...(entry.case === undefined ? {} : { case: entry.case }),
      ...(entry.description === undefined ? {} : { description: entry.description }),
    } }));
  const reports: ObligationEventInput[] = submission.reports.slice(reported).map(report => ({ type: 'obligation-reported', data: {
    id: report.id, judgment: report.judgment, basedOnRevision: report.basedOnRevision, revision: report.basedOnRevision + 1,
    ...(report.where === undefined ? {} : { where: report.where }), by: identity.by, submission: identity.submission,
  } }));
  return [...registrations, ...reports];
}

/** The obligations this actor reports on, in registration order. */
export function obligationsOwnedBy(projection: ObligationProjection, actor: Pick<ObligationActor, 'kind' | 'id'>): Obligation[] {
  return [...projection.obligations.values()].filter(obligation =>
    obligation.responsible.kind === actor.kind && obligation.responsible.id === actor.id);
}

/**
 * The obligations an architect reports on, as its briefing shows them: the
 * status and revision its next report names, its own earlier judgment and
 * where text, and the reminder that gate and audit results are separate.
 */
export function obligationBriefingLines(owned: readonly Obligation[]): string[] {
  if (owned.length === 0) return [];
  const lines = [
    '# Registered obligations',
    '',
    'You are the responsible architect for these. Report one with `reports: [{ id, judgment: "done", basedOnRevision, where? }]` '
      + 'when, in your judgment, it is correctly implemented and passing; `basedOnRevision` is the revision shown. '
      + 'An engineer\'s accepted binding makes an obligation `bound` and names the fakes it relies on; '
      + 'a gate or audit result is execution evidence beside the status. Neither is your report, and neither changes one; '
      + 'your report is accepted whatever the fakes list says. Revise an earlier `done` with judgment "bound". '
      + 'Name the obligations an iteration binds in `assignment.obligations`. '
      + '`where` is an optional short navigation hint; the harness stores it and never reads it.',
    '',
  ];
  for (const obligation of owned) {
    const subject = obligation.kind === 'test' ? `registered test: ${obligation.description ?? ''}`
      : obligation.case !== null ? `registered case ${obligation.case}`
        : obligation.kind === 'outcome' ? 'delegated outcome' : 'scenario';
    const report = obligation.report === null ? 'no report yet'
      : `last report ${obligation.report.judgment} by ${obligation.report.by}${obligation.report.where === null ? '' : `, where: ${obligation.report.where}`}`;
    lines.push(`- ${obligation.id} (${subject}): ${obligation.status}, revision ${obligation.revision}; ${bindingText(obligation.binding)}; ${report}`);
  }
  return lines;
}

/** An obligation's latest binding as a briefing line states it. */
function bindingText(binding: RecordedBinding | null): string {
  if (binding === null) return 'not bound';
  return `bound by ${binding.by} ${binding.fakes.length === 0 ? 'with no fakes' : `relying on fakes ${binding.fakes.join(', ')}`}`;
}
