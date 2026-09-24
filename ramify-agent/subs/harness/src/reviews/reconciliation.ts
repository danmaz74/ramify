import { join } from 'node:path';
import { z } from 'zod';
import type { JsonSchema } from '../../subs/agent/src/interfaces/port.js';
import {
  checkFindingAtSchema, checkFindingCommunicationSchema, checkFindingIdSchema, checkFindingOptionSchema, checkFindingRelationKindSchema,
  checkFindingReportIdSchema, checkFindingRiskSchema,
  type CheckFindingActor, type CheckFindingReason, type CheckFindingRisk, type CheckFindingAt, type CheckFindingAwaiting, type CheckFindingCommand, type CheckFindingConflict,
  type CheckFindingDecisionInput, type CheckFindingEvent, type CheckFindingEvidence, type CheckFindingId, type CheckFindingRejection,
  type CheckFindingSource,
} from '../../subs/check-findings/src/interfaces/check-findings.js';
import { architectRefSchema, sessionIdSchema } from '../run/records.js';
import { schemaErrors, type SubmissionError, type SubmissionValidation } from '../run/submissions.js';
import { forkPointSchema, reviewAttemptIdSchema, reviewRequestIdSchema } from './records.js';

/*
 * Work-item reconciliation (Plan 12 appendix §6). When a module work item
 * requests completion, its review requests are settled, and the open and
 * due CheckFindings of the work item are its attention set. An empty set
 * goes to the work item's gate with no agent call. Otherwise one fork of the
 * local architect, at the point after its completion request, assesses
 * them together in one submission: how they relate, what becomes of each,
 * how each decision is communicated, and what the work item does next.
 *
 * The fork supplies judgments only. The harness binds the actor, the
 * source, the authority, the expected revisions, the repair intent and the
 * revision of every document a user decision cites, and the CheckFinding
 * child decides whether each transition is valid. Everything here is pure:
 * the run service reads the log, the documents and the state, and commits.
 */

const text = z.string().min(1);
const prose = z.string().min(1).max(4000);
const reference = z.string().min(1).max(500);

/** `wi-001.rc01`: the work item's reconciliation round. */
export const reconciliationId = (workItem: string, round: number): string => `${workItem}.rc${String(round).padStart(2, '0')}`;
export const reconciliationIdSchema = z.string().regex(/^.+\.rc\d{2,}$/);
/** The work item a reconciliation belongs to, from its ID. */
export const workItemOfReconciliation = (id: string): string => id.slice(0, id.lastIndexOf('.rc'));
/** A reconciliation's directory, `01`, from its ID. */
const roundDirectory = (id: string): string => id.slice(id.lastIndexOf('.rc') + 3);

/** Where each reconciliation record is materialized, under the run directory. */
export const reconciliationLayout = {
  basis: (id: string): string => join('work-items', workItemOfReconciliation(id), 'reconciliations', roundDirectory(id), 'basis.json'),
  assessment: (id: string): string => join('work-items', workItemOfReconciliation(id), 'reconciliations', roundDirectory(id), 'assessment.json'),
} as const;

/** The audited source a basis is captured on: the accepted commit and its tree. */
export const reconciliationSourceSchema = z.object({ commit: text, tree: text }).strict();
export type ReconciliationSource = z.infer<typeof reconciliationSourceSchema>;

/** One settled review request of the work item, with the attempt that settled it. */
export const basisRequestSchema = z.object({
  request: reviewRequestIdSchema,
  attempt: reviewAttemptIdSchema.nullable(),
  result: z.enum(['complete', 'partial', 'not-verified']),
}).strict();
export type BasisRequest = z.infer<typeof basisRequestSchema>;

/**
 * What one reconciliation round is captured on: the audited source, the
 * work item's settled requests with their terminal attempts, the complete
 * attention set at its revisions, the deferrals the harness found due, the
 * CheckFinding state version, and the point the assessment forks.
 */
