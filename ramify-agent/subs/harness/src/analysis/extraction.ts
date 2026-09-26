import { join } from 'node:path';
import { z } from 'zod';
import type { JsonSchema } from '../../subs/agent/src/interfaces/port.js';
import type { DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import {
  acceptElements, createPackage, elementRewriteSchema, resolveCitations, reviseCatalog, submittedElementSchema,
  type ElementCatalog, type ElementKind,
} from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { extractPlanScenarios } from '../../subs/scenarios/src/extraction.js';
import type { SubmissionError, SubmissionValidation } from '../run/submissions.js';
import { incorporationSchema, type Incorporation } from './evidence-contracts.js';
import type { CatalogFinding } from './records.js';
import { analysisCitationErrors, scenarioFormOf, type AnalysisEvidence, type ResolvedAnalysis } from './submission.js';

/*
 * The bounded turns that extract the element catalog beside the initial
 * architect: one intake over the captured plan documents, one extraction per
 * captured principles document, and one checker per captured document once
 * every element exists. Each is a fresh session of the catalog extractor with
 * the smallest input that serves it. The harness checks shape, documents and
 * citations; it never compares an element's text with the captured bytes.
 */

const text = z.string().min(1);

/** The intake: the plan's non-functional requirements and recommendations, and the incorporation judgment. */
export const intakeSubmissionSchema = z.object({
  /** The plan's goal in a few sentences, close to its own words; each principles extraction reads it. */
  goal: text,
  elements: z.array(submittedElementSchema),
  incorporation: incorporationSchema.omit({ schema: true }),
}).strict();
export type IntakeSubmission = z.infer<typeof intakeSubmissionSchema>;
export const intakeToolName = 'submit_intake';
export const intakeJsonSchema = z.toJSONSchema(intakeSubmissionSchema) as JsonSchema;

/** One principles document's fixed requirements and recommendations that bear on this plan. */
export const principleSubmissionSchema = z.object({ elements: z.array(submittedElementSchema) }).strict();
export type PrincipleSubmission = z.infer<typeof principleSubmissionSchema>;
export const principleToolName = 'submit_principle_elements';
export const principleJsonSchema = z.toJSONSchema(principleSubmissionSchema) as JsonSchema;

const citationList = z.array(text);

/** One correction of the checker, with its reason. */
export const correctionSchema = z.discriminatedUnion('action', [
  /** An element the reading omitted. */
  z.object({ action: z.literal('add'), reason: text, elements: z.array(submittedElementSchema).min(1) }).strict(),
  /** An element made stronger or weaker than its source; it keeps its ID. */
  z.object({ action: z.literal('rewrite'), reason: text, element: elementRewriteSchema }).strict(),
  /** A split, a merge or a reclassification: the old IDs retire and the new elements get new ones. */
  z.object({ action: z.literal('replace'), reason: text, retire: z.array(text).min(1), elements: z.array(submittedElementSchema).min(1) }).strict(),
]);
export type Correction = z.infer<typeof correctionSchema>;

export const checkSubmissionSchema = z.object({
  corrections: z.array(correctionSchema),
  /** Entries whose citations change, with their complete new lists. */
  entries: z.array(z.object({
    capability: text, requirementRefs: citationList, acceptanceRefs: citationList, contextRefs: citationList,
  }).strict()),
  /** Scenarios whose citations change, by the architect's scenario key, with their complete new list. */
  scenarios: z.array(z.object({ key: text, refs: citationList }).strict()),
}).strict();
export type CheckSubmission = z.infer<typeof checkSubmissionSchema>;
export const checkToolName = 'submit_catalog_check';
export const checkJsonSchema = z.toJSONSchema(checkSubmissionSchema) as JsonSchema;

export type Accepted<T> = { readonly ok: true } & T | { readonly ok: false; readonly errors: readonly SubmissionError[] };

/** The intake's elements and its incorporation judgment. */
export function acceptIntake(catalog: ElementCatalog, manifest: DocumentManifest, value: IntakeSubmission):
  Accepted<{ readonly catalog: ElementCatalog; readonly incorporation: Incorporation }> {
  const errors = [
    ...elementErrors(catalog, value.elements, ['non-functional', 'recommendation'], new Set(planDocuments(manifest)), 'elements'),
    ...incorporationErrors(value.incorporation, manifest),
  ];
  if (errors.length > 0) return { ok: false, errors };
  const accepted = acceptElements(catalog, value.elements);
  if (!accepted.ok) return { ok: false, errors: accepted.errors.map(error => toError('elements', error)) };
  return { ok: true, catalog: accepted.catalog, incorporation: incorporationSchema.parse({ schema: 'ramify-agent.document-incorporation/2', ...value.incorporation }) };
}

/** One principles document's elements, which must all be read from it. */
export function acceptPrinciples(catalog: ElementCatalog, document: string, value: PrincipleSubmission):
  Accepted<{ readonly catalog: ElementCatalog }> {
  const errors = elementErrors(catalog, value.elements, ['fixed', 'recommendation'], new Set([document]), 'elements');
  if (errors.length > 0) return { ok: false, errors };
  const accepted = acceptElements(catalog, value.elements);
  return accepted.ok ? { ok: true, catalog: accepted.catalog } : { ok: false, errors: accepted.errors.map(error => toError('elements', error)) };
}

/** The catalog and the analysis that cites it, as the checker turns see them. */
export interface CheckState {
  readonly catalog: ElementCatalog;
  readonly analysis: ResolvedAnalysis;
}

/**
 * Apply one checker's corrections to the elements of its document and its
 * re-citations to the analysis. Afterwards every entry and scenario citation
 * must name an active element of the right kind and the scenario form must
 * still hold; otherwise nothing changes and every error has its path.
 */
export function applyCheck(state: CheckState, document: string, invocation: string, value: CheckSubmission, evidence: AnalysisEvidence):
  Accepted<CheckState & { readonly findings: readonly CatalogFinding[] }> {
  const errors: SubmissionError[] = [];
  const own = new Set(state.catalog.elements.filter(element => element.document === document).map(element => element.id));
  const added: unknown[] = [];
  const rewrite: z.infer<typeof elementRewriteSchema>[] = [];
  const retire: string[] = [];
  value.corrections.forEach((correction, index) => {
    const path = `corrections.${index}`;
    if (correction.action === 'rewrite') {
      if (!own.has(correction.element.id)) errors.push({ path: `${path}.element.id`, message: `${correction.element.id} is not an element of ${document}`, expected: 'an active element read from the checked document' });
      rewrite.push(correction.element);
      return;
    }
    correction.elements.forEach((element, position) => {
      if (element.document !== document) errors.push({ path: `${path}.elements.${position}.document`, message: `A correction adds elements of ${document} only`, expected: document });
      added.push(element);
    });
    if (correction.action === 'replace') correction.retire.forEach((id, position) => {
      if (!own.has(id)) errors.push({ path: `${path}.retire.${position}`, message: `${id} is not an element of ${document}`, expected: 'an active element read from the checked document' });
      retire.push(id);
    });
  });
  if (errors.length > 0) return { ok: false, errors };
  const revised = reviseCatalog(state.catalog, { rewrite, retire, add: added });
  if (!revised.ok) return { ok: false, errors: revised.errors.map(error => toError('corrections', error)) };

  const active = new Set(revised.catalog.elements.map(element => element.id));
  const resolve = (citations: readonly string[], path: string): string[] => {
    const resolved = resolveCitations(citations, { keys: revised.ids, elements: active }, path);
    if (resolved.ok) return [...resolved.ids];
    errors.push(...resolved.errors.map(error => toError('', error)));
    return [...citations];
  };
  const capabilities = new Set(state.analysis.entries.map(entry => entry.capability));
  const entries = new Map(value.entries.map((entry, index) => {
    if (!capabilities.has(entry.capability)) errors.push({ path: `entries.${index}.capability`, message: `No entry "${entry.capability}"`, expected: 'an entry of the analysis' });
    return [entry.capability, {
      requirementRefs: resolve(entry.requirementRefs, `entries.${index}.requirementRefs`),
      acceptanceRefs: resolve(entry.acceptanceRefs, `entries.${index}.acceptanceRefs`),
      contextRefs: resolve(entry.contextRefs, `entries.${index}.contextRefs`),
    }] as const;
  }));
  const keys = new Set(state.analysis.scenarios.map(scenario => scenario.key));
  const scenarios = new Map(value.scenarios.map((scenario, index) => {
    if (!keys.has(scenario.key)) errors.push({ path: `scenarios.${index}.key`, message: `No scenario "${scenario.key}"`, expected: 'a scenario key of the analysis' });
    return [scenario.key, resolve(scenario.refs, `scenarios.${index}.refs`)] as const;
  }));
  if (errors.length > 0) return { ok: false, errors };

  const analysis: ResolvedAnalysis = {
    ...state.analysis,
    entries: state.analysis.entries.map(entry => ({ ...entry, ...entries.get(entry.capability) })),
    scenarios: state.analysis.scenarios.map(scenario => (scenarios.has(scenario.key) ? { ...scenario, refs: scenarios.get(scenario.key)! } : scenario)),
  };
  const kinds = new Map(revised.catalog.elements.map(element => [element.id, element.kind]));
  const citationErrors = analysisCitationErrors(analysis, citation => kinds.get(citation), 'an active element');
  if (citationErrors.length > 0) return { ok: false, errors: citationErrors };
  const form = scenarioFormOf(analysis, { ...evidence, catalog: revised.catalog });
  if (!form.ok) return { ok: false, errors: [{ path: form.path, message: form.message, expected: `citations that keep scenario form rule ${form.rule}` }] };

  let next = 0;
  const idsOf = (count: number) => {
    const keysInOrder = [...revised.ids.values()].slice(next, next + count);
    next += count;
    return keysInOrder;
  };
  const findings = value.corrections.map((correction): CatalogFinding => ({
    document, invocation, action: correction.action, reason: correction.reason,
    elements: correction.action === 'rewrite' ? [correction.element.id] : idsOf(correction.elements.length),
    retired: correction.action === 'replace' ? [...correction.retire] : [],
  }));
  return { ok: true, catalog: revised.catalog, analysis, findings };
}

/** Wrap a pure acceptance as a submission validation for the invocation's judge. */
export function asValidation<T>(value: T, accepted: Accepted<object>): SubmissionValidation<T> {
  return accepted.ok ? { ok: true, value } : { ok: false, errors: accepted.errors };
}

function elementErrors(
  catalog: ElementCatalog, elements: readonly { readonly kind: ElementKind; readonly document: string }[],
  kinds: readonly ElementKind[], documents: ReadonlySet<string>, at: string,
): SubmissionError[] {
  const errors: SubmissionError[] = [];
  elements.forEach((element, index) => {
    if (!kinds.includes(element.kind)) errors.push({ path: `${at}.${index}.kind`, message: `This turn does not submit ${element.kind} elements`, expected: kinds.join(' or ') });
    if (!documents.has(element.document)) errors.push({ path: `${at}.${index}.document`, message: `${element.document} is not a document this turn reads`, expected: [...documents].join(' or ') });
  });
  if (errors.length > 0) return errors;
  const accepted = acceptElements(catalog, elements);
  return accepted.ok ? [] : accepted.errors.map(error => toError(at, error));
}

/** Every captured plan document is judged once, and every missing reference once; a required gap cannot be accepted. */
export function incorporationErrors(incorporation: IntakeSubmission['incorporation'], manifest: DocumentManifest): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const choices = new Set<string>();
  incorporation.documents.forEach((choice, index) => {
    if (!manifest.documents.some(item => item.id === choice.document && item.kind === 'plan')) {
      errors.push({ path: `incorporation.documents.${index}.document`, message: `Unknown plan document ${choice.document}`, expected: 'a captured plan document' });
    }
    if (choices.has(choice.document)) errors.push({ path: `incorporation.documents.${index}.document`, message: 'Duplicate document judgment', expected: 'one judgment per plan document' });
    choices.add(choice.document);
  });
  for (const document of manifest.documents.filter(item => item.kind === 'plan')) if (!choices.has(document.id)) {
    errors.push({ path: 'incorporation.documents', message: `No judgment for ${document.path}`, expected: 'one judgment per captured plan document' });
  }
  const gapKey = (gap: { from: string; target: string; source: { start: number; end: number } }) => `${gap.from}:${gap.target}:${gap.source.start}:${gap.source.end}`;
  const missing = new Map(manifest.missing.map(gap => [gapKey(gap), gap]));
  const judged = new Set<string>();
  incorporation.missing.forEach((choice, index) => {
    const key = gapKey(choice);
    if (!missing.has(key)) errors.push({ path: `incorporation.missing.${index}`, message: `Missing reference ${choice.target} is unknown`, expected: 'an exact captured missing reference' });
    if (judged.has(key)) errors.push({ path: `incorporation.missing.${index}`, message: 'Duplicate missing-reference judgment', expected: 'one judgment per missing reference' });
    judged.add(key);
    if (choice.judgment === 'required') errors.push({ path: `incorporation.missing.${index}`, message: `Required document ${choice.target} is unavailable`, expected: 'the source document before analysis acceptance' });
  });
  for (const [key, gap] of missing) if (!judged.has(key)) errors.push({ path: 'incorporation.missing', message: `No judgment for ${gap.target}`, expected: 'required, unclear or advisory judgment' });
  return errors;
}

