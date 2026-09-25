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
import { declarationErrors, type DeclarationContext } from './declarations.js';
import type { IntegrationScope } from './integration.js';
import { decompositionSchema } from './records.js';
import type { EngineerBounds } from '../run/policy.js';
import type { ContextSelection } from '../context-selection/contracts.js';

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
 * and the outline records why.
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
  }).strict(),
  z.object({
    kind: z.literal('request-placement'),
    request: placementRequestBodySchema,
  }).strict(),
  z.object({
    kind: z.literal('request-completion'),
    summary: text,
    outline: outlineBodySchema,
    /**
     * Scenarios of this work item's entry that existing step definitions
     * already bind, declared with the request. They apply before the request
     * is judged, and the work-item gate verifies them.
     */
    scenarios: z.array(text).default([]),
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
  }).strict(),
]);
export type LocalArchitectSubmission = z.infer<typeof localArchitectSubmissionSchema>;

/** The members this iteration's package offers the role. */
export const localArchitectSubmissionKinds = ['assign', 'request-placement', 'request-completion', 'yield-for-providers', 'unresolved'] as const;

/** The schema the agent's tool is given, taken from the same definition that validates. */
export const localArchitectJsonSchema = z.toJSONSchema(localArchitectSubmissionSchema) as JsonSchema;

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
  /** The work item's entry and the run's tracked scenarios, which a declaration's IDs are judged against. */
  readonly scenarios?: DeclarationContext | undefined;
  /** For an integration work item: the scope its engineer must be given. */
  readonly integration?: IntegrationScope | undefined;
  /** The policy's engineer bounds and their ceilings, which an assignment's `bounds` is judged against. */
  readonly bounds?: { readonly defaults: EngineerBounds; readonly ceilings: EngineerBounds } | undefined;
  /** Verified source selection for this work item on a new captured run. */
  readonly selection?: ContextSelection | undefined;
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
  if (shape.value.kind === 'unresolved') return shape;
  if (shape.value.kind === 'request-placement') {
    const errors = placementRequestErrors(shape.value.request, placementEvidence(evidence), 'request');
    return errors.length === 0 ? shape : { ok: false, errors };
  }
  if (shape.value.kind === 'request-completion') {
    const errors = [
      ...outlineErrors(shape.value.outline, evidence),
      ...declarationErrors(shape.value.scenarios, evidence.scenarios ?? { entry: null, records: [] }),
    ];
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
      ...(evidence.scenarios === undefined ? {} : { scenarios: evidence.scenarios }),
      ...(evidence.bounds === undefined ? {} : { bounds: evidence.bounds }),
      ...(evidence.selection === undefined ? {} : { selection: evidence.selection }),
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
