import { z } from 'zod';
import { findModule, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import { citationSchema, modulePathSchema } from '../interfaces/protocol/evidence.js';
import type { JsonSchema } from '../../subs/agent/src/interfaces/port.js';
import { validateAgainst, type SubmissionError, type SubmissionValidation } from '../run/submissions.js';
import { hypothesisChangeSchema, slugSchema, type Hypothesis, type RegistryEntry } from '../analysis/records.js';
import { moduleProposalSchema, type ModuleProposal } from '../run/records.js';
import { hypothesisStanceSchema, placementOutcomeSchema, type PlacementDecision } from './records.js';
import { deviationBodySchema, type DeviationBody } from '../deviations/records.js';

/*
 * What one fork of the global architect submits, what a local architect
 * submits when it decides within its own authority, and what a local
 * architect asks the global architect when it cannot.
 *
 * The three carry the same decision body, because a placement decision is
 * one thing whoever makes it; the authority, the request and the identifiers
 * are the harness's and are absent from every schema here.
 *
 * `decision` commits the decision, the registry entries it creates and the
 * hypothesis revisions it makes, in one transition. `partial` records
 * findings and gaps: it is never appended to the parent context and is never
 * a decision.
 *
 * A fork of an unresolved request, which a local architect's `unresolved`
 * answer makes, may also answer `deviation`, which records a plan deviation
 * and lets the work item go on, or `nothing-possible`, which ends the run.
 * A placement request is never answered with either.
 */

const text = z.string().min(1);

/** A `PlacementDecision` without the fields the harness assigns. */
export const decisionBodySchema = z.object({
  question: text,
  outcome: placementOutcomeSchema,
  capability: slugSchema,
  /**
   * Whether implementing this capability changes symbols that already have
   * consumers. An extension of existing behavior is a `create` whose owner
   * is an existing module and whose flag is true; a capability whose owner
   * does not exist yet has no such symbols.
   */
  changesExistingSymbols: z.boolean(),
  /** Null only for `external`, which no module owns. */
  owner: modulePathSchema.nullable(),
  /** Required for an owner the refreshed view does not have yet, and only for `create` or `extract`. */
  proposed: moduleProposalSchema.optional(),
  rationale: text,
  constraints: z.array(text),
  uncertainties: z.array(text),
  evidence: z.object({
    citations: z.array(citationSchema),
    /** What the evidence could not establish. An empty search is not an absence. */
    gaps: z.array(text),
  }).strict(),
  /** The earlier decision this one replaces, required wherever it places an owner differently. */
  revises: z.object({
    decision: text,
    affected: z.array(z.object({
      workItem: text.optional(),
      contract: text.optional(),
      consequence: text,
    }).strict()),
  }).strict().optional(),
}).strict();
export type DecisionBody = z.infer<typeof decisionBodySchema>;

/** A `RegistryEntry` revision without the fields the harness assigns. */
export const registryChangeSchema = z.object({
  capability: slugSchema,
  behavior: text,
  owner: modulePathSchema,
  proposed: moduleProposalSchema.optional(),
  /** Confirmed consumer-to-dependency links this revision adds. */
  consumers: z.array(z.object({ capability: slugSchema, workItem: text }).strict()),
}).strict();
export type RegistryChange = z.infer<typeof registryChangeSchema>;

/**
 * One hypothesis revision a decision makes. The fields left out keep the
 * values of the revision it revises: a revision states what changed, and
 * revision 1 is never rewritten.
 */
export const hypothesisRevisionSchema = z.object({
  hypothesis: slugSchema,
  standing: z.enum(['tentative', 'confirmed', 'superseded']),
  /** Why this revision was made, which the revision's cause records. */
  reason: text,
  change: hypothesisChangeSchema.optional(),
  changesExistingSymbols: z.boolean().optional(),
  suggestedOwner: modulePathSchema.optional(),
  anticipatedConsumers: z.array(text).optional(),
  involvedModules: z.array(modulePathSchema).optional(),
  dependsOn: z.array(slugSchema).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  rationale: text.optional(),
  assumptions: z.array(z.string()).optional(),
  uncertainties: z.array(z.string()).optional(),
  citations: z.array(citationSchema).optional(),
  supersededBy: slugSchema.optional(),
}).strict();
export type HypothesisRevision = z.infer<typeof hypothesisRevisionSchema>;

/** One decision a local architect makes within its own authority, with what it registers. */
export const localDecisionSchema = z.object({
  decision: decisionBodySchema,
  registry: z.array(registryChangeSchema),
}).strict();
export type LocalDecisionBody = z.infer<typeof localDecisionSchema>;

/** A `PlacementRequest` without the fields the harness assigns. */
export const placementRequestBodySchema = z.object({
  forCapability: slugSchema,
  question: text,
  requiredBehavior: text,
  findings: z.array(z.object({ text, citations: z.array(citationSchema) }).strict()),
  candidates: z.array(z.object({
    capability: slugSchema.optional(),
    owner: modulePathSchema.optional(),
    note: text,
  }).strict()),
  unresolved: z.array(text),
  /** The hypotheses being tested; the harness supplies each one's revision and hash. */
  hypotheses: z.array(z.object({
    hypothesis: slugSchema,
    stance: hypothesisStanceSchema,
    evidence: text,
  }).strict()),
  /** This work item's own local decisions the request rests on. */
  localDecisions: z.array(text),
}).strict();
export type PlacementRequestBody = z.infer<typeof placementRequestBodySchema>;

export const forkSubmissionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('decision'),
    decision: decisionBodySchema,
    registry: z.array(registryChangeSchema),
    hypothesisRevisions: z.array(hypothesisRevisionSchema),
    /** The concise brief appended to the parent context, without a model call. */
    brief: text,
  }).strict(),
  z.object({
    kind: z.literal('partial'),
    findings: z.array(text),
    gaps: z.array(text),
  }).strict(),
  z.object({
    kind: z.literal('deviation'),
    deviation: deviationBodySchema,
  }).strict(),
  z.object({
    kind: z.literal('nothing-possible'),
    /** Why no deviation leaves anything of the plan worth doing. */
    reason: text,
    evidence: z.array(text),
  }).strict(),
]);
export type ForkSubmission = z.infer<typeof forkSubmissionSchema>;

