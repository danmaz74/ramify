import { z } from 'zod';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { citationSchema, modulePathSchema } from '../interfaces/protocol/evidence.js';
import type { JsonSchema } from '../../subs/agent/src/interfaces/port.js';
import { validateAgainst, type SubmissionError, type SubmissionValidation } from '../run/submissions.js';
import { slugSchema, type Hypothesis, type RegistryEntry } from '../analysis/records.js';
import type { PlacementDecision } from '../architecture/records.js';
import {
  localDecisionErrors, localDecisionSchema, placementRequestBodySchema, placementRequestErrors,
  type PlacementEvidence,
} from '../architecture/submission.js';
import { assignmentBodySchema, assignmentErrors, type AssignmentBody } from './assignment.js';
import type { IntegrationScope } from './integration.js';
import { decompositionSchema } from './records.js';
import type { EngineerBounds } from '../run/policy.js';
import {
  incompleteRequestError, obligationSubmissionErrors, obligationSubmissionFields, outstandingReports, type ObligationContext,
} from './obligations.js';

/*
 * What a local architect submits at a coordination point. This iteration
 * offers it four members of the union:
 *
 * `assign` commits an outline revision and one `IterationAssignment`, and
 * licenses the engineer that works it. It carries no gate, no test selection
 * and no guarded hashes: the harness derives those from the kind, the scope
 * and the required evidence.
 *
 * `request-completion` commits a `WorkItemOutline` and runs the `work-item`
 * gate. Requesting completion with no iteration is a legitimate outcome: the
 * goal is already satisfied by existing behavior, which is verified reuse,
 * and the outline records why. A request that leaves an obligation this
 * architect is responsible for without a `done` report is rejected, naming
 * the IDs, like any other invalid submission.
 *
 * `request-placement` asks the global architect where a capability belongs,
 * when the choice is not the local architect's to make. It records the
 * request and nothing else; the answer comes back at the next turn of this
 * same session.
 *
 * `assign` with kind `contract` and `revisesContract` is the direct
 * revision of an agreement this work item consumes. The harness supplies the
 * revision number, the scope and the gate, and the existing agreement stays
 * in force until the revision passes that gate.
 *
 * `yield-for-providers` is how a consumer stops at an iteration boundary
 * once it has done what it can against its fakes. It names the requirements
 * it waits for; the harness runs their provider work items before the next
 * independent entry work item and returns this item when they have
 * conformed.
 *
 * `unresolved` names the conflict and its evidence rather than weakening the
 * request. The global architect answers it with a placement fix, a plan
 * deviation the work item goes on under, or nothing possible, which ends
 * the run.
 *
 * `assign`, `request-placement`, `request-completion` and `unresolved` may
 * each carry `registrations` and `reports`: a required test this architect
 * chooses to track independently, and its judgment that an obligation it
 * is responsible for is correctly implemented and passing. They apply when
 * the submission is accepted, before its action, and an engineer's report
 * never supplies them.
 *
 * The fields the harness already knows are absent: the work item, the
 * revision, the invocation and the hypothesis revisions it delivered are the
 * harness's, and no schema has a field for an ID it assigned.
 */

const text = z.string().min(1);

/** A `WorkItemOutline` without the fields the harness assigns. */
export const outlineBodySchema = z.object({
  /** The analysis, concise. */
  changes: text,
  decomposition: decompositionSchema,
  reuse: z.array(z.object({ capability: slugSchema, owner: modulePathSchema, role: text }).strict()),
  breakingChanges: z.array(z.object({
    guarantee: text,
    reason: text,
    affectedConsumers: z.array(modulePathSchema),
    citations: z.array(citationSchema),
  }).strict()),
  stages: z.array(z.object({
    title: text,
    approach: z.enum(['non-breaking', 'breaking']),
    dependsOn: z.array(z.int().nonnegative()),
    note: z.string(),
  }).strict()),
  /** Why this revision differs from the last; empty on the first. */
  revisionReason: z.string(),
}).strict();
export type OutlineBody = z.infer<typeof outlineBodySchema>;