export const reconciliationBasisSchema = z.object({
  schema: z.literal('ramify-agent.reconciliation-basis/1'),
  id: reconciliationIdSchema,
  workItem: text,
  round: z.int().positive(),
  source: reconciliationSourceSchema,
  requests: z.array(basisRequestSchema),
  checkFindings: z.array(checkFindingAtSchema),
  due: z.array(checkFindingIdSchema),
  applied: z.int().nonnegative(),
  forkPoint: forkPointSchema,
  /** What a correction may be planned for this round: any signal, one of at least the later rounds' risk, or none. */
  floor: z.enum(['any', 'non-low', 'none']),
}).strict();
export type ReconciliationBasis = z.infer<typeof reconciliationBasisSchema>;

// The fork's submission.

/** A document a user decision cites, and its exact conflicting text. The harness binds its revision. */
const citedConflictSchema = z.object({
  /** `plan` for the run's captured plan, or a path of a file in the basis source. */
  document: reference,
  text: prose,
}).strict();

/** What becomes of one CheckFinding, as the fork chooses it. */
export const reconciliationActionSchema = z.discriminatedUnion('action', [
  /** A correction iteration is needed; the CheckFinding stays open with this reconciliation's repair intent. Only within the round's floor. */
  z.object({ action: z.literal('repair') }).strict(),
  /** The concern no longer applies to the changed code: a fresh assessment of the named reports on the current source. */
  z.object({ action: z.literal('fixed'), reassessed: z.array(checkFindingReportIdSchema).min(1).max(100) }).strict(),
  /** The judgment does not hold: a replacing judgment, with no code change claimed. */
  z.object({ action: z.literal('supersede'), reassessed: z.array(checkFindingReportIdSchema).min(1).max(100), replacement: prose }).strict(),
  /** Understood, and the code stays as it is: the risk accepted and the uncertainty. It claims no repair and passes no gate. */
  z.object({ action: z.literal('waive'), acceptedRisk: checkFindingRiskSchema.optional(), uncertainty: prose }).strict(),
  /** Not now: the work item stays responsible, and the condition says when to look again. */
  z.object({ action: z.literal('defer'), revisit: prose }).strict(),
  /** A strong conflict with explicit text only a person can resolve: its exact text and the options. */
  z.object({
    action: z.literal('request-user-decision'),
    conflicts: z.array(citedConflictSchema).min(1).max(20),
    options: z.array(checkFindingOptionSchema).min(2).max(10),
  }).strict(),
  /** Left open: a signal this round cannot correct, below its floor, which stays unresolved. It records no decision. */
  z.object({ action: z.literal('leave') }).strict(),
]);
export type ReconciliationAction = z.infer<typeof reconciliationActionSchema>;

export const reconciliationSubmissionSchema = z.object({
  /** How CheckFindings relate. Only `same-issue` groups them; a pair with no plausible match needs no entry. */
  relations: z.array(z.object({
    from: checkFindingIdSchema,
    to: checkFindingIdSchema,
    relation: checkFindingRelationKindSchema,
    /** The shared behavior or violated obligation, and its expected outcome. */
    shared: prose,
    /** What supports it: paths with lines, report IDs, record paths. */
    evidence: z.array(reference).min(1).max(20),
    rationale: prose,
  }).strict()).max(50),
  /** One entry per CheckFinding of the attention set, except those that wait for a user or a check. */
  dispositions: z.array(z.object({
    checkFinding: checkFindingIdSchema,
    rationale: prose,
    /** Quiet by default; `report` makes it a material choice the user sees, with its fix and uncertainty. */
    communication: checkFindingCommunicationSchema,
    /** A correction of the signal's risk level, recorded with the decision; none with `leave`. */
    risk: checkFindingRiskSchema.optional(),
    action: reconciliationActionSchema,
  }).strict()).max(100),
  /** What the work item does next. */
  next: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('complete') }).strict(),
    z.object({ kind: z.literal('correct'), goal: prose }).strict(),
    z.object({ kind: z.literal('await-user') }).strict(),
    z.object({ kind: z.literal('unresolved') }).strict(),
  ]),
  /** The concise brief the harness appends to the local architect's own session. */
  brief: prose,
}).strict();
export type ReconciliationSubmission = z.infer<typeof reconciliationSubmissionSchema>;
export type ReconciliationNext = ReconciliationSubmission['next']['kind'];