/** The members this iteration's package offers the role. */
export const forkSubmissionKinds = ['decision', 'partial', 'deviation', 'nothing-possible'] as const;

/** The schema the agent's tool is given, taken from the same definition that validates. */
export const forkJsonSchema = z.toJSONSchema(forkSubmissionSchema) as JsonSchema;

export const forkToolName = 'submit_placement_decision';

/** What the rules beyond the schema are checked against. */
export interface PlacementEvidence {
  /** The refreshed architect view, or null where the run has none. */
  readonly index: ArchitectIndex | null;
  /** The registry as committed so far, by capability. */
  readonly registry: ReadonlyMap<string, RegistryEntry>;
  /** Every hypothesis at its highest committed revision. */
  readonly hypotheses: ReadonlyMap<string, Hypothesis>;
  /** Every decision committed so far, by its identifier. */
  readonly decisions: ReadonlyMap<string, PlacementDecision>;
  /** The work items committed so far. */
  readonly workItems: ReadonlySet<string>;
}

/**
 * What the fork answers. A placement request is answered with a decision or
 * a partial return; an unresolved request may also be answered with a
 * deviation, judged against the captured plan, the run's work items and its
 * tracked scenarios, or with `nothing-possible`.
 */
export type ForkQuestion =
  | { readonly kind: 'placement' }
  | {
    readonly kind: 'unresolved';
    /** The captured plan, whose lines a deviation cites. */
    readonly plan: string;
    readonly workItems: ReadonlySet<string>;
    /** Every tracked scenario with its state. */
    readonly scenarios: ReadonlyMap<string, string>;
  };

/**
 * Validates one fork submission: the strict schema, then the rules the
 * schema cannot hold. Nothing changes on a failure, and every error names
 * its path.
 */
export function validateFork(input: unknown, evidence: PlacementEvidence, question: ForkQuestion = { kind: 'placement' }): SubmissionValidation<ForkSubmission> {
  const shape = validateAgainst(forkSubmissionSchema, input);
  if (!shape.ok) return shape;
  if (shape.value.kind === 'partial') return shape;
  if (shape.value.kind === 'deviation' || shape.value.kind === 'nothing-possible') {
    if (question.kind === 'placement') {
      return {
        ok: false,
        errors: [{
          path: 'kind',
          message: `A placement request is answered with a decision or a partial return; "${shape.value.kind}" answers only an unresolved request`,
          expected: '"decision" or "partial"',
        }],
      };
    }
    if (shape.value.kind === 'nothing-possible') return shape;
    const errors = deviationErrors(shape.value.deviation, question, 'deviation');
    return errors.length === 0 ? shape : { ok: false, errors };
  }
  const errors = [
    ...decisionErrors(shape.value.decision, shape.value.registry, evidence, 'decision'),
    ...registryErrors(shape.value.registry, evidence, 'registry'),
    ...hypothesisRevisionErrors(shape.value.hypothesisRevisions, evidence, 'hypothesisRevisions'),
  ];
  return errors.length === 0 ? shape : { ok: false, errors };
}

