import { z } from 'zod';
import { symbolRecords, type ArchitectIndex, type ModuleEntry } from '../../subs/evidence/src/views.js';
import { citationSchema, modulePathSchema } from '../interfaces/protocol/evidence.js';
import type { JsonSchema } from '../../subs/agent/src/interfaces/port.js';
import { moduleProposalSchema } from '../run/records.js';
import { validateAgainst, type SubmissionError, type SubmissionValidation } from '../run/submissions.js';
import { hypothesisChangeSchema, slugSchema } from './records.js';
import { extractDocumentScenarios, type PlanScenario, type PlanScenarioExtraction } from '../../subs/scenarios/src/extraction.js';
import type { DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import {
  acceptElements, submittedElementSchema, type ElementCatalog, type ElementKind,
} from '../../subs/plan-evidence/src/interfaces/catalog.js';
import type { Incorporation } from './evidence-contracts.js';
import {
  integrationScenarioSubmissionSchema, scenarioSubmissionSchema, validateScenarioForm,
  type ScenarioFormResult, type ScenarioViewNames,
} from '../../subs/scenarios/src/form.js';

/*
 * The initial architect's submission, `initial-architect/3`: the functional
 * and context elements it read from the plan documents, the entry
 * capabilities that cite them, the deeper hypotheses it forecasts, and the
 * acceptance scenarios of every entry. Entries and hypotheses stay separate,
 * and a hypothesis never creates work, an obligation or a completion
 * requirement.
 *
 * Every rule the schema cannot hold is here: an owner the refreshed view has
 * or a valid proposal, slugs unique in the run, elements read from captured
 * plan documents, element citations of the right kind, and citations whose
 * module, file and symbol the cited view actually records. A failure changes nothing and returns every error with
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
  /** Keys of the functional elements that state the entry's requirement. */
  requirementRefs: z.array(text),
  /** Keys of the functional elements that state its acceptance; its scenarios cite each one. */
  acceptanceRefs: z.array(text),
  /** Keys of the context elements a reader needs to understand the entry. */
  contextRefs: z.array(text),
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
 * already, the elements' and the scenarios' included; an element is named
 * by its submission-local key until then.
 */
export const initialAnalysisSubmissionSchema = z.object({
  /** The functional and context elements of the plan documents. */
  elements: z.array(submittedElementSchema),
  entries: z.array(entrySchema),
  hypotheses: z.array(hypothesisSubmissionSchema),
  coverageLimits: z.array(z.string()),
  scenarios: z.array(scenarioSubmissionSchema),
  integrationScenarios: z.array(integrationScenarioSubmissionSchema),
}).strict();
export type InitialAnalysisSubmission = z.infer<typeof initialAnalysisSubmissionSchema>;
/** An accepted submission whose element keys the harness rewrote to element IDs. */
export type ResolvedAnalysis = Omit<InitialAnalysisSubmission, 'elements'>;
export type SubmittedEntry = InitialAnalysisSubmission['entries'][number];
export type SubmittedHypothesis = InitialAnalysisSubmission['hypotheses'][number];

/** The schema the agent's tool is given, taken from the same definition that validates. */
export const initialAnalysisJsonSchema = z.toJSONSchema(initialAnalysisSubmissionSchema) as JsonSchema;

export const initialAnalysisToolName = 'submit_initial_analysis';

/** What the rules beyond the schema are checked against. */
export interface AnalysisEvidence {
  /**
   * The refreshed architect view, or null where the run has none. Without it
   * the owner and citation rules cannot be applied, and the run records that
   * as a coverage limit rather than accepting a claim it did not check.
   */
  readonly index: ArchitectIndex | null;
  /** The catalog before this submission: the intake's and the principles extractions' elements. */
  readonly catalog: ElementCatalog;
  /** The intake's judgment of which captured plan documents supply binding scenarios. */
  readonly incorporation?: Incorporation | undefined;
  readonly documents?: { readonly manifest: DocumentManifest; readonly bytes: ReadonlyMap<string, Uint8Array> } | undefined;
  /** The plan scenarios captured with the plan, where no incorporation selects them. */
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
  errors.push(...elementErrors(shape.value, evidence));
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
export function scenarioFormOf(submission: ResolvedAnalysis, evidence: AnalysisEvidence): ScenarioFormResult {
  return validateScenarioForm(
    { scenarios: submission.scenarios, integrationScenarios: submission.integrationScenarios },
    incorporatedScenarios(evidence),
    submission.entries.map(entry => ({ capability: entry.capability, acceptanceRefs: entry.acceptanceRefs })),
    viewNamesOf(evidence.index),
  );
}

/** The plan scenarios of the incorporated plan documents, numbered `ps-NN` across them in captured order. */
export function incorporatedScenarios(evidence: Pick<AnalysisEvidence, 'incorporation' | 'documents' | 'planScenarios'>): readonly PlanScenario[] {
  return incorporatedExtraction(evidence).scenarios;
}

/** The same scenarios, with the blocks of the incorporated documents that did not parse. */
export function incorporatedExtraction(evidence: Pick<AnalysisEvidence, 'incorporation' | 'documents' | 'planScenarios'>): PlanScenarioExtraction {
  const { documents, incorporation } = evidence;
  if (documents === undefined || incorporation === undefined) return { scenarios: [...evidence.planScenarios ?? []], limitations: [] };
  return extractDocumentScenarios(documents.manifest.documents
    .filter(document => document.kind === 'plan' && incorporation.documents.some(choice => choice.document === document.id && choice.scenarios))
    .map(document => ({ id: document.id, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(documents.bytes.get(document.id)!) })));
}

/** The kinds each citation of an analysis must name. */
const citedKinds = {
  requirementRefs: 'functional', acceptanceRefs: 'functional', contextRefs: 'context',
} as const satisfies Record<string, ElementKind>;

/**
 * Every citation of an entry or a scenario names an element of the kind its
 * field requires: requirements and acceptance functional, context context,
 * and a scenario's refs functional. `kindOf` answers for keys before
 * acceptance and for IDs after it.
 */
export function analysisCitationErrors(
  analysis: Pick<ResolvedAnalysis, 'entries' | 'scenarios'>,
  kindOf: (citation: string) => ElementKind | undefined,
  known: string,
): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const check = (citations: readonly string[], kind: ElementKind, at: string) => citations.forEach((citation, index) => {
    const actual = kindOf(citation);
    if (actual === undefined) errors.push({ path: `${at}.${index}`, message: `Unknown element ${citation}`, expected: `${known} of kind ${kind}` });
    else if (actual !== kind) errors.push({ path: `${at}.${index}`, message: `${citation} is a ${actual} element`, expected: `a ${kind} element` });
  });
  analysis.entries.forEach((entry, position) => {
    for (const field of ['requirementRefs', 'acceptanceRefs', 'contextRefs'] as const) check(entry[field], citedKinds[field], `entries.${position}.${field}`);
  });
  analysis.scenarios.forEach((scenario, position) => check(scenario.refs ?? [], 'functional', `scenarios.${position}.refs`));
  return errors;
}

/** The architect's elements are functional or context, read from captured plan documents, and every citation names one of them. */
function elementErrors(submission: InitialAnalysisSubmission, evidence: AnalysisEvidence): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const plans = new Set(evidence.catalog.documents.filter(document => document.kind === 'plan').map(document => document.id));
  submission.elements.forEach((element, index) => {
    if (element.kind !== 'functional' && element.kind !== 'context') errors.push({ path: `elements.${index}.kind`, message: `The initial architect does not submit ${element.kind} elements`, expected: 'functional or context' });
    if (!plans.has(element.document)) errors.push({ path: `elements.${index}.document`, message: `${element.document} is not a captured plan document`, expected: 'a captured plan document' });
  });
  if (errors.length === 0) {
    const accepted = acceptElements(evidence.catalog, submission.elements);
    if (!accepted.ok) for (const error of accepted.errors) {
      const split = error.indexOf(': ');
      errors.push({ path: `elements.${error.slice(0, split)}`, message: error.slice(split + 2) });
    }
  }
  const kinds = new Map(submission.elements.map(element => [element.key, element.kind]));
  errors.push(...analysisCitationErrors(submission, key => kinds.get(key), 'the key of an element of this submission'));
  return errors;
}

/**
 * The catalog with the architect's elements accepted, and the submission with
 * every key rewritten to its element ID. Only a validated submission is
 * accepted, so a failure here is the harness disagreeing with itself.
 */
export function acceptArchitectElements(catalog: ElementCatalog, submission: InitialAnalysisSubmission): { readonly catalog: ElementCatalog; readonly analysis: ResolvedAnalysis } {
  const accepted = acceptElements(catalog, submission.elements);
  if (!accepted.ok) throw new Error(`An accepted analysis has invalid elements: ${accepted.errors.join('; ')}`);
  const id = (key: string) => accepted.ids.get(key) ?? key;
  const { elements: _elements, ...rest } = submission;
  void _elements;
  return {
    catalog: accepted.catalog,
    analysis: {
      ...rest,
      entries: rest.entries.map(entry => ({ ...entry,
        requirementRefs: entry.requirementRefs.map(id), acceptanceRefs: entry.acceptanceRefs.map(id), contextRefs: entry.contextRefs.map(id) })),
      scenarios: rest.scenarios.map(scenario => (scenario.refs === undefined ? scenario : { ...scenario, refs: scenario.refs.map(id) })),
    },
  };
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