function planDocuments(manifest: DocumentManifest): string[] {
  return manifest.documents.filter(document => document.kind === 'plan').map(document => document.id);
}

/** `<index>.<field>: message` from the catalog, as a submission error under `at`. */
function toError(at: string, error: string): SubmissionError {
  const split = error.indexOf(': ');
  const path = split < 0 ? at : error.slice(0, split);
  return { path: at === '' || path.startsWith(`${at}.`) ? path : `${at}.${path}`, message: split < 0 ? error : error.slice(split + 2) };
}

// The messages

export interface ExtractionInputs {
  readonly planId: string;
  readonly manifest: DocumentManifest;
  readonly bytes: ReadonlyMap<string, Uint8Array>;
  readonly runDirectory: string;
}

function capturedFile(inputs: ExtractionInputs, id: string): string {
  const document = inputs.manifest.documents.find(item => item.id === id)!;
  return `${document.id} (${document.kind}): ${document.path}; captured file ${join(inputs.runDirectory, document.storedAt)}`;
}

export function intakeMessage(inputs: ExtractionInputs): string {
  const plans = inputs.manifest.documents.filter(document => document.kind === 'plan');
  return [
    `# Intake of plan "${inputs.planId}"`, '',
    'Read each captured plan document in full at its captured file:', '',
    ...plans.map(document => `- ${capturedFile(inputs, document.id)}`), '',
    'Scenario blocks the harness found in each plan document:', '',
    ...plans.map(document => {
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(inputs.bytes.get(document.id)!);
      const found = extractPlanScenarios(text, document.id).scenarios;
      return `- ${document.id}: ${found.length === 0 ? 'none' : found.map(scenario => `${scenario.name} (lines ${scenario.lines[0]}–${scenario.lines[1]})`).join('; ')}`;
    }),
    ...(inputs.manifest.missing.length === 0 ? ['', 'Missing references to judge: none.'] : ['', 'Missing references to judge:', '',
      ...inputs.manifest.missing.map(gap => `- From ${gap.from}, bytes ${gap.source.start}–${gap.source.end}: ${gap.target}; ${gap.reason}`)]),
    '', `Submit with \`${intakeToolName}\`.`,
  ].join('\n');
}