/** Every rule a deviation must satisfy beyond its schema: its plan lines exist, its work items and scenarios too. */
function deviationErrors(body: DeviationBody, question: Extract<ForkQuestion, { kind: 'unresolved' }>, prefix: string): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const length = question.plan.split('\n').length;
  body.requirements.forEach((requirement, index) => {
    const [from, to] = requirement.lines;
    if (to < from || to > length) {
      errors.push({
        path: `${prefix}.requirements.${index}.lines`,
        message: `[${from}, ${to}] is not a range of the captured plan, which has ${length} lines`,
        expected: `1 ≤ from ≤ to ≤ ${length}`,
      });
    }
  });
  body.workItems.forEach((workItem, index) => {
    if (question.workItems.has(workItem)) return;
    errors.push({ path: `${prefix}.workItems.${index}`, message: `No work item "${workItem}" was committed by this run`, expected: 'a work item of this run' });
  });
  const seen = new Set<string>();
  body.scenarios.forEach((scenario, index) => {
    const state = question.scenarios.get(scenario.scenario);
    const path = `${prefix}.scenarios.${index}`;
    if (state === undefined) {
      errors.push({ path: `${path}.scenario`, message: `No tracked scenario "${scenario.scenario}"`, expected: 'a tracked scenario of this run' });
    } else if (state !== 'pending') {
      errors.push({
        path: `${path}.scenario`,
        message: `${scenario.scenario} is ${state}; a deviation rewords only a pending scenario, since no gate may have verified the text it replaces`,
        expected: 'a pending scenario',
      });
    }
    if (seen.has(scenario.scenario)) {
      errors.push({ path: `${path}.scenario`, message: `${scenario.scenario} is reworded twice; one entry states its new text`, expected: 'one entry per scenario' });
    }
    seen.add(scenario.scenario);
    const first = scenario.source.find(line => line.trim() !== '');
    if (first === undefined || !/^\s*Scenario( Outline)?:\s*\S/u.test(first)) {
      errors.push({
        path: `${path}.source.0`,
        message: 'A scenario\'s source starts with its `Scenario:` line and a name, without tags',
        expected: '"Scenario: <name>"',
      });
    }
  });
  return errors;
}

/** The same rules for a decision a local architect made within its own authority. */
export function localDecisionErrors(
  decisions: readonly LocalDecisionBody[],
  evidence: PlacementEvidence,
  prefix: string,
): SubmissionError[] {
  return decisions.flatMap((entry, index) => [
    ...decisionErrors(entry.decision, entry.registry, evidence, `${prefix}.${index}.decision`),
    ...registryErrors(entry.registry, evidence, `${prefix}.${index}.registry`),
  ]);
}

/** Every rule a placement request must satisfy beyond its schema. */
export function placementRequestErrors(
  body: PlacementRequestBody,
  evidence: PlacementEvidence,
  prefix: string,
): SubmissionError[] {
  const errors: SubmissionError[] = [];
  if (!evidence.registry.has(body.forCapability)) {
    errors.push({
      path: `${prefix}.forCapability`,
      message: `No capability "${body.forCapability}" is in the registry; a request is made for the capability being implemented`,
      expected: 'a registered capability',
    });
  }
  body.findings.forEach((finding, index) => {
    errors.push(...citationErrors(finding.citations, evidence, `${prefix}.findings.${index}.citations`));
  });
  body.candidates.forEach((candidate, index) => {
    if (candidate.capability !== undefined && !evidence.registry.has(candidate.capability)) {
      errors.push({
        path: `${prefix}.candidates.${index}.capability`,
        message: `No capability "${candidate.capability}" is in the registry; name the owner and the behavior instead of a slug nothing holds`,
        expected: 'a registered capability',
      });
    }
    if (candidate.owner !== undefined) errors.push(...moduleErrors(candidate.owner, evidence, `${prefix}.candidates.${index}.owner`));
  });
  body.hypotheses.forEach((entry, index) => {
    if (evidence.hypotheses.has(entry.hypothesis)) return;
    errors.push({
      path: `${prefix}.hypotheses.${index}.hypothesis`,
      message: `No hypothesis "${entry.hypothesis}" was committed by this run`,
      expected: 'a hypothesis of this run',
    });
  });
  body.localDecisions.forEach((id, index) => {
    const decision = evidence.decisions.get(id);
    if (decision !== undefined && decision.authority === 'local') return;
    errors.push({
      path: `${prefix}.localDecisions.${index}`,
      message: `No local decision "${id}" was committed by this run`,
      expected: 'a local decision of this run',
    });
  });
  return errors;
}

