import { z } from 'zod';
import { symbolRecords, type ArchitectIndex, type ModuleEntry } from '../../subs/evidence/src/views.js';
import { citationSchema, modulePathSchema } from '../interfaces/protocol/evidence.js';
import type { JsonSchema } from '../../subs/agent/src/interfaces/port.js';
import { moduleProposalSchema, planRefSchema } from '../run/records.js';
import { validateAgainst, type SubmissionError, type SubmissionValidation } from '../run/submissions.js';
import { hypothesisChangeSchema, slugSchema } from './records.js';
import type { PlanScenario } from '../../subs/scenarios/src/extraction.js';
import { resolvePlanReference } from '../../subs/plan-evidence/src/references.js';
import type { DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import {
  integrationScenarioSubmissionSchema, scenarioSubmissionSchema, validateScenarioForm,
  type ScenarioFormResult, type ScenarioViewNames,
} from '../../subs/scenarios/src/form.js';

/*
 * The initial architect's submission, `initial-architect/2`: the entry
 * capabilities of the plan, the deeper hypotheses it forecasts, and the
 * acceptance scenarios of every entry. Entries and hypotheses stay separate,
 * and a hypothesis never creates work, an obligation or a completion
 * requirement.
 *
 * Every rule the schema cannot hold is here: an owner the refreshed view has
 * or a valid proposal, slugs unique in the run, plan references inside the
 * captured plan, and citations whose module, file and symbol the cited view
 * actually records. A failure changes nothing and returns every error with
 * its path to the same session. Only when all of those hold are the
 * scenarios' form rules applied, and the first one broken is the answer.
 */

const text = z.string().min(1);

export { slugSchema };

const entrySchema = z.object({
  capability: slugSchema,
  description: text,
  owner: modulePathSchema,
  proposed: moduleProposalSchema.optional(),
  requirementRefs: z.array(planRefSchema),
  acceptanceRefs: z.array(planRefSchema),
  citations: z.array(citationSchema),
}).strict();

const hypothesisSubmissionSchema = z.object({
  id: slugSchema,
  capability: slugSchema,
  change: hypothesisChangeSchema,
  /** Whether implementing the forecast capability is expected to change symbols that already have consumers. */
  changesExistingSymbols: z.boolean(),
  suggestedOwner: modulePathSchema,
  anticipatedConsumers: z.array(text),
  involvedModules: z.array(modulePathSchema),
  dependsOn: z.array(slugSchema),
  confidence: z.enum(['low', 'medium', 'high']),
  rationale: text,
  assumptions: z.array(z.string()),
  uncertainties: z.array(z.string()),
  citations: z.array(citationSchema),
}).strict();

/**
 * What the initial architect submits. The harness assigns every ID it knows
 * already, the scenarios' `sc-NNN` included. `scenarios` and
 * `integrationScenarios` are required: an analysis without them is the
 * retired `initial-architect/1` and is not accepted.
 */
export const initialAnalysisSubmissionSchema = z.object({
  entries: z.array(entrySchema),
  hypotheses: z.array(hypothesisSubmissionSchema),
  coverageLimits: z.array(z.string()),
  scenarios: z.array(scenarioSubmissionSchema),
  integrationScenarios: z.array(integrationScenarioSubmissionSchema),
}).strict();
export type InitialAnalysisSubmission = z.infer<typeof initialAnalysisSubmissionSchema>;
export type SubmittedEntry = InitialAnalysisSubmission['entries'][number];
export type SubmittedHypothesis = InitialAnalysisSubmission['hypotheses'][number];

/** The schema the agent's tool is given, taken from the same definition that validates. */
export const initialAnalysisJsonSchema = z.toJSONSchema(initialAnalysisSubmissionSchema) as JsonSchema;

export const initialAnalysisToolName = 'submit_initial_analysis';

/** The captured plan, as a plan reference is checked against it. */
export interface CapturedPlanShape {
  readonly lines: number;
  /** The heading anchors the plan offers, lowercased. */
  readonly anchors: ReadonlySet<string>;
}

/** The anchors and the length of one captured plan. */
export function describePlan(plan: string): CapturedPlanShape {
  const lines = plan.split('\n');
  const anchors = new Set<string>();
  for (const line of lines) {
    const heading = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (heading) anchors.add(anchorOf(heading[1]!));
  }
  return { lines: lines.length, anchors };
}

/** A heading's anchor, as a Markdown reader forms one. */
export function anchorOf(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** What the rules beyond the schema are checked against. */
export interface AnalysisEvidence {
  /**
   * The refreshed architect view, or null where the run has none. Without it
   * the owner and citation rules cannot be applied, and the run records that
   * as a coverage limit rather than accepting a claim it did not check.
   */
  readonly index: ArchitectIndex | null;
  /** The captured plan, or null where it could not be read. */
  readonly plan?: CapturedPlanShape | null | undefined;
  /** New runs resolve every reference against its exact captured document. */
  readonly documents?: { readonly manifest: DocumentManifest; readonly bytes: ReadonlyMap<string, Uint8Array> } | undefined;
  /** The plan scenarios captured with the plan; none when it has no `gherkin` block. */
  readonly planScenarios?: readonly PlanScenario[] | undefined;
}

/**
 * The capability slug an entry may not take: an integration scenario's
 * feature file is `integration.feature` beside the entries' own, so an entry
 * of that name could share its file.
 */
export const reservedCapabilitySlug = 'integration';

/**
 * Validates one submission: the strict schema, then the rules the schema
 * cannot hold. Nothing changes on a failure, and every error names its path.
 */
export function validateInitialAnalysis(input: unknown, evidence: AnalysisEvidence): SubmissionValidation<InitialAnalysisSubmission> {
  const shape = validateAgainst(initialAnalysisSubmissionSchema, input);
  if (!shape.ok) return shape;
  const errors = beyondTheSchema(shape.value, evidence);
  if (errors.length > 0) return { ok: false, errors };
  const form = scenarioFormOf(shape.value, evidence);
  if (form.ok) return shape;
  return {
    ok: false,
    errors: [{ path: form.path, message: form.message, expected: `a submission that keeps scenario form rule ${form.rule}` }],
  };
}

/**
 * The scenarios' form rules over one submission, and, when they hold, the
 * accepted form and its warnings. Pure, so acceptance derives the same form
 * the validation accepted.
 */
export function scenarioFormOf(submission: InitialAnalysisSubmission, evidence: AnalysisEvidence): ScenarioFormResult {
  return validateScenarioForm(
    { scenarios: submission.scenarios, integrationScenarios: submission.integrationScenarios },
    evidence.planScenarios ?? [],
    submission.entries.map(entry => ({ capability: entry.capability, acceptanceRefs: entry.acceptanceRefs })),
    viewNamesOf(evidence.index),
  );
}

/** The exported symbols and the files the architect view records, for the scenarios' first warning. */
function viewNamesOf(index: ArchitectIndex | null): ScenarioViewNames {
  if (index === null) return { symbols: [], files: [] };
  const records = [...index.symbols.values()].flat();
  return {
    symbols: [...new Set(records.map(record => record.name))].sort(),
    files: [...new Set(records.map(record => record.file))].sort(),
  };
}

function beyondTheSchema(submission: InitialAnalysisSubmission, evidence: AnalysisEvidence): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const capabilities = new Set<string>();
  /** Directories one submission proposes, with the entry that first proposed each. */
  const proposedDirectories = new Map<string, { entry: number; definition: string }>();

  submission.entries.forEach((entry, position) => {
    if (capabilities.has(entry.capability)) {
      errors.push({
        path: `entries.${position}.capability`,
        message: `The capability slug "${entry.capability}" is used by an earlier entry; a slug is unique in the run`,
        expected: 'a slug no other entry uses',
      });
    }
    if (entry.capability === reservedCapabilitySlug) {
      errors.push({
        path: `entries.${position}.capability`,
        message: `The capability slug "${reservedCapabilitySlug}" is reserved: integration scenarios are written to integration.feature beside each entry's own <capability>.feature, so an entry of that name would share their file. Name the capability for its behavior`,
        expected: `a slug other than "${reservedCapabilitySlug}"`,
      });
    }
    capabilities.add(entry.capability);
    errors.push(...ownerErrors(entry, position, evidence, proposedDirectories));
    errors.push(...planRefErrors(entry.requirementRefs, `entries.${position}.requirementRefs`, evidence));
    errors.push(...planRefErrors(entry.acceptanceRefs, `entries.${position}.acceptanceRefs`, evidence));
    entry.citations.forEach((citation, index) => {
      errors.push(...citationErrors(citation, `entries.${position}.citations.${index}`, evidence));
    });
  });

  const hypotheses = new Set<string>();
  submission.hypotheses.forEach((hypothesis, position) => {
    if (hypotheses.has(hypothesis.id)) {
      errors.push({
        path: `hypotheses.${position}.id`,
        message: `The hypothesis ID "${hypothesis.id}" is used by an earlier hypothesis; an ID is unique in the run`,
        expected: 'an ID no other hypothesis uses',
      });
    }
    hypotheses.add(hypothesis.id);
    hypothesis.citations.forEach((citation, index) => {
      errors.push(...citationErrors(citation, `hypotheses.${position}.citations.${index}`, evidence));
    });
  });

  // An architect scenario's references are plan references like an entry's.
  submission.scenarios.forEach((scenario, position) => {
    errors.push(...planRefErrors(scenario.refs ?? [], `scenarios.${position}.refs`, evidence));
  });
  return errors;
}

/**
 * An entry's owner exists in the refreshed view, or its proposal names a
 * parent that does, a non-conflicting direct-child directory under that
 * parent's `subs/`, and a directory whose name is the owner's own. A
 * hypothesis alone gives no creation authority, so nothing here reads one.
 */
function ownerErrors(
  entry: SubmittedEntry,
  position: number,
  evidence: AnalysisEvidence,
  proposedDirectories: Map<string, { entry: number; definition: string }>,
): SubmissionError[] {
  const { index } = evidence;
  if (index === null) return [];
  const owner = index.modules.get(entry.owner);
  if (owner !== undefined) {
    if (entry.proposed !== undefined) {
      return [{
        path: `entries.${position}.proposed`,
        message: `The owner "${entry.owner}" already exists in the architect view, so it cannot also be proposed`,
        expected: 'no proposal for an existing module',
      }];
    }
    return [];
  }
  if (entry.proposed === undefined) {
    return [{
      path: `entries.${position}.owner`,
      message: `No module "${entry.owner}" is in the architect view, and the entry proposes none`,
      expected: 'a module of the architect view, or a module proposal',
    }];
  }
  const errors: SubmissionError[] = [];
  const parent = index.modules.get(entry.proposed.parent);
  if (parent === undefined) {
    return [{
      path: `entries.${position}.proposed.parent`,
      message: `No module "${entry.proposed.parent}" is in the architect view; a proposed module's parent must already exist`,
      expected: 'a module of the architect view',
    }];
  }
  const under = `${parent.dir === '' ? '' : `${parent.dir}/`}subs/`;
  const directory = entry.proposed.directory.replace(/\/+$/, '');
  const name = directory.slice(under.length);
  if (!directory.startsWith(under) || name === '' || name.includes('/')) {
    return [{
      path: `entries.${position}.proposed.directory`,
      message: `"${entry.proposed.directory}" is not a direct child under ${under}, where a child of "${entry.proposed.parent}" belongs`,
      expected: `${under}<name>`,
    }];
  }

  // The owner, the directory and the declaration name must agree.
  const declared = entry.owner.slice(entry.owner.lastIndexOf('/') + 1);
  const ownerParent = entry.owner.includes('/') ? entry.owner.slice(0, entry.owner.lastIndexOf('/')) : null;
  if (name !== declared) {
    errors.push({
      path: `entries.${position}.proposed.directory`,
      message: `The directory "${directory}" is named "${name}", but the owner "${entry.owner}" declares "${declared}"; the owner, the directory and the declaration name must agree`,
      expected: `${under}${declared}`,
    });
  }
  if (ownerParent !== entry.proposed.parent) {
    errors.push({
      path: `entries.${position}.owner`,
      message: `"${entry.owner}" is not a child of "${entry.proposed.parent}", which the proposal names as its parent`,
      expected: `${entry.proposed.parent}/${declared}`,
    });
  }

  const occupant = occupantOf(index, directory);
  if (occupant !== undefined) {
    errors.push({
      path: `entries.${position}.proposed.directory`,
      message: `"${directory}" is already the directory of "${occupant.module}" in the architect view; a proposed module needs a directory nothing occupies`,
      expected: 'a directory no module occupies',
    });
  }
  const definition = `${entry.owner}\u0000${entry.proposed.parent}\u0000${entry.proposed.purpose}\u0000${[...entry.proposed.tags].sort().join(',')}`;
  const earlier = proposedDirectories.get(directory);
  if (earlier !== undefined && earlier.definition !== definition) {
    errors.push({
      path: `entries.${position}.proposed`,
      message: `Entry ${earlier.entry} proposes "${directory}" with a different definition; two capabilities may reference one proposal but cannot define it twice`,
      expected: 'one definition per proposed directory',
    });
  } else if (earlier === undefined) {
    proposedDirectories.set(directory, { entry: position, definition });
  }
  return errors;
}

function occupantOf(index: ArchitectIndex, directory: string): ModuleEntry | undefined {
  for (const entry of index.modules.values()) if (entry.dir === directory) return entry;
  return undefined;
}

/** Every plan reference lies inside the captured plan: a heading it has, or lines it holds. */
function planRefErrors(
  refs: ReadonlyArray<{ anchor?: string | undefined; lines?: readonly [number, number] | undefined }>,
  at: string,
  evidence: AnalysisEvidence,
): SubmissionError[] {
  const errors: SubmissionError[] = [];
  refs.forEach((ref, index) => {
    const path = `${at}.${index}`;
    if (ref.anchor === undefined && ref.lines === undefined) {
      errors.push({ path, message: 'A plan reference names a heading anchor or a line range', expected: 'anchor or lines' });
      return;
    }
    if (evidence.documents) {
      const resolved = resolvePlanReference(evidence.documents.manifest, evidence.documents.bytes, ref);
      if (resolved.status === 'unavailable') errors.push({ path, message: resolved.reason, expected: 'a passage in the named captured document' });
      return;
    }
    const plan = evidence.plan;
    if (plan === undefined || plan === null) return;
    if (ref.anchor !== undefined && !plan.anchors.has(anchorOf(ref.anchor))) {
      errors.push({
        path: `${path}.anchor`,
        message: `The captured plan has no heading "${ref.anchor}"`,
        expected: `one of: ${[...plan.anchors].slice(0, 12).join(', ')}${plan.anchors.size > 12 ? ', …' : ''}`,
      });
    }
    if (ref.lines !== undefined) {
      const [from, to] = ref.lines;
      if (from < 1 || to < from || to > plan.lines) {
        errors.push({
          path: `${path}.lines`,
          message: `[${from}, ${to}] is not a range of the captured plan, which has ${plan.lines} lines`,
          expected: `1 ≤ from ≤ to ≤ ${plan.lines}`,
        });
      }
    }
  });
  return errors;
}

/**
 * A citation's module must be in the view, and a symbol it names must be an
 * exported original the view records under that module.
 */
function citationErrors(
  citation: { module: string; file?: string | undefined; symbol?: string | undefined },
  at: string,
  evidence: AnalysisEvidence,
): SubmissionError[] {
  const { index } = evidence;
  if (index === null) return [];
  if (!index.modules.has(citation.module)) {
    return [{ path: `${at}.module`, message: `No module "${citation.module}" is in the architect view`, expected: 'a module of the architect view' }];
  }
  if (citation.symbol === undefined) return [];
  if (symbolRecords(index, citation.module, citation.symbol).length > 0) return [];
  return [{
    path: `${at}.symbol`,
    message: `The architect view records no exported "${citation.symbol}" owned by "${citation.module}"`,
    expected: 'an exported original the cited module owns',
  }];
}
