import { z } from 'zod';
import { assessmentCoverage, assessmentResultSchema, assessmentSchema, type Assessment, type Candidate } from '../../subs/nonfunctional/src/interfaces/contracts.js';
import type { RoundDecision } from '../../subs/nonfunctional/src/rounds.js';
import type { Catalog } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { modulePathSchema } from '../interfaces/protocol/evidence.js';
import { validateAgainst, type SubmissionError, type SubmissionValidation } from '../run/submissions.js';

const text = z.string().min(1);
const nfrId = z.string().regex(/^nfr-\d{3,}$/);

/** The agent supplies judgments; the harness assigns every identity and provenance field. */
export const coordinatorAssessmentSubmissionSchema = z.object({
  kind: z.literal('assessment'),
  results: z.array(assessmentResultSchema),
}).strict();
export type CoordinatorAssessmentSubmission = z.infer<typeof coordinatorAssessmentSubmissionSchema>;
export const coordinatorAssessmentJsonSchema = z.toJSONSchema(coordinatorAssessmentSubmissionSchema);

export interface AssessmentBinding {
  readonly catalog: Catalog;
  readonly candidate: Candidate;
  /** A fresh preview after the coordinator invocation, before record commit. */
  readonly observedTree: string;
  readonly id: string;
  readonly round: number;
  readonly phase: Assessment['phase'];
  readonly coordinatorInvocation: string;
}

function catalogNfrs(catalog: Catalog): string[] {
  return catalog.items.filter(item => item.classification === 'non-functional-requirement').map(item => item.id);
}

/** Validate complete coverage and bind it to a freshly observed prepared tree. */
export function bindCoordinatorAssessment(input: unknown, binding: AssessmentBinding): SubmissionValidation<Assessment> {
  const shape = validateAgainst(coordinatorAssessmentSubmissionSchema, input);
  if (!shape.ok) return shape;
  const errors: SubmissionError[] = [];
  if (binding.observedTree !== binding.candidate.tree) {
    errors.push({ path: 'candidate', message: 'Source changed after the candidate was prepared; assess a newly prepared tree' });
  }
  const record = assessmentSchema.safeParse({
    schema: 'ramify-agent.nonfunctional-assessment/1', id: binding.id, candidate: binding.candidate,
    round: binding.round, phase: binding.phase, coordinatorInvocation: binding.coordinatorInvocation,
    results: shape.value.results,
  });
  if (!record.success) {
    errors.push(...record.error.issues.map(issue => ({ path: issue.path.map(String).join('.') || '(root)', message: issue.message })));
  }
  if (record.success) {
    errors.push(...assessmentCoverage(record.data, catalogNfrs(binding.catalog)).map(message => ({ path: 'results', message })));
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: record.data! };
}

const nfrList = z.array(nfrId).min(1);
const deviationChoiceSchema = z.object({
  nfr: nfrId,
  proposedAlternative: text.nullable(),
  uncertainty: z.string(),
}).strict();

/** A separate post-assessment decision; no action changes the assessment result. */
export const coordinatorActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('investigate'), nfrs: nfrList, question: text, scope: z.array(text).min(1) }).strict(),
  z.object({ kind: z.literal('repair'), nfrs: nfrList, startingModule: modulePathSchema, task: text, evidence: z.array(text), uncertainty: z.string() }).strict(),
  z.object({ kind: z.literal('close'), deviations: z.array(deviationChoiceSchema).min(1) }).strict(),
]);
export type CoordinatorAction = z.infer<typeof coordinatorActionSchema>;
export const coordinatorActionJsonSchema = z.toJSONSchema(coordinatorActionSchema);

export interface ActionContext {
  readonly decision: RoundDecision;
  readonly results: Assessment['results'];
  /** NFRs covered by committed investigation results in this round. */
  readonly investigatedNfrs: readonly string[];
  readonly moduleNames: readonly string[];
}