export const localArchitectSubmissionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('assign'),
    /** A new outline revision, where this assignment revises the plan for the work item. */
    outline: outlineBodySchema.optional(),
    /** Placement this architect decided within its own authority, with what it registers. */
    localDecisions: z.array(localDecisionSchema),
    assignment: assignmentBodySchema,
    ...obligationSubmissionFields,
  }).strict(),
  z.object({
    kind: z.literal('request-placement'),
    request: placementRequestBodySchema,
    ...obligationSubmissionFields,
  }).strict(),
  z.object({
    kind: z.literal('request-completion'),
    summary: text,
    outline: outlineBodySchema,
    ...obligationSubmissionFields,
  }).strict(),
  z.object({
    kind: z.literal('yield-for-providers'),
    /** The open requirements of this work item this yield waits for. */
    requirements: z.array(text).min(1),
    summary: text,
  }).strict(),
  z.object({
    kind: z.literal('unresolved'),
    conflict: text,
    evidence: z.array(text),
    ...obligationSubmissionFields,
  }).strict(),
]);
export type LocalArchitectSubmission = z.infer<typeof localArchitectSubmissionSchema>;
/** A submission as an agent writes it, before the defaults apply. */
export type LocalArchitectSubmissionInput = z.input<typeof localArchitectSubmissionSchema>;

/** The members this iteration's package offers the role. */
export const localArchitectSubmissionKinds = ['assign', 'request-placement', 'request-completion', 'yield-for-providers', 'unresolved'] as const;

/** The schema the agent's tool is given, taken from the same definition that validates. */
export const localArchitectJsonSchema = z.toJSONSchema(localArchitectSubmissionSchema) as JsonSchema;
/** New-run tool surface excludes the historical provider-yield action. */
export const capabilityLocalArchitectJsonSchema = z.toJSONSchema(z.discriminatedUnion('kind', [
  localArchitectSubmissionSchema.options[0]!, localArchitectSubmissionSchema.options[1]!,
  localArchitectSubmissionSchema.options[2]!, localArchitectSubmissionSchema.options[4]!,
])) as JsonSchema;

export const localArchitectToolName = 'submit_work_item_result';

/** What the rules beyond the schema are checked against. */
export interface WorkEvidence {
  /** The refreshed architect view, or null where the run has none. */
  readonly index: ArchitectIndex | null;
  /** The registry as committed so far, by capability. */
  readonly registry: ReadonlyMap<string, RegistryEntry>;
  /** The outline last committed for this work item, which a submission of its own replaces. */
  readonly outline?: Pick<OutlineBody, 'decomposition' | 'stages' | 'breakingChanges'> | null | undefined;
  /** Every hypothesis at its highest committed revision; empty where the run has none. */
  readonly hypotheses?: ReadonlyMap<string, Hypothesis> | undefined;
  /** Every decision committed so far, by its identifier. */
  readonly decisions?: ReadonlyMap<string, PlacementDecision> | undefined;
  /** The work items committed so far. */
  readonly workItems?: ReadonlySet<string> | undefined;
  /** The requirements of this work item that no `requirement-verified` has closed. */
  readonly openRequirements?: ReadonlySet<string> | undefined;
  /** The agreements this work item consumes, which are the ones it may revise. */
  readonly contracts?: ReadonlySet<string> | undefined;
  /** The guarded paths of this project, which are the only ones an authorization can name. */
  readonly guardedPaths?: ReadonlySet<string> | undefined;
  /** The files only the harness writes: its configuration for the project and the tracked feature files. */
  readonly harnessOnly?: ReadonlySet<string> | undefined;
  /** For an integration work item: the scope its engineer must be given. */
  readonly integration?: IntegrationScope | undefined;
  /** The policy's engineer bounds and their ceilings, which an assignment's `bounds` is judged against. */
  readonly bounds?: { readonly defaults: EngineerBounds; readonly ceilings: EngineerBounds } | undefined;
  /** The element IDs of the work item's current package, which an assignment's `citedElements` is judged against. */
  readonly package?: ReadonlySet<string> | undefined;
  /** This work item's architect and the run's obligations, which registrations and reports are judged against. */
  readonly obligations?: ObligationContext | undefined;
}