export const reconciliationToolName = 'submit_reconciliation';
export const reconciliationJsonSchema = z.toJSONSchema(reconciliationSubmissionSchema) as JsonSchema;
export const reconciliationSubmissionDescription = 'End this reconciliation with one assessment: the relations you found, one disposition per CheckFinding that needs one, the next action of the work item and a concise brief. The harness validates it; an invalid submission is returned with every error, and a valid one ends this invocation.';

/**
 * The committed assessment: the fork's submission, what the harness bound
 * for it, the decisions it made, and the brief appended to the local
 * architect's session, which is `parent` where one was kept.
 */
export const reconciliationAssessmentSchema = z.object({
  schema: z.literal('ramify-agent.reconciliation-assessment/1'),
  id: reconciliationIdSchema,
  workItem: text,
  round: z.int().positive(),
  invocation: text,
  session: sessionIdSchema,
  requestedStart: z.enum(['fresh', 'fork']),
  actualStart: z.enum(['fresh', 'fork']).nullable(),
  submission: reconciliationSubmissionSchema,
  /** Each user decision's conflicts as the harness bound them: document, revision and verbatim text. */
  conflicts: z.array(z.object({
    checkFinding: checkFindingIdSchema,
    conflicts: z.array(z.object({ text: prose, document: reference, revision: reference }).strict()),
  }).strict()),
  next: z.enum(['complete', 'correct', 'await-user', 'unresolved']),
  /** The CheckFindings its decisions changed, and the decisions and relations it made, by ID. */
  checkFindings: z.array(checkFindingIdSchema),
  decisions: z.array(z.string()),
  relations: z.array(z.string()),
  parent: architectRefSchema.nullable(),
  brief: z.string(),
}).strict();
export type ReconciliationAssessment = z.infer<typeof reconciliationAssessmentSchema>;

export const reconciliationSchemas = {
  reconciliationBasis: { schema: 'ramify-agent.reconciliation-basis/1', body: reconciliationBasisSchema },
  reconciliationAssessment: { schema: 'ramify-agent.reconciliation-assessment/1', body: reconciliationAssessmentSchema },
} as const;

// The events' data. The run log imports these.

export const reconciliationStartedDataSchema = z.object({
  workItem: text,
  reconciliation: reconciliationIdSchema,
  round: z.int().positive(),
}).strict();

export const reconciliationAssessedFields = {
  workItem: text,
  reconciliation: reconciliationIdSchema,
  invocation: text,
  next: z.enum(['complete', 'correct', 'await-user', 'unresolved']),
} as const;

/** How the brief append to the local architect's session ended. */
export const briefAppendOutcomeSchema = z.enum(['appended', 'already-present', 'session-lost', 'failed', 'no-session']);
export type BriefAppendOutcome = z.infer<typeof briefAppendOutcomeSchema>;

export const reconciliationBriefAppendedDataSchema = z.object({
  reconciliation: reconciliationIdSchema,
  session: sessionIdSchema.nullable(),
  ref: text.nullable(),
  outcome: briefAppendOutcomeSchema,
  reason: z.string().nullable(),
}).strict();

/** A basis that no longer held: at the assessment's commit, at the work item's completion, or a fork that returned none. */
export const reconciliationRefusedDataSchema = z.object({
  workItem: text,
  reconciliation: reconciliationIdSchema.nullable(),
  stage: z.enum(['assessment', 'completion']),
  reason: text,
}).strict();

/** Why a CheckFinding of a completed work item was left open (appendix §6). */
export const unresolvedReasonSchema = z.enum(['rounds-exhausted', 'below-floor', 'raised-after-last-round']);
export type UnresolvedReason = z.infer<typeof unresolvedReasonSchema>;

/** Each CheckFinding a work item completed with open, and why; `work-item-completed` carries them. */
export const unresolvedField = z.array(z.object({ checkFinding: checkFindingIdSchema, reason: unresolvedReasonSchema }).strict()).max(500);

// Floors and authority.

/** The risk levels in increasing order. */
const riskOrder: readonly CheckFindingRisk[] = ['low', 'medium', 'high'];
export const riskAtLeast = (risk: CheckFindingRisk, minimum: CheckFindingRisk): boolean => riskOrder.indexOf(risk) >= riskOrder.indexOf(minimum);