function decisionErrors(
  body: DecisionBody,
  registry: readonly RegistryChange[],
  evidence: PlacementEvidence,
  prefix: string,
): SubmissionError[] {
  const errors: SubmissionError[] = [];

  if (body.outcome === 'external') {
    if (body.owner !== null) {
      errors.push({
        path: `${prefix}.owner`,
        message: 'An external capability is satisfied outside this project, so no module owns it',
        expected: 'null',
      });
    }
    if (body.proposed !== undefined) {
      errors.push({
        path: `${prefix}.proposed`,
        message: 'An external capability proposes no module',
        expected: 'no proposal',
      });
    }
    if (registry.some(change => change.capability === body.capability)) {
      errors.push({
        path: `${prefix}.outcome`,
        message: `An external capability has no owner module, so "${body.capability}" is not registered with one`,
        expected: 'no registry entry for this capability',
      });
    }
  } else if (body.owner === null) {
    errors.push({
      path: `${prefix}.owner`,
      message: `A decision whose outcome is "${body.outcome}" names the module that owns the capability`,
      expected: 'a module of the view, or one this decision proposes',
    });
  } else {
    errors.push(...ownerErrors(body, evidence, prefix));
  }

  const registered = evidence.registry.get(body.capability);
  const conflicting = registered !== undefined && body.owner !== null && registered.owner !== body.owner;
  if (conflicting && body.revises === undefined) {
    errors.push({
      path: `${prefix}.revises`,
      message: `The registry places "${body.capability}" with "${registered.owner}"; a decision that moves it names the decision it replaces and what that affects`,
      expected: 'the decision this one replaces, with its affected work',
    });
  }
  if (body.revises !== undefined && !evidence.decisions.has(body.revises.decision)) {
    errors.push({
      path: `${prefix}.revises.decision`,
      message: `No decision "${body.revises.decision}" was committed by this run`,
      expected: 'a decision of this run',
    });
  }
  body.revises?.affected.forEach((affected, index) => {
    if (affected.workItem === undefined || evidence.workItems.has(affected.workItem)) return;
    errors.push({
      path: `${prefix}.revises.affected.${index}.workItem`,
      message: `No work item "${affected.workItem}" was committed by this run`,
      expected: 'a work item of this run',
    });
  });

  // The decision and its registry entry carry the same proposal, so the
  // authority to create a module and the record of it cannot differ.
  const change = registry.find(entry => entry.capability === body.capability);
  if (body.owner !== null && (body.outcome === 'create' || body.outcome === 'extract') && body.proposed !== undefined) {
    if (change === undefined) {
      errors.push({
        path: `${prefix}.proposed`,
        message: `A decision that proposes "${body.owner}" registers "${body.capability}" with the same proposal`,
        expected: 'a registry entry for this capability',
      });
    } else if (!sameProposal(change.proposed, body.proposed)) {
      errors.push({
        path: `${prefix}.proposed`,
        message: `The registry entry for "${body.capability}" carries a different proposal from the decision`,
        expected: 'the decision\'s own proposal',
      });
    }
  }
  if (change !== undefined && body.owner !== null && change.owner !== body.owner) {
    errors.push({
      path: `${prefix}.owner`,
      message: `The registry entry for "${body.capability}" places it with "${change.owner}", not "${body.owner}"`,
      expected: change.owner,
    });
  }

  errors.push(...existingSymbolErrors(body, evidence, prefix));
  errors.push(...citationErrors(body.evidence.citations, evidence, `${prefix}.evidence.citations`));
  return errors;
}

/**
 * The rule for `changesExistingSymbols`: only a module that already exists
 * has symbols with consumers, so a capability satisfied outside the project
 * or owned by a module this decision proposes changes none.
 */