/** Check one action against the current committed round, without deciding semantic satisfaction. */
export function validateCoordinatorAction(input: unknown, context: ActionContext): SubmissionValidation<CoordinatorAction> {
  const shape = validateAgainst(coordinatorActionSchema, input);
  if (!shape.ok) return shape;
  const value = shape.value;
  const errors: SubmissionError[] = [];
  const unresolved = new Set(context.results.filter(item => item.result !== 'satisfied').map(item => item.nfr));
  const undetermined = new Set(context.results.filter(item => item.result === 'undetermined').map(item => item.nfr));
  const covered = new Set(context.investigatedNfrs);
  if (value.kind === 'investigate') {
    if (context.decision.action !== 'investigate' && context.decision.action !== 'repair-or-close') {
      errors.push({ path: 'kind', message: `Investigation is not permitted while the next step is ${context.decision.action}` });
    }
    value.nfrs.forEach((nfr, index) => {
      if (!unresolved.has(nfr)) errors.push({ path: `nfrs.${index}`, message: `${nfr} is not unresolved in this assessment` });
    });
    if (context.decision.action === 'investigate'
      && !value.nfrs.some(nfr => undetermined.has(nfr) && !covered.has(nfr))) {
      errors.push({ path: 'nfrs', message: 'The required investigation must cover an undetermined NFR without committed investigation evidence' });
    }
  } else if (value.kind === 'repair') {
    if (context.decision.action !== 'repair-or-close') {
      errors.push({ path: 'kind', message: `Repair is not permitted while the next step is ${context.decision.action}` });
    }
    if (!context.moduleNames.includes(value.startingModule)) {
      errors.push({ path: 'startingModule', message: 'The starting module is not in the current architect view' });
    }
    value.nfrs.forEach((nfr, index) => {
      if (!unresolved.has(nfr)) errors.push({ path: `nfrs.${index}`, message: `${nfr} is not unresolved in this assessment` });
      if (undetermined.has(nfr) && !covered.has(nfr)) {
        errors.push({ path: `nfrs.${index}`, message: `${nfr} needs a committed investigation before repair` });
      }
    });
  } else {
    if (context.decision.action !== 'repair-or-close') {
      errors.push({ path: 'kind', message: `Closing unresolved work is not permitted while the next step is ${context.decision.action}` });
    }
    const submitted = new Set(value.deviations.map(item => item.nfr));
    if (submitted.size !== value.deviations.length) errors.push({ path: 'deviations', message: 'Each unresolved NFR needs one distinct disposition' });
    for (const nfr of unresolved) if (!submitted.has(nfr)) errors.push({ path: 'deviations', message: `missing ${nfr}` });
    for (const nfr of submitted) if (!unresolved.has(nfr)) errors.push({ path: 'deviations', message: `unknown ${nfr}` });
    value.deviations.forEach((item, index) => {
      if (item.proposedAlternative === null && item.uncertainty.trim() === '') {
        errors.push({ path: `deviations.${index}.uncertainty`, message: 'State uncertainty when no alternative can be proposed' });
      }
    });
  }
  const ids = value.kind === 'close' ? [] : value.nfrs;
  if (new Set(ids).size !== ids.length) errors.push({ path: 'nfrs', message: 'NFR IDs must be distinct' });
  return errors.length > 0 ? { ok: false, errors } : shape;
}

/** An investigation is a read-only coordinator child invocation, not a new role. */
export const coordinatorInvestigationSchema = z.object({
  kind: z.literal('investigation-result'),
  findings: z.array(z.object({ nfr: nfrId, inspectedScope: z.array(text).min(1), evidence: z.array(text), uncertainty: z.string() }).strict()).min(1),
  summary: text,
}).strict();
export type CoordinatorInvestigation = z.infer<typeof coordinatorInvestigationSchema>;
export const coordinatorInvestigationJsonSchema = z.toJSONSchema(coordinatorInvestigationSchema);

export function validateCoordinatorInvestigation(input: unknown, targetNfrs: readonly string[]): SubmissionValidation<CoordinatorInvestigation> {
  const shape = validateAgainst(coordinatorInvestigationSchema, input);
  if (!shape.ok) return shape;
  const actual = shape.value.findings.map(item => item.nfr);
  const expected = new Set(targetNfrs);
  const errors: SubmissionError[] = [];
  if (new Set(actual).size !== actual.length) errors.push({ path: 'findings', message: 'Each target NFR needs one distinct finding' });
  for (const nfr of targetNfrs) if (!actual.includes(nfr)) errors.push({ path: 'findings', message: `missing ${nfr}` });
  for (const nfr of actual) if (!expected.has(nfr)) errors.push({ path: 'findings', message: `unknown ${nfr}` });
  return errors.length > 0 ? { ok: false, errors } : shape;
}

/** A repair child reports work done; only a new assessment can judge the NFRs. */
export const nonfunctionalRepairSubmissionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('completed'), summary: text, evidence: z.array(text), remaining: z.array(z.string()).max(0) }).strict(),
  z.object({ kind: z.literal('partial'), summary: text, evidence: z.array(text), remaining: z.array(text).min(1) }).strict(),
]);
export type NonfunctionalRepairSubmission = z.infer<typeof nonfunctionalRepairSubmissionSchema>;
export const nonfunctionalRepairJsonSchema = z.toJSONSchema(nonfunctionalRepairSubmissionSchema);