/** A round's floor: any signal in the first, none in the last, one of at least `minimum` risk between. The last round wins. */
export function roundFloor(round: number, rounds: number): ReconciliationBasis['floor'] {
  if (round >= rounds) return 'none';
  return round === 1 ? 'any' : 'non-low';
}

/** Whether a correction may be planned for a signal of `risk` under `floor`. */
export function withinFloor(floor: ReconciliationBasis['floor'], risk: CheckFindingRisk, minimum: CheckFindingRisk): boolean {
  return floor === 'any' || (floor === 'non-low' && riskAtLeast(risk, minimum));
}

/**
 * Whether a local architect has waive authority over these modules: each is
 * its work item's module or a module beneath it (appendix §10).
 */
export function withinModule(module: string, modules: readonly string[]): boolean {
  return modules.every(entry => entry === module || entry.startsWith(`${module}/`));
}

// Validation and binding.

/** One CheckFinding of the attention set, as the fork's assessment is judged against it. */
export interface AttentionEntry {
  readonly revision: number;
  readonly reason: CheckFindingReason;
  readonly awaiting: CheckFindingAwaiting | null;
  readonly risk: CheckFindingRisk;
  readonly modules: readonly string[];
}

/** What a submission is judged against, all bound by the harness. */
export interface ReconciliationContext {
  readonly id: string;
  readonly workItem: string;
  /** The work item's module, the bound of the local architect's waive authority. */
  readonly module: string;
  readonly floor: ReconciliationBasis['floor'];
  /** The least risk a correction after the first round may be planned for. */
  readonly laterRoundMinimumRisk: CheckFindingRisk;
  /** The attention set of the basis. */
  readonly attention: ReadonlyMap<CheckFindingId, AttentionEntry>;
  /** Every CheckFinding of the work item at its current revision, which a relation may name. */
  readonly held: ReadonlyMap<CheckFindingId, number>;
  readonly actor: CheckFindingActor;
  readonly source: CheckFindingSource;
  /** The evidence every decision and relation cites: the assessment's submission. */
  readonly evidence: (submission: ReconciliationSubmission) => readonly CheckFindingEvidence[];
  /** A cited document's text and the revision the harness names it by; null for one it cannot read. */
  readonly document: (path: string) => Promise<{ readonly text: string; readonly revision: string } | null>;
  /**
   * The child's decision of the bound command against the state as it
   * stands, or null where the basis no longer holds: the commit then
   * refuses it as stale and starts a new round.
   */
  readonly decide: (command: CheckFindingCommand) => CheckFindingRejection | null;
}

/** An accepted submission and what the harness bound for it. */
export interface BoundReconciliation {
  readonly submission: ReconciliationSubmission;
  /** The commands of the assessment, relations first, in submission order. */
  readonly commands: readonly Extract<CheckFindingCommand, { type: 'dispose' | 'relate' }>[];
  readonly conflicts: ReconciliationAssessment['conflicts'];
}

/** Whether an attention entry needs a disposition: one waiting for a user or a check is not the fork's to decide. */
export const needsDisposition = (entry: Pick<AttentionEntry, 'awaiting'>): boolean => entry.awaiting !== 'user-decision' && entry.awaiting !== 'witness';

/**
 * Whether a round after the first is warranted (principles, Bound the
 * correction loop): a signal of at least the minimum risk needs one, and so
 * does a repair claimed by a correction or a user's answer, which an earlier
 * round is waiting to assess.
 */
export function needsLaterRound(attention: Iterable<AttentionEntry>, minimum: CheckFindingRisk): boolean {
  return [...attention].some(entry => needsDisposition(entry)
    && (riskAtLeast(entry.risk, minimum) || entry.reason === 'repair-claimed' || entry.reason === 'user-decision-answered'));
}

/** The next action a set of dispositions leads to. */
export function nextOf(actions: readonly ReconciliationAction['action'][]): ReconciliationNext {
  if (actions.includes('request-user-decision')) return 'await-user';
  if (actions.includes('repair')) return 'correct';
  return actions.includes('leave') ? 'unresolved' : 'complete';
}