function existingSymbolErrors(body: DecisionBody, evidence: PlacementEvidence, prefix: string): SubmissionError[] {
  if (!body.changesExistingSymbols) return [];
  if (body.owner === null) {
    return [{
      path: `${prefix}.changesExistingSymbols`,
      message: 'A capability satisfied outside this project has no implementation here, so it changes no symbol that already has consumers',
      expected: 'false',
    }];
  }
  if (evidence.index === null) return [];
  if (findModule(evidence.index, body.owner) !== undefined) return [];
  return [{
    path: `${prefix}.changesExistingSymbols`,
    message: `No module "${body.owner}" is in the refreshed architect view yet, so it has no symbols that already have consumers`,
    expected: 'false',
  }];
}

/** Whether the owner exists, or is one an accepted proposal creates. */
function ownerErrors(body: DecisionBody, evidence: PlacementEvidence, prefix: string): SubmissionError[] {
  const owner = body.owner!;
  if (evidence.index === null) return [];
  if (findModule(evidence.index, owner) !== undefined) {
    if (body.proposed === undefined) return [];
    return [{
      path: `${prefix}.proposed`,
      message: `"${owner}" is already a module of the refreshed architect view, so nothing proposes it`,
      expected: 'no proposal',
    }];
  }

  if (body.outcome === 'reuse') {
    if (body.proposed !== undefined) {
      return [{
        path: `${prefix}.proposed`,
        message: 'A decision whose outcome is "reuse" does not introduce an owner; propose one with "create" or "extract"',
        expected: 'no proposal',
      }];
    }
    const accepted = acceptedProposal(evidence.registry, owner);
    if (accepted !== undefined) return [];
    return [{
      path: `${prefix}.owner`,
      message: `No module "${owner}" is in the refreshed architect view, and no accepted registry entry proposes it`,
      expected: 'a module of the view, or one an accepted proposal creates',
    }];
  }

  if (body.proposed === undefined) {
    const accepted = acceptedProposal(evidence.registry, owner);
    if (accepted !== undefined) return [];
    return [{
      path: `${prefix}.proposed`,
      message: `No module "${owner}" is in the refreshed architect view, so this decision proposes it or names one that exists`,
      expected: 'a proposal for this owner',
    }];
  }
  return proposalErrors(body.proposed, body.capability, evidence, `${prefix}.proposed`);
}

/** The rules a `ModuleProposal` must satisfy: an existing parent and a free direct-child directory. */
export function proposalErrors(
  proposed: ModuleProposal,
  capability: string,
  evidence: PlacementEvidence,
  prefix: string,
): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const index = evidence.index;
  if (index === null) return errors;
  const parent = findModule(index, proposed.parent);
  if (parent === undefined) {
    errors.push({
      path: `${prefix}.parent`,
      message: `No module "${proposed.parent}" is in the refreshed architect view, so nothing can be created beneath it`,
      expected: 'a module of the view',
    });
    return errors;
  }

  const expected = `${parent.dir === '' ? '' : `${parent.dir}/`}subs/`;
  const remainder = proposed.directory.startsWith(expected) ? proposed.directory.slice(expected.length) : null;
  if (remainder === null || remainder === '' || remainder.includes('/')) {
    errors.push({
      path: `${prefix}.directory`,
      message: `A module is created as a direct child under its parent's "subs/": "${proposed.directory}" is not one of "${proposed.parent}"`,
      expected: `${expected}<directory>`,
    });
    return errors;
  }

  for (const entry of index.modules.values()) {
    if (entry.dir !== proposed.directory) continue;
    errors.push({
      path: `${prefix}.directory`,
      message: `"${proposed.directory}" is already the directory of the module "${entry.module}"`,
      expected: 'a directory no module has',
    });
    return errors;
  }
  for (const entry of evidence.registry.values()) {
    if (entry.capability === capability || entry.proposed?.directory !== proposed.directory) continue;
    errors.push({
      path: `${prefix}.directory`,
      message: `"${proposed.directory}" is already proposed for the capability "${entry.capability}"`,
      expected: 'a directory nothing else proposes',
    });
    return errors;
  }
  return errors;
}