export function principleMessage(inputs: ExtractionInputs, document: string, goal: string): string {
  return [
    `# Fixed requirements for plan "${inputs.planId}"`, '',
    'The plan\'s goal, as the intake read it:', '',
    goal.split('\n').map(line => `> ${line}`).join('\n'), '',
    'Read this principles document in full at its captured file:', '',
    `- ${capturedFile(inputs, document)}`, '',
    `Submit with \`${principleToolName}\`.`,
  ].join('\n');
}

export function checkMessage(inputs: ExtractionInputs, document: string, state: CheckState): string {
  const ids = state.catalog.elements.filter(element => element.document === document).map(element => element.id);
  const rendered = createPackage({ catalog: state.catalog, planDeviations: [], elements: ids, deviations: [] });
  if ('unavailable' in rendered) throw new Error(`The catalog cannot render its own elements: ${rendered.unavailable.missing.join(', ')}`);
  const cited = new Set(ids);
  const plan = inputs.manifest.documents.find(item => item.id === document)?.kind === 'plan';
  const entries = state.analysis.entries.filter(entry => [...entry.requirementRefs, ...entry.acceptanceRefs, ...entry.contextRefs].some(id => cited.has(id)));
  const scenarios = state.analysis.scenarios.filter(scenario => (scenario.refs ?? []).some(id => cited.has(id)));
  return [
    `# Check the reading of ${document}`, '',
    'Read the document in full at its captured file:', '',
    `- ${capturedFile(inputs, document)}`, '',
    ids.length === 0 ? 'No element was read from it.' : `The ${ids.length === 1 ? 'element' : `${ids.length} elements`} read from it, as every later reader receives them:`, '',
    ...(ids.length === 0 ? [] : [rendered.text]),
    ...(plan ? ['', '# The entries and scenarios that cite them', '',
      ...(entries.length === 0 ? ['None.'] : entries.map(entry =>
        `- Entry ${entry.capability}: ${entry.description} Requirements: ${entry.requirementRefs.join(', ') || 'none'}; acceptance: ${entry.acceptanceRefs.join(', ') || 'none'}; context: ${entry.contextRefs.join(', ') || 'none'}.`)),
      ...scenarios.map(scenario => `- Scenario ${scenario.key} of ${scenario.entry}: cites ${(scenario.refs ?? []).join(', ')}.`)] : []),
    '', `Submit with \`${checkToolName}\`; an empty \`corrections\` list says the reading is faithful.`,
  ].join('\n');
}