/**
 * Validates one reconciliation submission: the strict schema, then every
 * rule the schema cannot hold. Each named CheckFinding belongs to the work
 * item; every one of the attention set that needs a disposition has
 * exactly one; a correction is planned only within the round's floor, a
 * signal is left open only below it, and a waiver only over the work item's
 * own module; the next action agrees with the dispositions; each cited
 * conflict's text is in the document it names; and the child accepts the
 * whole assessment against the state as it stands.
 */
export async function validateReconciliation(input: unknown, context: ReconciliationContext): Promise<SubmissionValidation<BoundReconciliation>> {
  const parsed = reconciliationSubmissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: schemaErrors(parsed.error) };
  const submission = parsed.data;
  const errors: SubmissionError[] = [];

  submission.relations.forEach((relation, index) => {
    for (const side of ['from', 'to'] as const) {
      if (!context.held.has(relation[side])) {
        errors.push({ path: `relations.${index}.${side}`, message: `${relation[side]} is not a CheckFinding of ${context.workItem}`, expected: `one of ${[...context.held.keys()].join(', ') || 'none'}` });
      }
    }
  });

  const floorText = context.floor === 'any' ? 'any signal' : context.floor === 'none' ? 'no signal: this is the last round' : `a signal of at least ${context.laterRoundMinimumRisk} risk`;
  const disposed = new Map<CheckFindingId, number>();
  submission.dispositions.forEach((disposition, index) => {
    const where = `dispositions.${index}`;
    const entry = context.attention.get(disposition.checkFinding);
    if (entry === undefined) {
      errors.push({ path: `${where}.checkFinding`, message: `${disposition.checkFinding} is not in this reconciliation's attention set`, expected: `one of ${[...context.attention.keys()].join(', ')}` });
    } else if (!needsDisposition(entry)) {
      errors.push({ path: `${where}.checkFinding`, message: `${disposition.checkFinding} waits for ${entry.awaiting === 'user-decision' ? 'a user\'s answer' : 'a check to run again'}; it is not this assessment's to decide`, expected: 'no disposition for it' });
    } else {
      const risk = disposition.risk ?? entry.risk;
      const correctable = withinFloor(context.floor, risk, context.laterRoundMinimumRisk);
      if (disposition.action.action === 'repair' && !correctable) {
        errors.push({ path: `${where}.action`, message: `correction-floor: ${disposition.checkFinding} is of ${risk} risk, and this round may plan a correction for ${floorText}`, expected: 'another disposition, or leave it open' });
      }
      if (disposition.action.action === 'leave' && correctable) {
        errors.push({ path: `${where}.action`, message: `${disposition.checkFinding} can be corrected in this round (${risk} risk, floor ${context.floor}); only a signal below the floor is left open`, expected: 'repair, fixed, supersede, waive, defer or request-user-decision' });
      }
      if (disposition.action.action === 'waive' && !withinModule(context.module, entry.modules)) {
        errors.push({ path: `${where}.action`, message: `insufficient-authority: ${disposition.checkFinding} concerns ${entry.modules.join(', ')}, and this architect may waive only within ${context.module}`, expected: 'another disposition for a signal outside your module' });
      }
    }
    if (disposition.action.action === 'leave' && disposition.risk !== undefined) {
      errors.push({ path: `${where}.risk`, message: 'A risk correction is recorded with a decision, and leaving a signal open records none', expected: 'no risk with leave' });
    }
    const earlier = disposed.get(disposition.checkFinding);
    if (earlier !== undefined) errors.push({ path: `${where}.checkFinding`, message: `${disposition.checkFinding} already has the disposition at dispositions.${earlier}`, expected: 'one disposition per CheckFinding' });
    else disposed.set(disposition.checkFinding, index);
  });
  for (const [id, entry] of context.attention) {
    if (needsDisposition(entry) && !disposed.has(id)) {
      errors.push({ path: 'dispositions', message: `${id} is in the attention set and has no disposition`, expected: `a disposition for ${id}` });
    }
  }

  const expected = nextOf(submission.dispositions.map(disposition => disposition.action.action));
  if (submission.next.kind !== expected) {
    errors.push({
      path: 'next.kind',
      message: expected === 'await-user'
        ? 'A disposition requests a user decision, so the work item waits for the answer'
        : expected === 'correct'
          ? 'A disposition plans a repair, so the work item needs a correction iteration'
          : expected === 'unresolved'
            ? 'A signal is left open, so the work item goes to its gate with it unresolved'
            : 'Every signal is settled or waits for someone else, so the work item goes to its gate',
      expected: `"${expected}"`,
    });
  }

  const conflicts: BoundReconciliation['conflicts'] = [];
  for (const [index, disposition] of submission.dispositions.entries()) {
    if (disposition.action.action !== 'request-user-decision') continue;
    const bound: CheckFindingConflict[] = [];
    for (const [position, conflict] of disposition.action.conflicts.entries()) {
      const document = await context.document(conflict.document);
      const where = `dispositions.${index}.action.conflicts.${position}`;
      if (document === null) {
        errors.push({ path: `${where}.document`, message: `"${conflict.document}" is neither the plan nor a file of the source this reconciliation assesses`, expected: '"plan" or a path of the source' });
      } else if (!document.text.includes(conflict.text)) {
        errors.push({ path: `${where}.text`, message: `The text is not in "${conflict.document}" as it stands at ${document.revision}; cite the conflicting text exactly`, expected: 'text copied verbatim from the document' });
      } else {
        bound.push({ text: conflict.text, document: conflict.document, revision: document.revision });
      }
    }
    conflicts.push({ checkFinding: disposition.checkFinding, conflicts: bound });
  }
  if (errors.length > 0) return { ok: false, errors };

  const commands = bindCommands(submission, context, conflicts);
  if (commands.length > 0) {
    const rejection = context.decide({ type: 'assess', commands });
    if (rejection !== null) {
      const index = rejection.index ?? 0;
      const relations = submission.relations.length;
      const command = commands[index];
      const disposition = command?.type === 'dispose' ? submission.dispositions.findIndex(entry => entry.checkFinding === command.checkFinding) : -1;
      errors.push({
        path: index < relations ? `relations.${index}` : `dispositions.${disposition}`,
        message: `The CheckFinding rules refuse it (${rejection.code}): ${rejection.message}`,
      });
      return { ok: false, errors };
    }
  }
  return { ok: true, value: { submission, commands, conflicts } };
}