function registryErrors(changes: readonly RegistryChange[], evidence: PlacementEvidence, prefix: string): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const seen = new Set<string>();
  changes.forEach((change, index) => {
    const path = `${prefix}.${index}`;
    if (seen.has(change.capability)) {
      errors.push({
        path: `${path}.capability`,
        message: `"${change.capability}" is registered twice by this submission; one revision states the entry`,
        expected: 'one entry per capability',
      });
    }
    seen.add(change.capability);

    if (evidence.index !== null && findModule(evidence.index, change.owner) === undefined) {
      if (change.proposed === undefined && acceptedProposal(evidence.registry, change.owner) === undefined) {
        errors.push({
          path: `${path}.owner`,
          message: `No module "${change.owner}" is in the refreshed architect view, and no accepted proposal creates it`,
          expected: 'a module of the view, or one an accepted proposal creates',
        });
      } else if (change.proposed !== undefined) {
        errors.push(...proposalErrors(change.proposed, change.capability, evidence, `${path}.proposed`));
      }
    } else if (change.proposed !== undefined) {
      errors.push({
        path: `${path}.proposed`,
        message: `"${change.owner}" is already a module of the refreshed architect view, so nothing proposes it`,
        expected: 'no proposal',
      });
    }

    change.consumers.forEach((consumer, position) => {
      if (!evidence.workItems.has(consumer.workItem)) {
        errors.push({
          path: `${path}.consumers.${position}.workItem`,
          message: `No work item "${consumer.workItem}" was committed by this run`,
          expected: 'a work item of this run',
        });
      }
      if (!evidence.registry.has(consumer.capability) && !seen.has(consumer.capability)) {
        errors.push({
          path: `${path}.consumers.${position}.capability`,
          message: `No capability "${consumer.capability}" is in the registry`,
          expected: 'a registered capability',
        });
      }
    });
  });
  return errors;
}

function hypothesisRevisionErrors(
  revisions: readonly HypothesisRevision[],
  evidence: PlacementEvidence,
  prefix: string,
): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const seen = new Set<string>();
  revisions.forEach((revision, index) => {
    const path = `${prefix}.${index}`;
    if (!evidence.hypotheses.has(revision.hypothesis)) {
      errors.push({
        path: `${path}.hypothesis`,
        message: `No hypothesis "${revision.hypothesis}" was committed by this run`,
        expected: 'a hypothesis of this run',
      });
    }
    if (seen.has(revision.hypothesis)) {
      errors.push({
        path: `${path}.hypothesis`,
        message: `"${revision.hypothesis}" is revised twice by this submission; one revision states the change`,
        expected: 'one revision per hypothesis',
      });
    }
    seen.add(revision.hypothesis);
    if (revision.supersededBy !== undefined && !evidence.hypotheses.has(revision.supersededBy)) {
      errors.push({
        path: `${path}.supersededBy`,
        message: `No hypothesis "${revision.supersededBy}" was committed by this run`,
        expected: 'a hypothesis of this run',
      });
    }
    if (revision.suggestedOwner !== undefined) errors.push(...moduleErrors(revision.suggestedOwner, evidence, `${path}.suggestedOwner`));
    if (revision.citations !== undefined) errors.push(...citationErrors(revision.citations, evidence, `${path}.citations`));
  });
  return errors;
}

function citationErrors(
  citations: ReadonlyArray<{ readonly module: string }>,
  evidence: PlacementEvidence,
  prefix: string,
): SubmissionError[] {
  return citations.flatMap((citation, index) => moduleErrors(citation.module, evidence, `${prefix}.${index}.module`));
}

function moduleErrors(module: string, evidence: PlacementEvidence, path: string): SubmissionError[] {
  if (evidence.index === null || findModule(evidence.index, module) !== undefined) return [];
  if (acceptedProposal(evidence.registry, module) !== undefined) return [];
  return [{
    path,
    message: `No module "${module}" is in the refreshed architect view`,
    expected: 'a module of the view',
  }];
}

/** The registry entry that already proposes `module`, if one does. */
export function acceptedProposal(registry: ReadonlyMap<string, RegistryEntry>, module: string): RegistryEntry | undefined {
  for (const entry of registry.values()) {
    if (entry.owner === module && entry.proposed !== undefined) return entry;
  }
  return undefined;
}

function sameProposal(left: ModuleProposal | undefined, right: ModuleProposal | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.parent === right.parent
    && left.directory === right.directory
    && left.purpose === right.purpose
    && left.tags.length === right.tags.length
    && left.tags.every((tag: string, index: number) => tag === right.tags[index]);
}