/** The same evidence, as the placement rules read it. */
function placementEvidence(evidence: WorkEvidence): PlacementEvidence {
  return {
    index: evidence.index,
    registry: evidence.registry,
    hypotheses: evidence.hypotheses ?? new Map(),
    decisions: evidence.decisions ?? new Map(),
    workItems: evidence.workItems ?? new Set(),
  };
}

/**
 * Validates one local architect submission: the strict schema, then the
 * rules the schema cannot hold. Nothing changes on a failure, and every
 * error names its path.
 */
export function validateLocalArchitect(input: unknown, evidence: WorkEvidence): SubmissionValidation<LocalArchitectSubmission> {
  const shape = validateAgainst(localArchitectSubmissionSchema, input);
  if (!shape.ok) return shape;
  const checked = validateKind(shape.value, evidence);
  const reporting = shape.value.kind === 'yield-for-providers' ? [] : obligationErrors(shape.value, evidence);
  const outstanding = reporting.length === 0 ? unreportedBy(shape.value, evidence.obligations) : [];
  const incomplete = outstanding.length === 0 ? [] : [incompleteRequestError(outstanding, 'completion')];
  if (reporting.length === 0 && incomplete.length === 0) return checked;
  return { ok: false, errors: [...(checked.ok ? [] : checked.errors), ...reporting, ...incomplete] };
}

/**
 * The registered IDs a completion request would leave without a `done`
 * report, once its own reports apply; none for any other input, for one
 * whose reports are themselves invalid, or where the turn has no obligation
 * context. The rejection and the exhausted turn's failure both name these.
 */
export function unreportedByCompletion(input: unknown, obligations: ObligationContext | undefined): string[] {
  const shape = localArchitectSubmissionSchema.safeParse(input);
  if (!shape.success || shape.data.kind === 'yield-for-providers') return [];
  if (obligations === undefined || obligationSubmissionErrors(shape.data, obligations).length > 0) return [];
  return unreportedBy(shape.data, obligations);
}

function unreportedBy(value: LocalArchitectSubmission, obligations: ObligationContext | undefined): string[] {
  return value.kind === 'request-completion' && obligations !== undefined ? outstandingReports(value, obligations) : [];
}

/**
 * Registrations and reports are judged against the run's obligations and
 * this work item's authority. Without that context nothing may be named:
 * an unknown context never licenses a report.
 */
function obligationErrors(
  value: Exclude<LocalArchitectSubmission, { kind: 'yield-for-providers' }>, evidence: WorkEvidence,
): SubmissionError[] {
  if (value.registrations.length === 0 && value.reports.length === 0) return [];
  if (evidence.obligations === undefined) {
    return [{ path: 'reports', message: 'This turn has no obligation context, so it registers and reports nothing', expected: 'empty registrations and reports' }];
  }
  return obligationSubmissionErrors(value, evidence.obligations);
}