/** The child's commands for one submission, with every trusted field bound by the harness. A signal left open has none. */
function bindCommands(
  submission: ReconciliationSubmission,
  context: ReconciliationContext,
  conflicts: BoundReconciliation['conflicts'],
): Extract<CheckFindingCommand, { type: 'dispose' | 'relate' }>[] {
  const authority = { kind: 'work-item-assessment' as const, ref: context.id };
  const evidence = context.evidence(submission);
  const common = { actor: context.actor, source: context.source, evidence: [...evidence] };
  const relations = submission.relations.map(relation => ({
    type: 'relate' as const,
    relation: {
      ...common,
      from: { checkFinding: relation.from, revision: context.held.get(relation.from) ?? 1 },
      to: { checkFinding: relation.to, revision: context.held.get(relation.to) ?? 1 },
      relation: relation.relation,
      shared: relation.shared,
      evidence: [...evidence, ...relation.evidence.map(ref => ({ kind: 'citation', ref, hash: null }))],
      rationale: relation.rationale,
    },
  }));
  const dispositions = submission.dispositions.flatMap(disposition => {
    const action = disposition.action;
    const entry = context.attention.get(disposition.checkFinding);
    let decision: CheckFindingDecisionInput['decision'];
    switch (action.action) {
      case 'leave': return [];
      case 'repair': decision = { action: 'plan-repair', repair: { kind: 'intent', ref: context.id } }; break;
      case 'fixed': decision = { action: 'fix-by-assessment', reassessed: [...action.reassessed] }; break;
      case 'supersede': decision = { action: 'supersede', reassessed: [...action.reassessed], replacement: action.replacement }; break;
      case 'waive':
        decision = { action: 'waive', authority, acceptedRisk: action.acceptedRisk ?? disposition.risk ?? entry?.risk ?? 'medium', uncertainty: action.uncertainty };
        break;
      case 'defer':
        decision = { action: 'defer', authority, responsible: { kind: 'work-item', workItem: context.workItem }, revisit: { kind: 'condition', condition: action.revisit } };
        break;
      case 'request-user-decision':
        decision = {
          action: 'request-user-decision',
          authority,
          conflicts: [...(conflicts.find(bound => bound.checkFinding === disposition.checkFinding)?.conflicts ?? [])],
          options: action.options.map(option => ({ ...option })),
        };
        break;
    }
    return [{
      type: 'dispose' as const,
      checkFinding: disposition.checkFinding,
      expectedRevision: entry?.revision ?? 1,
      decision: {
        ...common,
        rationale: disposition.rationale,
        communication: disposition.communication,
        ...(disposition.risk === undefined ? {} : { risk: disposition.risk }),
        decision,
      },
    }];
  });
  return [...relations, ...dispositions];
}

/**
 * The brief appended to the local architect's session: what was decided,
 * by the durable IDs of the decisions and relations, what was left open,
 * the next action and the fork's own account. It is appended without a
 * model call.
 */
export function briefText(parts: {
  readonly id: string;
  readonly round: number;
  readonly source: ReconciliationSource;
  readonly submission: ReconciliationSubmission;
  readonly events: readonly CheckFindingEvent[];
}): string {
  const lines = [`Reconciliation ${parts.id} (round ${parts.round}) of the work item at ${parts.source.commit} decided:`];
  for (const event of parts.events) {
    if (event.type === 'check-finding-decided') lines.push(`- ${event.data.checkFinding}: ${event.data.decision.decision.action} (${event.data.decision.id})`);
    if (event.type === 'check-finding-related') {
      const relation = event.data.relation;
      lines.push(`- ${relation.from.checkFinding} ${relation.relation} ${relation.to.checkFinding} (${relation.id})`);
    }
  }
  const left = parts.submission.dispositions.filter(disposition => disposition.action.action === 'leave').map(disposition => disposition.checkFinding);
  if (left.length > 0) lines.push(`- left open, below this round's floor: ${left.join(', ')}`);
  const next = parts.submission.next;
  lines.push(next.kind === 'correct'
    ? `Next: a correction iteration. ${next.goal}`
    : next.kind === 'await-user' ? 'Next: the work item waits for a user decision.' : 'Next: the work item goes to its gate.');
  lines.push('', parts.submission.brief);
  return lines.join('\n');
}

/** The attention set as its `CheckFindingAt` list, in its attention order. */
export const attentionAt = (attention: ReadonlyMap<CheckFindingId, Pick<AttentionEntry, 'revision'>>): CheckFindingAt[] =>
  [...attention].map(([checkFinding, entry]) => ({ checkFinding, revision: entry.revision }));

/**
 * Why a captured basis no longer holds (appendix §6), or null when it
 * does: the audited source, every request settled by the attempt it names,
 * and every basis CheckFinding at its captured revision. A CheckFinding that
 * needs attention and is not in the basis is the caller's to weigh.
 */
export function basisChange(
  captured: { readonly source: ReconciliationSource; readonly requests: readonly BasisRequest[]; readonly checkFindings: readonly CheckFindingAt[] },
  current: {
    readonly source: ReconciliationSource;
    readonly requests: readonly BasisRequest[];
    readonly unsettled: readonly string[];
    readonly revisions: ReadonlyMap<CheckFindingId, number>;
  },
): string | null {
  if (captured.source.commit !== current.source.commit || captured.source.tree !== current.source.tree) {
    return `the audited source is ${current.source.commit}, not ${captured.source.commit}`;
  }
  if (current.unsettled.length > 0) return `${current.unsettled.join(', ')} ${current.unsettled.length === 1 ? 'is' : 'are'} not settled`;
  const requestKey = (request: BasisRequest) => `${request.request}:${request.attempt ?? '-'}:${request.result}`;
  const before = new Set(captured.requests.map(requestKey));
  const now = current.requests.map(requestKey);
  const changedRequests = now.filter(key => !before.has(key));
  if (changedRequests.length > 0 || now.length !== before.size) {
    return `the work item's settled review requests changed: ${changedRequests.join(', ') || `${before.size} captured, ${now.length} now`}`;
  }
  for (const entry of captured.checkFindings) {
    const revision = current.revisions.get(entry.checkFinding);
    if (revision !== entry.revision) return `${entry.checkFinding} is at revision ${revision ?? 'none'}, not ${entry.revision}`;
  }
  return null;
}