function validateKind(value: LocalArchitectSubmission, evidence: WorkEvidence): SubmissionValidation<LocalArchitectSubmission> {
  const shape = { ok: true as const, value };
  if (shape.value.kind === 'unresolved') return shape;
  if (shape.value.kind === 'request-placement') {
    const errors = placementRequestErrors(shape.value.request, placementEvidence(evidence), 'request');
    return errors.length === 0 ? shape : { ok: false, errors };
  }
  if (shape.value.kind === 'request-completion') {
    const errors = outlineErrors(shape.value.outline, evidence);
    return errors.length === 0 ? shape : { ok: false, errors };
  }
  if (shape.value.kind === 'yield-for-providers') {
    const open = evidence.openRequirements ?? new Set<string>();
    const errors: SubmissionError[] = [];
    shape.value.requirements.forEach((requirement, index) => {
      if (open.has(requirement)) return;
      errors.push({
        path: `requirements.${index}`,
        message: open.size === 0
          ? `This work item has no open requirement, so there is nothing to wait for; "${requirement}" is not one`
          : `"${requirement}" is not an open requirement of this work item`,
        expected: open.size === 0 ? 'no yield' : `one of ${[...open].join(', ')}`,
      });
    });
    return errors.length === 0 ? shape : { ok: false, errors };
  }
  const outline = shape.value.outline;
  const errors = [
    ...(outline === undefined && evidence.outline == null ? [{
      path: 'outline',
      message: 'The first assignment needs an outline; there is no committed outline to reuse',
      expected: 'an outline for this work item',
    }] : []),
    ...(outline === undefined ? [] : outlineErrors(outline, evidence)),
    ...localDecisionErrors(shape.value.localDecisions, placementEvidence(evidence), 'localDecisions'),
    ...assignmentErrors(shape.value.assignment, {
      index: evidence.index,
      registry: evidence.registry,
      outline: outline ?? evidence.outline ?? null,
      revising: outline !== undefined,
      ...(evidence.contracts === undefined ? {} : { contracts: evidence.contracts }),
      ...(evidence.guardedPaths === undefined ? {} : { guardedPaths: evidence.guardedPaths }),
      ...(evidence.harnessOnly === undefined ? {} : { harnessOnly: evidence.harnessOnly }),
      ...(evidence.integration === undefined ? {} : { integration: evidence.integration }),
      ...(evidence.obligations === undefined ? {} : { obligations: { ...evidence.obligations, registrations: shape.value.registrations } }),
      ...(evidence.bounds === undefined ? {} : { bounds: evidence.bounds }),
      ...(evidence.package === undefined ? {} : { package: evidence.package }),
    }),
  ];
  return errors.length === 0 ? shape : { ok: false, errors };
}

/** The assignment one accepted `assign` submission carries. */
export type { AssignmentBody };

function outlineErrors(outline: OutlineBody, evidence: WorkEvidence): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const known = (module: string, path: string) => {
    if (evidence.index === null || evidence.index.modules.has(module)) return;
    errors.push({ path, message: `No module "${module}" is in the architect view`, expected: 'a module of the architect view' });
  };

  outline.reuse.forEach((entry, index) => {
    known(entry.owner, `outline.reuse.${index}.owner`);
    const registered = evidence.registry.get(entry.capability);
    if (registered !== undefined && registered.owner !== entry.owner) {
      errors.push({
        path: `outline.reuse.${index}.owner`,
        message: `The registry places "${entry.capability}" with "${registered.owner}", not "${entry.owner}"`,
        expected: registered.owner,
      });
    }
  });

  outline.breakingChanges.forEach((change, index) => {
    change.affectedConsumers.forEach((consumer, position) => known(consumer, `outline.breakingChanges.${index}.affectedConsumers.${position}`));
    change.citations.forEach((citation, position) => known(citation.module, `outline.breakingChanges.${index}.citations.${position}.module`));
  });

  outline.stages.forEach((stage, index) => {
    stage.dependsOn.forEach((depends, position) => {
      if (depends < index) return;
      errors.push({
        path: `outline.stages.${index}.dependsOn.${position}`,
        message: `Stage ${index} cannot depend on stage ${depends}; a stage depends only on an earlier one`,
        expected: `a stage index below ${index}`,
      });
    });
  });

  if (outline.decomposition.kind === 'staged' && outline.stages.length < 2) {
    errors.push({
      path: 'outline.stages',
      message: 'A staged decomposition names at least two stages; with one or none the decomposition is a single iteration',
      expected: 'at least two stages',
    });
  }
  if (outline.decomposition.kind === 'single-iteration' && outline.stages.length > 1) {
    errors.push({
      path: 'outline.decomposition.kind',
      message: `A single-iteration decomposition names at most one stage, and this outline names ${outline.stages.length}`,
      expected: '"staged"',
    });
  }
  return errors;
}
